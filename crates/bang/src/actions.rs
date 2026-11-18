use crate::{
    model::{CardId, CardKind, Character, PlayerId, Role},
    rules::effective_distance,
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
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
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
    ChooseCard {
        pending_id: PendingId,
        card: CardId,
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
        if own.character != Character::SidKetchum || own.health >= own.max_health {
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
                        if own.character == Character::PedroRamirez
                            && !state.discard_pile.is_empty() =>
                    {
                        Ok(())
                    }
                    DrawSource::Player(target)
                        if own.character == Character::JesseJones
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
            Action::ChooseCard { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::GeneralStore { pool, .. } if pool.contains(card) => Ok(()),
                    PendingKind::GeneralStore { .. } => Err(ActionError::InvalidCard),
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::Respond { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                let expected = response_kind(&frame.kind).ok_or(ActionError::WrongAction)?;
                if let Some(card) = card
                    && !own.accepts_response(held_kind(state, player, *card)?, expected)
                {
                    return Err(ActionError::WrongAction);
                }
                Ok(())
            }
            _ => Err(ActionError::WrongAction),
        };
    }
    match action {
        Action::Respond { .. }
        | Action::ChooseCard { .. }
        | Action::ChooseDrawSource { .. }
        | Action::KeepCards { .. }
        | Action::ChooseDrawResult { .. } => Err(ActionError::StalePending),
        Action::SidHeal { .. } => unreachable!("validated separately"),
        Action::Play { card, target } => {
            let kind = own.play_kind(held_kind(state, player, *card)?);
            match kind {
                CardKind::Bang | CardKind::Duel | CardKind::Jail => {
                    let target = target.ok_or(ActionError::InvalidTarget)?;
                    target_player(state, target)?;
                    if target == player {
                        return Err(ActionError::InvalidTarget);
                    }
                    if kind == CardKind::Bang {
                        if state.turn.bangs_played >= 1 && !own.unlimited_bangs() {
                            return Err(ActionError::BangLimit);
                        }
                        if effective_distance(state, player, target)? > own.weapon_range() {
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
                CardKind::Missed | CardKind::Panic | CardKind::CatBalou => {
                    Err(ActionError::WrongAction)
                }
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
            let target_player = &state.players[target.0];
            match selection {
                CardSelection::Hand
                    if target_player.hand.len() > usize::from(*target == player) =>
                {
                    Ok(())
                }
                CardSelection::InPlay(card) if target_player.in_play.contains(card) => Ok(()),
                _ => Err(ActionError::InvalidTarget),
            }
        }
        Action::EndTurn { discard } => {
            let excess = own.hand.len().saturating_sub(own.health.max(0) as usize);
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
