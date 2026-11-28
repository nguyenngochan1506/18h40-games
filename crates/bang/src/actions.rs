use crate::{
    model::{CardId, CardKind, Character, PlayerId, Role, Suit},
    rules::{effective_distance, table_active},
    state::{AttackKind, GameState, PendingId, PendingKind},
};
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardSelection {
    Hand,
    InPlay(CardId),
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DrawSource {
    Deck,
    Discard,
    Player(PlayerId),
    /// Pat Brennan: take one card from in front of a player instead of drawing.
    InPlay {
        player: PlayerId,
        card: CardId,
    },
}

/// Brawl: the card the user picks for one other player to discard.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrawlPick {
    pub target: PlayerId,
    pub selection: CardSelection,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    ChooseHandSlot {
        pending_id: PendingId,
        slot: u8,
    },
    FlipCheck {
        pending_id: PendingId,
    },
    FlipBarrel {
        pending_id: PendingId,
    },
    ChooseDrawSource {
        pending_id: PendingId,
        source: DrawSource,
    },
    KeepCards {
        pending_id: PendingId,
        cards: Vec<CardId>,
    },
    ChooseDrawResult {
        pending_id: PendingId,
        card: CardId,
    },
    SidHeal {
        /// The current own Dying id; None when healing outside that window.
        pending_id: Option<PendingId>,
        discard: [CardId; 2],
    },
    Play {
        card: CardId,
        target: Option<PlayerId>,
    },
    AffectCard {
        card: CardId,
        target: PlayerId,
        selection: CardSelection,
    },
    ChooseStoreSlot {
        pending_id: PendingId,
        slot: u8,
    },
    /// Dodge City: Springfield, Tequila or Whisky; `discard` is the extra hand card they cost.
    PlayWithDiscard {
        card: CardId,
        discard: CardId,
        target: Option<PlayerId>,
    },
    /// Dodge City: Rag Time, which costs an extra hand card.
    AffectWithDiscard {
        card: CardId,
        discard: CardId,
        target: PlayerId,
        selection: CardSelection,
    },
    /// Dodge City: Brawl, which costs an extra hand card and picks a card of every other player.
    Brawl {
        card: CardId,
        discard: CardId,
        picks: Vec<BrawlPick>,
    },
    /// Dodge City: use a green card that has been in front of you since an earlier turn.
    ActivateGreen {
        card: CardId,
        target: Option<PlayerId>,
        selection: Option<CardSelection>,
    },
    /// Chuck Wengam: lose a life (never the last) to draw 2 cards.
    ChuckDraw,
    /// José Delgado: discard a blue card from hand to draw 2 (twice per turn).
    JoseDelgado {
        card: CardId,
    },
    /// Doc Holyday: once per turn, discard two hand cards to shoot a BANG!.
    DocHolyday {
        cards: [CardId; 2],
        target: PlayerId,
    },
    /// Vulture Sam shared with Vera Custer: claim the next card of the eliminated player, a random
    /// hand card (`Hand`) or a table card (`InPlay`).
    VultureTake {
        pending_id: PendingId,
        selection: CardSelection,
    },
    /// Vera Custer: pick the player whose character ability she holds until her next turn.
    ChooseCopy {
        pending_id: PendingId,
        target: PlayerId,
    },
    Respond {
        pending_id: PendingId,
        card: Option<CardId>,
    },
    EndTurn {
        discard: Vec<CardId>,
    },
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionError {
    InvalidPlayerCount,
    InvalidSettings,
    UnknownPlayer,
    Eliminated,
    GameOver,
    NotYourDecision,
    WrongAction,
    StalePending,
    CardNotInHand,
    InvalidCard,
    InvalidTarget,
    OutOfRange,
    BangLimit,
    NotImplemented,
    InvalidDiscard,
    DuplicateInPlay,
}

fn held_kind(state: &GameState, player: PlayerId, card: CardId) -> Result<CardKind, ActionError> {
    if !state.players[player.0].hand.contains(&card) {
        return Err(ActionError::CardNotInHand);
    }
    Ok(card.card().ok_or(ActionError::InvalidCard)?.kind)
}

fn target_player(state: &GameState, target: PlayerId) -> Result<(), ActionError> {
    if state.players.get(target.0).is_some_and(|p| p.alive) {
        Ok(())
    } else {
        Err(ActionError::InvalidTarget)
    }
}

/// Apache Kid ignores diamond cards played by others (not in a Duel). `suits` are the suits of the
/// cards that make the effect; a two-card effect only hits him if one of them is not a diamond.
pub(crate) fn apache_immune(
    state: &GameState,
    source: PlayerId,
    target: PlayerId,
    suits: &[Suit],
) -> bool {
    source != target
        && state.players[target.0].has(Character::ApacheKid)
        && suits.iter().all(|suit| *suit == Suit::Diamonds)
}

fn suit_of(card: CardId) -> Result<Suit, ActionError> {
    Ok(card.card().ok_or(ActionError::InvalidCard)?.suit)
}

fn check_selection(
    state: &GameState,
    player: PlayerId,
    target: PlayerId,
    selection: CardSelection,
    hand_removed: usize,
) -> Result<(), ActionError> {
    target_player(state, target)?;
    let target_player = &state.players[target.0];
    let hand = target_player
        .hand
        .len()
        .saturating_sub(if target == player { hand_removed } else { 0 });
    match selection {
        CardSelection::Hand if hand > 0 => Ok(()),
        CardSelection::InPlay(card) if target_player.in_play.contains(&card) => Ok(()),
        _ => Err(ActionError::InvalidTarget),
    }
}

/// `card` must be another hand card than `played`.
fn extra_discard(
    state: &GameState,
    player: PlayerId,
    played: CardId,
    discard: CardId,
) -> Result<(), ActionError> {
    if played == discard {
        return Err(ActionError::InvalidDiscard);
    }
    held_kind(state, player, discard)?;
    Ok(())
}

fn shoot_target(
    state: &GameState,
    player: PlayerId,
    target: Option<PlayerId>,
    suits: &[Suit],
    range: Option<u16>,
) -> Result<(), ActionError> {
    let target = target.ok_or(ActionError::InvalidTarget)?;
    target_player(state, target)?;
    if target == player || apache_immune(state, player, target, suits) {
        return Err(ActionError::InvalidTarget);
    }
    if let Some(range) = range
        && effective_distance(state, player, target)? > range
    {
        return Err(ActionError::OutOfRange);
    }
    Ok(())
}

pub(crate) fn response_kind(frame: &PendingKind) -> Option<CardKind> {
    match frame {
        PendingKind::AttackResponse {
            kind: AttackKind::Indians,
            ..
        }
        | PendingKind::Duel { .. } => Some(CardKind::Bang),
        PendingKind::AttackResponse { .. } => Some(CardKind::Missed),
        PendingKind::Dying { .. } => Some(CardKind::Beer),
        _ => None,
    }
}

pub(crate) fn validate(
    state: &GameState,
    player: PlayerId,
    action: &Action,
) -> Result<(), ActionError> {
    if state.winner.is_some() {
        return Err(ActionError::GameOver);
    }
    let own = state
        .players
        .get(player.0)
        .ok_or(ActionError::UnknownPlayer)?;
    if !own.alive {
        return Err(ActionError::Eliminated);
    }
    if let Action::SidHeal {
        pending_id,
        discard,
    } = action
    {
        if !own.has(Character::SidKetchum) || own.health >= own.max_health {
            return Err(ActionError::WrongAction);
        }
        let dying_id = state
            .pending
            .last()
            .filter(
                |frame| matches!(frame.kind, PendingKind::Dying { player: p, .. } if p == player),
            )
            .map(|frame| frame.id);
        if *pending_id != dying_id {
            return Err(ActionError::StalePending);
        }
        if discard[0] == discard[1] {
            return Err(ActionError::InvalidDiscard);
        }
        for card in discard {
            held_kind(state, player, *card)?;
        }
        return Ok(());
    }
    if state.decision().map(|d| d.player) != Some(player) {
        return Err(ActionError::NotYourDecision);
    }
    if let Some(frame) = state.pending.last() {
        return match action {
            Action::ChooseHandSlot { pending_id, slot } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::PickHandSlot { target, slots, .. } => {
                        target_player(state, *target)?;
                        if slots
                            .get(usize::from(*slot))
                            .is_some_and(|card| state.players[target.0].hand.contains(card))
                        {
                            Ok(())
                        } else {
                            Err(ActionError::InvalidCard)
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::FlipCheck { pending_id } | Action::FlipBarrel { pending_id } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match (action, &frame.kind) {
                    (Action::FlipCheck { .. }, PendingKind::Check { .. }) => Ok(()),
                    (
                        Action::FlipBarrel { .. },
                        PendingKind::AttackResponse { checks_left, .. },
                    ) if *checks_left > 0 => Ok(()),
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::ChooseDrawSource { pending_id, source } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                if !matches!(frame.kind, PendingKind::DrawChoice { .. }) {
                    return Err(ActionError::WrongAction);
                }
                match source {
                    DrawSource::Deck => Ok(()),
                    DrawSource::Discard
                        if own.has(Character::PedroRamirez) && !state.discard_pile.is_empty() =>
                    {
                        Ok(())
                    }
                    DrawSource::InPlay { player: from, card }
                        if own.has(Character::PatBrennan)
                            && state
                                .players
                                .get(from.0)
                                .is_some_and(|p| p.alive && p.in_play.contains(card)) =>
                    {
                        Ok(())
                    }
                    DrawSource::Player(target)
                        if own.has(Character::JesseJones)
                            && *target != player
                            && state
                                .players
                                .get(target.0)
                                .is_some_and(|p| p.alive && !p.hand.is_empty()) =>
                    {
                        Ok(())
                    }
                    _ => Err(ActionError::InvalidTarget),
                }
            }
            Action::KeepCards { pending_id, cards } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                let PendingKind::KeepCards { pool, keep, .. } = &frame.kind else {
                    return Err(ActionError::WrongAction);
                };
                if cards.len() != *keep
                    || cards
                        .iter()
                        .enumerate()
                        .any(|(i, c)| !pool.contains(c) || cards[..i].contains(c))
                {
                    Err(ActionError::InvalidCard)
                } else {
                    Ok(())
                }
            }
            Action::ChooseDrawResult { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::ChooseDrawResult { pool, .. } if pool.contains(card) => Ok(()),
                    PendingKind::ChooseDrawResult { .. } => Err(ActionError::InvalidCard),
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::ChooseStoreSlot { pending_id, slot } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::GeneralStore { pool, .. } if usize::from(*slot) < pool.len() => {
                        Ok(())
                    }
                    PendingKind::GeneralStore { .. } => Err(ActionError::InvalidCard),
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::VultureTake {
                pending_id,
                selection,
            } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                let PendingKind::VultureSplit { pool, hand_len, .. } = &frame.kind else {
                    return Err(ActionError::WrongAction);
                };
                match selection {
                    CardSelection::Hand if *hand_len > 0 => Ok(()),
                    CardSelection::InPlay(card) if pool[*hand_len..].contains(card) => Ok(()),
                    _ => Err(ActionError::InvalidCard),
                }
            }
            Action::ChooseCopy { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                if !matches!(frame.kind, PendingKind::ChooseCopy { .. }) {
                    return Err(ActionError::WrongAction);
                }
                if *target != player && state.players.get(target.0).is_some_and(|p| p.alive) {
                    Ok(())
                } else {
                    Err(ActionError::InvalidTarget)
                }
            }
            Action::Respond { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                let expected = response_kind(&frame.kind).ok_or(ActionError::WrongAction)?;
                if let Some(card) = card {
                    if own.in_play.contains(card) {
                        // Only a ready green Missed! card, answering a Missed! request.
                        let kind = card.card().ok_or(ActionError::InvalidCard)?.kind;
                        if expected != CardKind::Missed
                            || !kind.green_missed()
                            || !own.green_answers().any(|id| id == *card)
                            || !table_active(state, player)
                        {
                            return Err(ActionError::WrongAction);
                        }
                    } else if !own.accepts_response(held_kind(state, player, *card)?, expected) {
                        return Err(ActionError::WrongAction);
                    }
                }
                Ok(())
            }
            _ => Err(ActionError::WrongAction),
        };
    }
    match action {
        Action::ChooseHandSlot { .. }
        | Action::FlipCheck { .. }
        | Action::FlipBarrel { .. }
        | Action::Respond { .. }
        | Action::ChooseStoreSlot { .. }
        | Action::ChooseDrawSource { .. }
        | Action::KeepCards { .. }
        | Action::ChooseCopy { .. }
        | Action::VultureTake { .. }
        | Action::ChooseDrawResult { .. } => Err(ActionError::StalePending),
        Action::SidHeal { .. } => unreachable!("validated separately"),
        Action::Play { card, target } => {
            let kind = own.play_kind(held_kind(state, player, *card)?);
            match kind {
                CardKind::Bang | CardKind::Duel | CardKind::Jail | CardKind::Punch => {
                    let target = target.ok_or(ActionError::InvalidTarget)?;
                    target_player(state, target)?;
                    if target == player {
                        return Err(ActionError::InvalidTarget);
                    }
                    if kind != CardKind::Duel
                        && apache_immune(state, player, target, &[suit_of(*card)?])
                    {
                        return Err(ActionError::InvalidTarget);
                    }
                    if kind == CardKind::Bang {
                        if state.turn.bangs_played >= 1 && !own.unlimited_bangs() {
                            return Err(ActionError::BangLimit);
                        }
                        if effective_distance(state, player, target)? > own.weapon_range() {
                            return Err(ActionError::OutOfRange);
                        }
                    } else if kind == CardKind::Punch {
                        if effective_distance(state, player, target)? > 1 {
                            return Err(ActionError::OutOfRange);
                        }
                    } else if kind == CardKind::Jail {
                        if state.players[target.0].role == Role::Sheriff {
                            return Err(ActionError::InvalidTarget);
                        }
                        if state.players[target.0].has_in_play(kind) {
                            return Err(ActionError::DuplicateInPlay);
                        }
                    }
                    Ok(())
                }
                CardKind::Missed
                | CardKind::Dodge
                | CardKind::Panic
                | CardKind::CatBalou
                | CardKind::RagTime
                | CardKind::Brawl
                | CardKind::Springfield
                | CardKind::Tequila
                | CardKind::Whisky => Err(ActionError::WrongAction),
                _ => {
                    if target.is_some_and(|target| target != player) {
                        return Err(ActionError::InvalidTarget);
                    }
                    if kind.is_equipment() && own.has_in_play(kind) {
                        return Err(ActionError::DuplicateInPlay);
                    }
                    Ok(())
                }
            }
        }
        Action::PlayWithDiscard {
            card,
            discard,
            target,
        } => {
            let kind = held_kind(state, player, *card)?;
            extra_discard(state, player, *card, *discard)?;
            match kind {
                CardKind::Springfield => {
                    shoot_target(state, player, *target, &[suit_of(*card)?], None)
                }
                CardKind::Tequila => {
                    target_player(state, target.ok_or(ActionError::InvalidTarget)?)
                }
                CardKind::Whisky if target.is_none_or(|target| target == player) => Ok(()),
                CardKind::Whisky => Err(ActionError::InvalidTarget),
                _ => Err(ActionError::WrongAction),
            }
        }
        Action::AffectWithDiscard {
            card,
            discard,
            target,
            selection,
        } => {
            if held_kind(state, player, *card)? != CardKind::RagTime {
                return Err(ActionError::WrongAction);
            }
            extra_discard(state, player, *card, *discard)?;
            check_selection(state, player, *target, *selection, 2)?;
            if apache_immune(state, player, *target, &[suit_of(*card)?]) {
                return Err(ActionError::InvalidTarget);
            }
            Ok(())
        }
        Action::Brawl {
            card,
            discard,
            picks,
        } => {
            if held_kind(state, player, *card)? != CardKind::Brawl {
                return Err(ActionError::WrongAction);
            }
            extra_discard(state, player, *card, *discard)?;
            let suit = suit_of(*card)?;
            // One pick for every other living player that still has a card, nothing else.
            let required = state.players.iter().enumerate().filter(|(index, p)| {
                *index != player.0 && p.alive && !(p.hand.is_empty() && p.in_play.is_empty())
            });
            let mut expected = 0;
            for (index, _) in required {
                expected += 1;
                let id = PlayerId(index);
                let mut matching = picks.iter().filter(|pick| pick.target == id);
                let pick = matching.next().ok_or(ActionError::InvalidTarget)?;
                if matching.next().is_some() {
                    return Err(ActionError::InvalidTarget);
                }
                check_selection(state, player, id, pick.selection, 0)?;
                if apache_immune(state, player, id, &[suit]) {
                    return Err(ActionError::InvalidTarget);
                }
            }
            if picks.len() == expected {
                Ok(())
            } else {
                Err(ActionError::InvalidTarget)
            }
        }
        Action::ActivateGreen {
            card,
            target,
            selection,
        } => {
            let kind = card.card().ok_or(ActionError::InvalidCard)?.kind;
            if !own.ready_green().any(|id| id == *card) {
                return Err(ActionError::InvalidCard);
            }
            let suit = suit_of(*card)?;
            match kind {
                CardKind::Bible
                | CardKind::Canteen
                | CardKind::PonyExpress
                | CardKind::Howitzer => {
                    if target.is_some() || selection.is_some() {
                        Err(ActionError::InvalidTarget)
                    } else {
                        Ok(())
                    }
                }
                CardKind::CanCan | CardKind::Conestoga => {
                    let (Some(target), Some(selection)) = (target, selection) else {
                        return Err(ActionError::InvalidTarget);
                    };
                    check_selection(state, player, *target, *selection, 0)?;
                    // The card being spent is already leaving the table.
                    if apache_immune(state, player, *target, &[suit])
                        || (*target == player && *selection == CardSelection::InPlay(*card))
                    {
                        return Err(ActionError::InvalidTarget);
                    }
                    Ok(())
                }
                CardKind::Derringer
                | CardKind::Knife
                | CardKind::Pepperbox
                | CardKind::BuffaloRifle
                    if selection.is_some() =>
                {
                    Err(ActionError::InvalidTarget)
                }
                CardKind::Derringer | CardKind::Knife => {
                    shoot_target(state, player, *target, &[suit], Some(1))
                }
                CardKind::Pepperbox => {
                    shoot_target(state, player, *target, &[suit], Some(own.weapon_range()))
                }
                CardKind::BuffaloRifle => shoot_target(state, player, *target, &[suit], None),
                // Missed! cards only work as a response.
                _ => Err(ActionError::WrongAction),
            }
        }
        Action::ChuckDraw => {
            if own.has(Character::ChuckWengam) && own.health > 1 {
                Ok(())
            } else {
                Err(ActionError::WrongAction)
            }
        }
        Action::JoseDelgado { card } => {
            if !own.has(Character::JoseDelgado) || state.skill_uses.jose_delgado >= 2 {
                return Err(ActionError::WrongAction);
            }
            if held_kind(state, player, *card)?.is_blue() {
                Ok(())
            } else {
                Err(ActionError::InvalidCard)
            }
        }
        Action::DocHolyday { cards, target } => {
            if !own.has(Character::DocHolyday) || state.skill_uses.doc_holyday {
                return Err(ActionError::WrongAction);
            }
            if cards[0] == cards[1] {
                return Err(ActionError::InvalidDiscard);
            }
            for card in cards {
                held_kind(state, player, *card)?;
            }
            let suits = [suit_of(cards[0])?, suit_of(cards[1])?];
            shoot_target(
                state,
                player,
                Some(*target),
                &suits,
                Some(own.weapon_range()),
            )
        }
        Action::AffectCard {
            card,
            target,
            selection,
        } => {
            let kind = held_kind(state, player, *card)?;
            if !matches!(kind, CardKind::Panic | CardKind::CatBalou) {
                return Err(ActionError::WrongAction);
            }
            target_player(state, *target)?;
            if kind == CardKind::Panic && effective_distance(state, player, *target)? > 1 {
                return Err(ActionError::OutOfRange);
            }
            if apache_immune(state, player, *target, &[suit_of(*card)?]) {
                return Err(ActionError::InvalidTarget);
            }
            check_selection(state, player, *target, *selection, 1)
        }
        Action::EndTurn { discard } => {
            let excess = own.hand.len().saturating_sub(own.hand_limit());
            if discard.len() != excess {
                return Err(ActionError::InvalidDiscard);
            }
            for (index, card) in discard.iter().enumerate() {
                if !own.hand.contains(card) || discard[..index].contains(card) {
                    return Err(ActionError::InvalidDiscard);
                }
            }
            Ok(())
        }
    }
}
