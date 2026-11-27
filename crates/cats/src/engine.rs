use crate::{
    actions::{Action, ActionError, held_kind},
    deck,
    events::{Event, EventKind},
    model::{CardId, CardKind, CardView, PlayerId, Settings},
    state::{IllTakeThatTrap, LastAction, PendingKind, PlayedAction, State, TurnState},
};
use rand::{
    Rng,
    seq::{IndexedRandom, SliceRandom},
};
use std::collections::BTreeSet;

const MIN_PLAYERS: usize = 2;
const MAX_PLAYERS: usize = 8;

pub fn setup<R: Rng + ?Sized>(
    player_count: usize,
    settings: Settings,
    rng: &mut R,
) -> Result<(State, Vec<Event>), ActionError> {
    if !(MIN_PLAYERS..=MAX_PLAYERS).contains(&player_count) {
        return Err(ActionError::InvalidPlayerCount);
    }
    let (hands, deck, tower_stash) = deck::deal(player_count, &settings, rng);
    let players = hands
        .into_iter()
        .map(|hand| crate::state::Player {
            hand,
            marked_cards: Vec::new(),
            cursed: false,
            barking_front: None,
            ill_take_that: None,
            eliminated: false,
        })
        .collect();
    let starting_player = PlayerId(rng.random_range(0..player_count));
    let state = State {
        settings,
        players,
        deck,
        discard: Vec::new(),
        removed: Vec::new(),
        tower_stash,
        tower_owner: None,
        face_up: BTreeSet::new(),
        imploding_face_up: false,
        turn: TurnState {
            player: starting_player,
            turns_left: 1,
            direction: 1,
        },
        pending: Vec::new(),
        winner: None,
        last_action: None,
        next_id: 1,
    };
    let mut events = vec![
        Event::public(EventKind::GameStarted { starting_player }),
        Event::public(EventKind::TurnStarted {
            player: starting_player,
            turns_left: 1,
        }),
    ];
    events.push(Event::public(EventKind::DecisionChanged {
        decision: state.decision(),
    }));
    Ok((state, events))
}

pub fn decision(state: &State) -> Option<crate::state::Decision> {
    state.decision()
}

pub fn apply<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    action: Action,
    rng: &mut R,
) -> Result<Vec<Event>, ActionError> {
    validate(state, player, &action)?;
    let mut events = Vec::new();
    match action {
        Action::Draw => draw_from_deck(state, player, false, rng, &mut events),
        Action::PlayCard { card } => play_card(state, player, card, rng, &mut events),
        Action::PlayBlind { slot } => play_blind(state, player, slot, rng, &mut events),
        Action::ChooseBlindCard { slot, .. } => {
            choose_blind_card(state, player, slot, rng, &mut events)
        }
        Action::PlayPair { cards } => play_pair(state, player, &cards, &mut events),
        Action::PlayTriple { cards } => play_triple(state, player, &cards, &mut events),
        Action::PlayFive { cards } => play_five(state, player, &cards, &mut events),
        Action::Nope { pending_id } => nope(state, player, pending_id, &mut events),
        Action::Defuse { position, .. } => defuse(state, player, position, &mut events),
        Action::InsertImploding { position, .. } => {
            insert_imploding(state, player, position, &mut events)
        }
        Action::BuryCard { position, .. } => bury_card(state, player, position, &mut events),
        Action::AttackTarget { target, .. } => attack_target(state, player, target, &mut events),
        Action::FavourTarget { target, .. } => {
            favour_target(state, player, target, rng, &mut events)
        }
        Action::FavourCard { card, .. } => favour_card(state, player, card, &mut events),
        Action::RandomTarget { target, .. } => {
            random_target(state, player, target, rng, &mut events)
        }
        Action::StealTarget { target, .. } => steal_target(state, player, target, rng, &mut events),
        Action::StealKind { kind, .. } => steal_kind(state, kind, &mut events),
        Action::TakeDiscard { card, .. } => take_discard(state, player, card, &mut events),
        Action::ReorderFuture { order, .. } => reorder_future(state, player, &order, &mut events),
        Action::PutCardInDeck { card, .. } => {
            put_card_in_deck(state, player, card, rng, &mut events)
        }
        Action::MarkTarget { target, .. } => mark_target(state, player, target, rng, &mut events),
        Action::CurseTarget { target, .. } => curse_target(state, player, target, rng, &mut events),
        Action::IllTakeThatTarget { target, .. } => {
            ill_take_that_target(state, player, target, &mut events)
        }
        Action::BarkingTarget { target, .. } => barking_target(state, player, target, &mut events),
    }
    events.push(Event::public(EventKind::DecisionChanged {
        decision: state.decision(),
    }));
    Ok(events)
}

fn validate_combo_cards(
    hand: &[CardId],
    cards: &[CardId],
    expected_len: usize,
) -> Result<CardKind, ActionError> {
    if cards.len() != expected_len {
        return Err(ActionError::InvalidCombo);
    }
    let mut non_wild = Vec::with_capacity(expected_len);
    for (index, card) in cards.iter().enumerate() {
        if !hand.contains(card) || cards[..index].contains(card) {
            return Err(ActionError::CardNotInHand);
        }
        let Some(kind) = card.kind() else {
            return Err(ActionError::InvalidCard);
        };
        if !kind.is_combo_cat() {
            return Err(ActionError::InvalidCombo);
        }
        if kind.is_cat() {
            non_wild.push(kind);
        }
    }
    match expected_len {
        2 | 3 => {
            let first = non_wild.first().copied();
            if let Some(target_kind) = first {
                if non_wild.iter().all(|kind| *kind == target_kind) {
                    Ok(target_kind)
                } else {
                    Err(ActionError::InvalidCombo)
                }
            } else {
                Ok(CardKind::FeralCat)
            }
        }
        5 => {
            let mut unique = Vec::with_capacity(5);
            for kind in non_wild {
                if unique.contains(&kind) {
                    return Err(ActionError::InvalidCombo);
                }
                unique.push(kind);
            }
            Ok(CardKind::FeralCat)
        }
        _ => Err(ActionError::InvalidCombo),
    }
}

fn validate(state: &State, player: PlayerId, action: &Action) -> Result<(), ActionError> {
    if state.winner.is_some() {
        return Err(ActionError::GameOver);
    }
    let own = state
        .players
        .get(player.0)
        .ok_or(ActionError::UnknownPlayer)?;
    if own.eliminated {
        return Err(ActionError::Eliminated);
    }

    if let Action::Nope { pending_id } = action {
        if own.cursed {
            return Err(ActionError::WrongAction);
        }
        let last = state
            .last_action
            .as_ref()
            .ok_or(ActionError::NoNopeWindow)?;
        if !last.nopeable || last.id != *pending_id {
            return Err(ActionError::StalePending);
        }
        let has_usable_nope = own.hand.iter().any(|card| {
            card.kind() == Some(CardKind::Nope)
                && last
                    .history
                    .players
                    .get(player.0)
                    .is_some_and(|prev| prev.hand.contains(card))
        });
        if !has_usable_nope {
            return Err(ActionError::CardNotInHand);
        }
        return Ok(());
    }

    if let Some(frame) = state.pending.last() {
        if frame.player() != Some(player) {
            return Err(ActionError::NotYourDecision);
        }
        return match action {
            Action::ChooseBlindCard { pending_id, slot } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                if !own.cursed {
                    return Err(ActionError::WrongAction);
                }
                if *slot >= own.hand.len() {
                    return Err(ActionError::OutOfRange);
                }
                match &frame.kind {
                    PendingKind::FavourCard { target, .. } if *target == player => Ok(()),
                    PendingKind::GiveToDeck { queue, .. } if queue.first() == Some(&player) => {
                        Ok(())
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::Defuse {
                pending_id,
                position,
            } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::Defuse { player: owner, .. } if *owner == player => {
                        if *position > state.deck.len() {
                            Err(ActionError::OutOfRange)
                        } else {
                            Ok(())
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::InsertImploding {
                pending_id,
                position,
            } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::InsertImploding { player: owner, .. } if *owner == player => {
                        if *position > state.deck.len() {
                            Err(ActionError::OutOfRange)
                        } else {
                            Ok(())
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::BuryCard {
                pending_id,
                position,
            } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::BuryCard { player: owner, .. } if *owner == player => {
                        if *position > state.deck.len() {
                            Err(ActionError::OutOfRange)
                        } else {
                            Ok(())
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::AttackTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::AttackTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::FavourTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::FavourTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::FavourCard { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                if own.cursed {
                    return Err(ActionError::WrongAction);
                }
                match frame.kind {
                    PendingKind::FavourCard { target, .. } if target == player => {
                        if own.hand.contains(card) {
                            Ok(())
                        } else {
                            Err(ActionError::CardNotInHand)
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::RandomTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::RandomTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::StealTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::StealTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::StealKind { pending_id, kind } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::StealKind { actor, .. } if actor == player => {
                        if matches!(kind, CardKind::Exploding | CardKind::Imploding) {
                            Err(ActionError::InvalidCard)
                        } else {
                            Ok(())
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::TakeDiscard { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::TakeDiscard { actor } if actor == player => match card {
                        Some(card) if !state.discard.contains(card) => {
                            Err(ActionError::CardNotInHand)
                        }
                        _ => Ok(()),
                    },
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::ReorderFuture { pending_id, order } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::AlterFuture { actor, count, .. } if actor == player => {
                        let top: Vec<CardId> =
                            state.deck.iter().rev().take(count).copied().collect();
                        if order.len() != top.len() {
                            return Err(ActionError::InvalidCard);
                        }
                        for (index, card) in order.iter().enumerate() {
                            if !top.contains(card) || order[..index].contains(card) {
                                return Err(ActionError::InvalidCard);
                            }
                        }
                        Ok(())
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::PutCardInDeck { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                if own.cursed {
                    return Err(ActionError::WrongAction);
                }
                match &frame.kind {
                    PendingKind::GiveToDeck { queue, .. } if queue.first() == Some(&player) => {
                        if own.hand.contains(card) {
                            Ok(())
                        } else {
                            Err(ActionError::CardNotInHand)
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::MarkTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::MarkTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::CurseTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::CurseTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::IllTakeThatTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::IllTakeThatTarget { actor, .. } if actor == player => {
                        other_active(state, player, *target)?;
                        if state.players[target.0].ill_take_that.is_some() {
                            Err(ActionError::InvalidTarget)
                        } else {
                            Ok(())
                        }
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::BarkingTarget { pending_id, target } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match frame.kind {
                    PendingKind::BarkingTarget { actor } if actor == player => {
                        other_active(state, player, *target)
                    }
                    _ => Err(ActionError::WrongAction),
                }
            }
            _ => Err(ActionError::WrongAction),
        };
    }

    // Alter the Future (3x) NOW can be played by any active uncursed player during a turn!
    if let Action::PlayCard { card } = action
        && !own.cursed
        && held_kind(state, player, *card) == Ok(CardKind::AlterFutureNow)
    {
        return Ok(());
    }

    if state.turn.player != player {
        return Err(ActionError::NotYourDecision);
    }

    if own.cursed {
        return match action {
            Action::Draw => Ok(()),
            Action::PlayBlind { slot } => {
                if *slot < own.hand.len() {
                    Ok(())
                } else {
                    Err(ActionError::OutOfRange)
                }
            }
            _ => Err(ActionError::WrongAction),
        };
    }

    match action {
        Action::Draw => Ok(()),
        Action::PlayCard { card } => {
            let kind = held_kind(state, player, *card)?;
            if kind == CardKind::IllTakeThat && state.first_ill_take_that_target(player).is_none() {
                return Err(ActionError::InvalidTarget);
            }
            if kind.is_playable_single() {
                Ok(())
            } else {
                Err(ActionError::WrongAction)
            }
        }
        Action::PlayPair { cards } => validate_combo_cards(&own.hand, cards, 2).map(|_| ()),
        Action::PlayTriple { cards } => validate_combo_cards(&own.hand, cards, 3).map(|_| ()),
        Action::PlayFive { cards } => validate_combo_cards(&own.hand, cards, 5).map(|_| ()),
        Action::PlayBlind { .. } | Action::ChooseBlindCard { .. } => Err(ActionError::WrongAction),
        Action::Nope { .. } => unreachable!("handled above"),
        Action::Defuse { .. }
        | Action::InsertImploding { .. }
        | Action::BuryCard { .. }
        | Action::AttackTarget { .. }
        | Action::FavourTarget { .. }
        | Action::FavourCard { .. }
        | Action::RandomTarget { .. }
        | Action::StealTarget { .. }
        | Action::StealKind { .. }
        | Action::TakeDiscard { .. }
        | Action::ReorderFuture { .. }
        | Action::PutCardInDeck { .. }
        | Action::MarkTarget { .. }
        | Action::CurseTarget { .. }
        | Action::IllTakeThatTarget { .. }
        | Action::BarkingTarget { .. } => Err(ActionError::StalePending),
    }
}

fn other_active(state: &State, player: PlayerId, target: PlayerId) -> Result<(), ActionError> {
    if target == player || !state.is_active(target) {
        Err(ActionError::InvalidTarget)
    } else {
        Ok(())
    }
}

/// Captures undo snapshot AFTER played cards have been moved to discard, so
/// Noping an action keeps the played card(s) in discard per official rules.
fn begin_action(state: &mut State, actor: PlayerId, played: PlayedAction) {
    let history = state.capture();
    let id = state.new_id();
    state.last_action = Some(LastAction {
        id,
        actor,
        played,
        nopeable: true,
        history,
    });
}

fn lift_curse(state: &mut State, player: PlayerId, events: &mut Vec<Event>) {
    if state.players[player.0].cursed {
        state.players[player.0].cursed = false;
        events.push(Event::public(EventKind::CurseLifted { player }));
    }
}

/// If `victim` wears the Tower of Power crown and still has Stash cards,
/// redirects any steal attempt to draw blindly from the Stash instead of `victim`'s hand.
fn steal_from_tower_stash<R: Rng + ?Sized>(
    state: &mut State,
    victim: PlayerId,
    actor: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) -> bool {
    if state.tower_owner != Some(victim) || state.tower_stash.is_empty() {
        return false;
    }
    let Some(card) = deck::take_random(&mut state.tower_stash, rng) else {
        return false;
    };
    state.players[actor.0].hand.push(card);
    events.push(Event::public(EventKind::TowerBlocked { victim, actor }));
    if let Some(view) = CardView::new(card) {
        events.push(Event::private(
            actor,
            EventKind::CardReceived {
                player: actor,
                from: victim,
                card: view,
            },
        ));
    }
    check_unprotected_exploding(state, actor, events);
    true
}

fn pop_deck_card<R: Rng + ?Sized>(
    state: &mut State,
    from_bottom: bool,
    rng: &mut R,
    events: &mut Vec<Event>,
) -> Option<CardId> {
    if state.deck.is_empty() && !state.discard.is_empty() {
        let mut pile = std::mem::take(&mut state.discard);
        pile.shuffle(rng);
        let count = pile.len();
        state.deck = pile;
        events.push(Event::public(EventKind::DeckReshuffled { count }));
    }
    if state.deck.is_empty() {
        return None;
    }
    let card = if from_bottom {
        state.deck.remove(0)
    } else {
        state.deck.pop()?
    };
    if card.kind() != Some(CardKind::Imploding) {
        state.face_up.remove(&card);
    }
    Some(card)
}

fn can_streak_protect(state: &State, player: PlayerId) -> bool {
    let hand = &state.players[player.0].hand;
    let has_streaking = hand
        .iter()
        .any(|card| card.kind() == Some(CardKind::Streaking));
    let held_exploding = hand
        .iter()
        .filter(|card| card.kind() == Some(CardKind::Exploding))
        .count();
    has_streaking && held_exploding == 0
}

fn trigger_exploding(
    state: &mut State,
    player: PlayerId,
    card: CardId,
    end_turn: bool,
    events: &mut Vec<Event>,
) {
    state.last_action = None;
    events.push(Event::public(EventKind::ExplodingDrawn { player }));
    let defuse = state.players[player.0]
        .hand
        .iter()
        .copied()
        .find(|held| held.kind() == Some(CardKind::Defuse));
    if let Some(defuse) = defuse {
        state.remove_from_hand(player, defuse);
        state.discard(defuse);
        events.push(Event::public(EventKind::CardPlayed {
            player,
            kind: CardKind::Defuse,
        }));
        state.push_pending(PendingKind::Defuse {
            player,
            exploding: card,
            end_turn,
        });
    } else {
        eliminate(state, player, card, events);
    }
}

/// Resolves a Barking Kitten blast on `target`: they must discard a Defuse or explode.
/// `lethal_card` is currently in `state.discard`; if they explode, it is moved to `removed`.
fn resolve_barking_blast(
    state: &mut State,
    actor: PlayerId,
    target: PlayerId,
    lethal_card: CardId,
    events: &mut Vec<Event>,
) {
    state.last_action = None;
    events.push(Event::public(EventKind::BarkingTriggered { actor, target }));
    let defuse = state.players[target.0]
        .hand
        .iter()
        .copied()
        .find(|held| held.kind() == Some(CardKind::Defuse));
    if let Some(defuse) = defuse {
        state.remove_from_hand(target, defuse);
        state.discard(defuse);
        events.push(Event::public(EventKind::CardPlayed {
            player: target,
            kind: CardKind::Defuse,
        }));
        events.push(Event::public(EventKind::Defused {
            player: target,
            position: 0,
        }));
    } else {
        if let Some(pos) = state.discard.iter().position(|c| *c == lethal_card) {
            state.discard.remove(pos);
        }
        eliminate(state, target, lethal_card, events);
    }
}

/// Checks if a player holds an Exploding Kitten without Streaking protection
/// (e.g., after losing Streaking or receiving an Exploding via Favour/Steal).
fn check_unprotected_exploding(state: &mut State, player: PlayerId, events: &mut Vec<Event>) {
    if !state.is_active(player) || state.winner.is_some() {
        return;
    }
    let hand = &state.players[player.0].hand;
    let has_streaking = hand
        .iter()
        .any(|card| card.kind() == Some(CardKind::Streaking));
    let allowed = usize::from(has_streaking);
    let exploding_count = hand
        .iter()
        .filter(|card| card.kind() == Some(CardKind::Exploding))
        .count();
    if exploding_count > allowed {
        let index = state.players[player.0]
            .hand
            .iter()
            .position(|card| card.kind() == Some(CardKind::Exploding))
            .expect("excess exploding card exists");
        let card = state.players[player.0].hand.remove(index);
        state.players[player.0]
            .marked_cards
            .retain(|marked| *marked != card);
        trigger_exploding(state, player, card, false, events);
    }
}

fn draw_from_deck<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    from_bottom: bool,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.last_action = None;

    // Check if an opponent placed "I'll Take That" in front of `player`.
    if let Some(trap) = state.players[player.0].ill_take_that.take() {
        state.discard(trap.card);
        if state.is_active(trap.owner) {
            if steal_from_tower_stash(state, player, trap.owner, rng, events) {
                // Tower of Power redirected the trap to Stash; victim still draws normally below!
            } else {
                let Some(card) = pop_deck_card(state, from_bottom, rng, events) else {
                    events.push(Event::public(EventKind::DeckEmpty));
                    lift_curse(state, player, events);
                    finish_turn(state, events);
                    return;
                };
                events.push(Event::public(EventKind::IllTakeThatTriggered {
                    owner: trap.owner,
                    victim: player,
                }));
                lift_curse(state, player, events);
                let kind = card.kind().expect("deck only holds valid cards");
                if kind == CardKind::Imploding {
                    if state.imploding_face_up {
                        events.push(Event::public(EventKind::ImplodingDrawn {
                            player: trap.owner,
                            face_up: true,
                        }));
                        state.face_up.remove(&card);
                        finish_turn(state, events);
                        eliminate(state, trap.owner, card, events);
                    } else {
                        state.imploding_face_up = true;
                        state.face_up.insert(card);
                        events.push(Event::public(EventKind::ImplodingDrawn {
                            player: trap.owner,
                            face_up: false,
                        }));
                        finish_turn(state, events);
                        state.push_pending(PendingKind::InsertImploding {
                            player: trap.owner,
                            card,
                            end_turn: false,
                        });
                    }
                    return;
                }
                if kind == CardKind::Exploding {
                    if can_streak_protect(state, trap.owner) {
                        state.players[trap.owner.0].hand.push(card);
                        if let Some(view) = CardView::new(card) {
                            events.push(Event::private(
                                trap.owner,
                                EventKind::CardReceived {
                                    player: trap.owner,
                                    from: player,
                                    card: view,
                                },
                            ));
                        }
                        finish_turn(state, events);
                    } else {
                        finish_turn(state, events);
                        trigger_exploding(state, trap.owner, card, false, events);
                    }
                    return;
                }
                state.players[trap.owner.0].hand.push(card);
                if let Some(view) = CardView::new(card) {
                    events.push(Event::private(
                        trap.owner,
                        EventKind::CardReceived {
                            player: trap.owner,
                            from: player,
                            card: view,
                        },
                    ));
                    events.push(Event::private(
                        player,
                        EventKind::CardGiven {
                            player,
                            to: trap.owner,
                            card: view,
                        },
                    ));
                }
                finish_turn(state, events);
                return;
            }
        }
    }

    let Some(card) = pop_deck_card(state, from_bottom, rng, events) else {
        events.push(Event::public(EventKind::DeckEmpty));
        lift_curse(state, player, events);
        finish_turn(state, events);
        return;
    };
    let kind = card.kind().expect("deck only holds valid cards");
    if kind == CardKind::Imploding {
        if state.imploding_face_up {
            events.push(Event::public(EventKind::ImplodingDrawn {
                player,
                face_up: true,
            }));
            state.face_up.remove(&card);
            eliminate(state, player, card, events);
        } else {
            state.imploding_face_up = true;
            state.face_up.insert(card);
            events.push(Event::public(EventKind::ImplodingDrawn {
                player,
                face_up: false,
            }));
            state.push_pending(PendingKind::InsertImploding {
                player,
                card,
                end_turn: true,
            });
        }
        return;
    }
    if kind == CardKind::Exploding {
        if can_streak_protect(state, player) {
            state.players[player.0].hand.push(card);
            events.push(Event::public(EventKind::CardsDrawn { player, count: 1 }));
            events.push(Event::private(
                player,
                EventKind::CardDrawn {
                    player,
                    card: CardView::new(card).expect("valid card"),
                },
            ));
            lift_curse(state, player, events);
            finish_turn(state, events);
        } else {
            trigger_exploding(state, player, card, true, events);
        }
        return;
    }
    state.players[player.0].hand.push(card);
    events.push(Event::public(EventKind::CardsDrawn { player, count: 1 }));
    events.push(Event::private(
        player,
        EventKind::CardDrawn {
            player,
            card: CardView::new(card).expect("valid card"),
        },
    ));
    lift_curse(state, player, events);
    finish_turn(state, events);
}

fn eliminate(state: &mut State, player: PlayerId, lethal_card: CardId, events: &mut Vec<Event>) {
    let hand = std::mem::take(&mut state.players[player.0].hand);
    state.players[player.0].marked_cards.clear();
    state.players[player.0].cursed = false;
    if let Some(front) = state.players[player.0].barking_front.take() {
        state.discard(front);
    }
    if let Some(trap) = state.players[player.0].ill_take_that.take() {
        state.discard(trap.card);
    }
    // Remove any I'll Take That traps that the eliminated player placed on others.
    let mut owned_traps = Vec::new();
    for entry in &mut state.players {
        if let Some(trap) = entry.ill_take_that
            && trap.owner == player
        {
            owned_traps.push(trap.card);
            entry.ill_take_that = None;
        }
    }
    for card in owned_traps {
        state.discard(card);
    }
    // Release Tower of Power stash if the eliminated player wore the crown.
    if state.tower_owner == Some(player) {
        state.tower_owner = None;
        let stash = std::mem::take(&mut state.tower_stash);
        for card in stash {
            state.discard(card);
        }
    }

    for card in hand {
        if matches!(card.kind(), Some(CardKind::Exploding | CardKind::Imploding)) {
            state.removed.push(card);
        } else {
            state.discard(card);
        }
    }
    state.players[player.0].eliminated = true;
    state.removed.push(lethal_card);
    events.push(Event::public(EventKind::PlayerEliminated { player }));
    if state.active_count() <= 1 {
        let winner = state
            .players
            .iter()
            .position(|entry| !entry.eliminated)
            .map(PlayerId);
        if let Some(winner) = winner {
            state.winner = Some(winner);
            state.pending.clear();
            events.push(Event::public(EventKind::Winner { player: winner }));
        }
        return;
    }
    if state.turn.player == player
        && let Some(next) = state.next_active(player)
    {
        state.turn = TurnState {
            player: next,
            turns_left: 1,
            direction: state.turn.direction,
        };
        events.push(Event::public(EventKind::TurnStarted {
            player: next,
            turns_left: 1,
        }));
    }
}

fn finish_turn(state: &mut State, events: &mut Vec<Event>) {
    if state.winner.is_some() {
        return;
    }
    if state.turn.turns_left > 1 {
        state.turn.turns_left -= 1;
        events.push(Event::public(EventKind::TurnStarted {
            player: state.turn.player,
            turns_left: state.turn.turns_left,
        }));
    } else if let Some(next) = state.next_active(state.turn.player) {
        state.turn = TurnState {
            player: next,
            turns_left: 1,
            direction: state.turn.direction,
        };
        events.push(Event::public(EventKind::TurnStarted {
            player: next,
            turns_left: 1,
        }));
    }
}

fn advance_to_next_player(state: &mut State, events: &mut Vec<Event>) {
    if state.winner.is_some() {
        return;
    }
    if let Some(next) = state.next_active(state.turn.player) {
        state.turn = TurnState {
            player: next,
            turns_left: 1,
            direction: state.turn.direction,
        };
        events.push(Event::public(EventKind::TurnStarted {
            player: next,
            turns_left: 1,
        }));
    }
}

fn play_blind<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    slot: usize,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let card = state.players[player.0].hand[slot];
    let kind = card.kind().expect("valid card in hand");
    let can_play = kind.is_playable_single()
        && !(kind == CardKind::IllTakeThat && state.first_ill_take_that_target(player).is_none());
    if can_play {
        play_card(state, player, card, rng, events);
        return;
    }
    // Official Curse of the Cat Butt rule: non-playable card played blind is wasted.
    state.last_action = None;
    state.remove_from_hand(player, card);
    if kind == CardKind::Exploding {
        trigger_exploding(state, player, card, false, events);
        return;
    }
    state.discard(card);
    if let Some(view) = CardView::new(card) {
        events.push(Event::public(EventKind::BlindCardWasted {
            player,
            card: view,
        }));
    }
    check_unprotected_exploding(state, player, events);
}

fn choose_blind_card<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    slot: usize,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let card = state.players[player.0].hand[slot];
    match state.pending.last().map(|frame| &frame.kind) {
        Some(PendingKind::FavourCard { .. }) => favour_card(state, player, card, events),
        Some(PendingKind::GiveToDeck { .. }) => put_card_in_deck(state, player, card, rng, events),
        _ => unreachable!("validated blind choice pending"),
    }
}

fn play_card<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    card: CardId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let kind = held_kind(state, player, card).expect("validated card");
    if kind == CardKind::BarkingKitten {
        play_barking_kitten(state, player, card, events);
        return;
    }

    state.remove_from_hand(player, card);
    state.discard(card);
    let nopeable = !matches!(kind, CardKind::DrawBottom | CardKind::Bury);
    if nopeable {
        begin_action(state, player, PlayedAction::Card { kind });
    } else {
        state.last_action = None;
    }
    events.push(Event::public(EventKind::CardPlayed { player, kind }));

    match kind {
        CardKind::Attack => {
            let remaining = state.turn.turns_left.saturating_sub(1);
            if let Some(next) = state.next_active(player) {
                state.turn = TurnState {
                    player: next,
                    turns_left: remaining.saturating_add(2),
                    direction: state.turn.direction,
                };
                events.push(Event::public(EventKind::TurnStarted {
                    player: next,
                    turns_left: state.turn.turns_left,
                }));
            }
        }
        CardKind::TargetedAttack => {
            state.push_pending(PendingKind::AttackTarget { actor: player });
        }
        CardKind::PersonalAttack => {
            state.turn.turns_left = state.turn.turns_left.saturating_add(2);
            events.push(Event::public(EventKind::TurnStarted {
                player,
                turns_left: state.turn.turns_left,
            }));
        }
        CardKind::Skip => finish_turn(state, events),
        CardKind::SuperSkip => advance_to_next_player(state, events),
        CardKind::Reverse => {
            state.turn.direction = -state.turn.direction;
            events.push(Event::public(EventKind::DirectionReversed {
                direction: state.turn.direction,
            }));
            finish_turn(state, events);
        }
        CardKind::DrawBottom => draw_from_deck(state, player, true, rng, events),
        CardKind::Shuffle => {
            state.clear_non_imploding_face_up();
            state.deck.shuffle(rng);
            events.push(Event::public(EventKind::DeckShuffled {
                count: state.deck.len(),
            }));
        }
        CardKind::SwapTopBottom => {
            let len = state.deck.len();
            if len >= 2 {
                state.deck.swap(0, len - 1);
            }
            events.push(Event::public(EventKind::DeckSwapped));
        }
        CardKind::SeeFuture | CardKind::SeeFuture5 => {
            let count = if kind == CardKind::SeeFuture5 { 5 } else { 3 };
            let cards = state
                .deck
                .iter()
                .rev()
                .take(count)
                .filter_map(|card| CardView::new(*card))
                .collect();
            events.push(Event::private(
                player,
                EventKind::FutureSeen { player, cards },
            ));
        }
        CardKind::AlterFuture
        | CardKind::AlterFuture5
        | CardKind::AlterFutureNow
        | CardKind::ShareFuture => {
            let max_count = if kind == CardKind::AlterFuture5 { 5 } else { 3 };
            let share_with_next = kind == CardKind::ShareFuture;
            let count = state.deck.len().min(max_count);
            if count >= 2 {
                state.push_pending(PendingKind::AlterFuture {
                    actor: player,
                    count,
                    share_with_next,
                });
            } else {
                let cards: Vec<CardView> = state
                    .deck
                    .iter()
                    .rev()
                    .take(count)
                    .filter_map(|card| CardView::new(*card))
                    .collect();
                events.push(Event::private(
                    player,
                    EventKind::FutureSeen {
                        player,
                        cards: cards.clone(),
                    },
                ));
                if share_with_next && let Some(next) = state.next_active(player) {
                    events.push(Event::public(EventKind::FutureShared {
                        actor: player,
                        target: next,
                        count,
                    }));
                    events.push(Event::private(
                        next,
                        EventKind::FutureSeen {
                            player: next,
                            cards,
                        },
                    ));
                }
            }
        }
        CardKind::Favour => {
            state.push_pending(PendingKind::FavourTarget { actor: player });
        }
        CardKind::Mark => {
            state.push_pending(PendingKind::MarkTarget { actor: player });
        }
        CardKind::CurseCatButt => {
            state.push_pending(PendingKind::CurseTarget { actor: player });
        }
        CardKind::IllTakeThat => {
            state.push_pending(PendingKind::IllTakeThatTarget {
                actor: player,
                card,
            });
        }
        CardKind::TowerOfPower => {
            state.tower_owner = Some(player);
            events.push(Event::public(EventKind::TowerClaimed {
                player,
                stash_count: state.tower_stash.len(),
            }));
        }
        CardKind::GarbageCollection | CardKind::Potluck => {
            let shuffle_after = kind == CardKind::GarbageCollection;
            let queue: Vec<PlayerId> = state
                .active_order_from(player)
                .into_iter()
                .filter(|id| !state.players[id.0].hand.is_empty())
                .collect();
            if !queue.is_empty() {
                state.push_pending(PendingKind::GiveToDeck {
                    queue,
                    shuffle_after,
                });
            } else if shuffle_after {
                state.clear_non_imploding_face_up();
                state.deck.shuffle(rng);
                events.push(Event::public(EventKind::DeckShuffled {
                    count: state.deck.len(),
                }));
            }
        }
        CardKind::CatomicBomb => {
            state.clear_non_imploding_face_up();
            let mut explodings = Vec::new();
            let mut remaining = Vec::with_capacity(state.deck.len());
            for deck_card in state.deck.drain(..) {
                if deck_card.kind() == Some(CardKind::Exploding) {
                    explodings.push(deck_card);
                } else {
                    remaining.push(deck_card);
                }
            }
            remaining.shuffle(rng);
            for exploding in &explodings {
                state.face_up.insert(*exploding);
            }
            let exploding_count = explodings.len();
            remaining.extend(explodings);
            state.deck = remaining;
            events.push(Event::public(EventKind::CatomicBombTriggered {
                player,
                exploding_count,
            }));
            finish_turn(state, events);
        }
        CardKind::Bury => {
            let Some(drawn) = pop_deck_card(state, false, rng, events) else {
                events.push(Event::public(EventKind::DeckEmpty));
                lift_curse(state, player, events);
                finish_turn(state, events);
                return;
            };
            if drawn.kind() == Some(CardKind::Imploding) {
                if state.imploding_face_up {
                    events.push(Event::public(EventKind::ImplodingDrawn {
                        player,
                        face_up: true,
                    }));
                    state.face_up.remove(&drawn);
                    eliminate(state, player, drawn, events);
                } else {
                    state.imploding_face_up = true;
                    state.face_up.insert(drawn);
                    events.push(Event::public(EventKind::ImplodingDrawn {
                        player,
                        face_up: false,
                    }));
                    state.push_pending(PendingKind::InsertImploding {
                        player,
                        card: drawn,
                        end_turn: true,
                    });
                }
                return;
            }
            if let Some(view) = CardView::new(drawn) {
                events.push(Event::private(
                    player,
                    EventKind::CardDrawn { player, card: view },
                ));
            }
            state.push_pending(PendingKind::BuryCard {
                player,
                card: drawn,
            });
        }
        _ => unreachable!("validated single-card action"),
    }
}

fn play_barking_kitten(state: &mut State, player: PlayerId, card: CardId, events: &mut Vec<Event>) {
    state.last_action = None;
    state.remove_from_hand(player, card);
    events.push(Event::public(EventKind::CardPlayed {
        player,
        kind: CardKind::BarkingKitten,
    }));

    // Case A: Another active player already has a face-up Barking Kitten in front of them.
    if let Some((other_idx, front_card)) = state.players.iter().enumerate().find_map(|(idx, p)| {
        (idx != player.0 && !p.eliminated)
            .then_some(p.barking_front.map(|front| (idx, front)))
            .flatten()
    }) {
        state.players[other_idx].barking_front = None;
        state.discard(front_card);
        state.discard(card);
        resolve_barking_blast(state, player, PlayerId(other_idx), card, events);
        return;
    }

    // Case B: Another active player holds the other Barking Kitten in their hand.
    if let Some((other_idx, other_card)) = state.players.iter().enumerate().find_map(|(idx, p)| {
        (idx != player.0 && !p.eliminated)
            .then(|| {
                p.hand
                    .iter()
                    .copied()
                    .find(|c| c.kind() == Some(CardKind::BarkingKitten))
                    .map(|c| (idx, c))
            })
            .flatten()
    }) {
        state.remove_from_hand(PlayerId(other_idx), other_card);
        state.discard(other_card);
        state.discard(card);
        resolve_barking_blast(state, player, PlayerId(other_idx), card, events);
        return;
    }

    // Case C: Actor also holds the second Barking Kitten (in hand or already face-up in front).
    if let Some(own_front) = state.players[player.0].barking_front.take() {
        state.discard(own_front);
        state.discard(card);
        state.push_pending(PendingKind::BarkingTarget { actor: player });
        return;
    }
    if let Some(second_in_hand) = state.players[player.0]
        .hand
        .iter()
        .copied()
        .find(|c| c.kind() == Some(CardKind::BarkingKitten))
    {
        state.remove_from_hand(player, second_in_hand);
        state.discard(second_in_hand);
        state.discard(card);
        state.push_pending(PendingKind::BarkingTarget { actor: player });
        return;
    }

    // Case D: Place face-up in front of actor, awaiting the second Barking Kitten.
    state.players[player.0].barking_front = Some(card);
    events.push(Event::public(EventKind::BarkingPlaced { player }));
}

fn barking_target(state: &mut State, player: PlayerId, target: PlayerId, events: &mut Vec<Event>) {
    state.pending.pop();
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    let lethal = state
        .discard
        .iter()
        .rev()
        .copied()
        .find(|c| c.kind() == Some(CardKind::BarkingKitten))
        .expect("barking card in discard");
    resolve_barking_blast(state, player, target, lethal, events);
}

fn play_pair(state: &mut State, player: PlayerId, cards: &[CardId], events: &mut Vec<Event>) {
    let kind = validate_combo_cards(&state.players[player.0].hand, cards, 2)
        .expect("validated pair combo");
    for card in cards {
        state.remove_from_hand(player, *card);
        state.discard(*card);
    }
    begin_action(state, player, PlayedAction::Combo { kind, count: 2 });
    events.push(Event::public(EventKind::ComboPlayed {
        player,
        kind,
        count: 2,
    }));
    state.push_pending(PendingKind::RandomTarget { actor: player });
}

fn play_triple(state: &mut State, player: PlayerId, cards: &[CardId], events: &mut Vec<Event>) {
    let kind = validate_combo_cards(&state.players[player.0].hand, cards, 3)
        .expect("validated triple combo");
    for card in cards {
        state.remove_from_hand(player, *card);
        state.discard(*card);
    }
    begin_action(state, player, PlayedAction::Combo { kind, count: 3 });
    events.push(Event::public(EventKind::ComboPlayed {
        player,
        kind,
        count: 3,
    }));
    state.push_pending(PendingKind::StealTarget { actor: player });
}

fn play_five(state: &mut State, player: PlayerId, cards: &[CardId], events: &mut Vec<Event>) {
    for card in cards {
        state.remove_from_hand(player, *card);
        state.discard(*card);
    }
    begin_action(state, player, PlayedAction::Five);
    events.push(Event::public(EventKind::FivePlayed { player }));
    state.push_pending(PendingKind::TakeDiscard { actor: player });
}

fn attack_target(state: &mut State, player: PlayerId, target: PlayerId, events: &mut Vec<Event>) {
    state.pending.pop();
    state.last_action = None;
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    let remaining = state.turn.turns_left.saturating_sub(1);
    state.turn = TurnState {
        player: target,
        turns_left: remaining.saturating_add(2),
        direction: state.turn.direction,
    };
    events.push(Event::public(EventKind::TurnStarted {
        player: target,
        turns_left: state.turn.turns_left,
    }));
}

fn favour_target<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    target: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    if steal_from_tower_stash(state, target, player, rng, events) {
        state.last_action = None;
        return;
    }
    if state.players[target.0].hand.is_empty() {
        state.last_action = None;
        events.push(Event::public(EventKind::FavourSkipped {
            actor: player,
            target,
        }));
    } else {
        events.push(Event::public(EventKind::FavourAsked {
            actor: player,
            target,
        }));
        state.push_pending(PendingKind::FavourCard {
            actor: player,
            target,
        });
    }
}

fn favour_card(state: &mut State, player: PlayerId, card: CardId, events: &mut Vec<Event>) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::FavourCard { actor, target } = frame.kind else {
        unreachable!()
    };
    debug_assert_eq!(target, player);
    state.last_action = None;
    state.give_card(target, actor, card);
    events.push(Event::public(EventKind::FavourCompleted { actor, target }));
    if let Some(view) = CardView::new(card) {
        events.push(Event::private(
            actor,
            EventKind::CardReceived {
                player: actor,
                from: target,
                card: view,
            },
        ));
        events.push(Event::private(
            target,
            EventKind::CardGiven {
                player: target,
                to: actor,
                card: view,
            },
        ));
    }
    check_unprotected_exploding(state, actor, events);
    check_unprotected_exploding(state, target, events);
}

fn random_target<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    target: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    state.last_action = None;
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    if steal_from_tower_stash(state, target, player, rng, events) {
        return;
    }
    let card = deck::take_random(&mut state.players[target.0].hand, rng);
    events.push(Event::public(EventKind::RandomSteal {
        actor: player,
        target,
        found: card.is_some(),
    }));
    if let Some(card) = card {
        state.players[target.0]
            .marked_cards
            .retain(|marked| *marked != card);
        state.players[player.0].hand.push(card);
        if let Some(view) = CardView::new(card) {
            events.push(Event::private(
                player,
                EventKind::CardReceived {
                    player,
                    from: target,
                    card: view,
                },
            ));
            events.push(Event::private(
                target,
                EventKind::CardGiven {
                    player: target,
                    to: player,
                    card: view,
                },
            ));
        }
        check_unprotected_exploding(state, player, events);
        check_unprotected_exploding(state, target, events);
    }
}

fn steal_target<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    target: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    if steal_from_tower_stash(state, target, player, rng, events) {
        state.last_action = None;
        return;
    }
    state.push_pending(PendingKind::StealKind {
        actor: player,
        target,
    });
}

fn steal_kind(state: &mut State, kind: CardKind, events: &mut Vec<Event>) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::StealKind { actor, target } = frame.kind else {
        unreachable!()
    };
    state.last_action = None;
    let found = state.players[target.0]
        .hand
        .iter()
        .position(|card| card.kind() == Some(kind));
    events.push(Event::public(EventKind::NamedSteal {
        actor,
        target,
        kind,
        found: found.is_some(),
    }));
    if let Some(index) = found {
        let card = state.players[target.0].hand.remove(index);
        state.players[target.0]
            .marked_cards
            .retain(|marked| *marked != card);
        state.players[actor.0].hand.push(card);
        if let Some(view) = CardView::new(card) {
            events.push(Event::private(
                actor,
                EventKind::CardReceived {
                    player: actor,
                    from: target,
                    card: view,
                },
            ));
            events.push(Event::private(
                target,
                EventKind::CardGiven {
                    player: target,
                    to: actor,
                    card: view,
                },
            ));
        }
        check_unprotected_exploding(state, actor, events);
        check_unprotected_exploding(state, target, events);
    }
}

fn mark_target<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    target: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    state.last_action = None;
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    let unmarked: Vec<CardId> = state.players[target.0]
        .hand
        .iter()
        .copied()
        .filter(|card| !state.players[target.0].marked_cards.contains(card))
        .collect();
    if let Some(&chosen) = unmarked.choose(rng) {
        state.players[target.0].marked_cards.push(chosen);
        if let Some(view) = CardView::new(chosen) {
            events.push(Event::public(EventKind::CardMarked {
                actor: player,
                target,
                card: view,
            }));
        }
    }
}

fn curse_target<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    target: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    state.last_action = None;
    events.push(Event::public(EventKind::TargetChosen {
        actor: player,
        target,
    }));
    state.players[target.0].cursed = true;
    state.players[target.0].hand.shuffle(rng);
    events.push(Event::public(EventKind::PlayerCursed {
        actor: player,
        target,
    }));
}

fn ill_take_that_target(
    state: &mut State,
    player: PlayerId,
    target: PlayerId,
    events: &mut Vec<Event>,
) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::IllTakeThatTarget { actor, card } = frame.kind else {
        unreachable!()
    };
    debug_assert_eq!(actor, player);
    state.last_action = None;
    if let Some(pos) = state.discard.iter().position(|c| *c == card) {
        state.discard.remove(pos);
    }
    state.players[target.0].ill_take_that = Some(IllTakeThatTrap {
        owner: player,
        card,
    });
    events.push(Event::public(EventKind::IllTakeThatPlaced {
        actor: player,
        target,
    }));
}

fn take_discard(
    state: &mut State,
    player: PlayerId,
    card: Option<CardId>,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    state.last_action = None;
    if let Some(card) = card {
        let index = state
            .discard
            .iter()
            .position(|held| *held == card)
            .expect("validated discard card");
        let card = state.discard.remove(index);
        state.players[player.0].hand.push(card);
        if let Some(view) = CardView::new(card) {
            events.push(Event::public(EventKind::FiveTaken { player, card: view }));
        }
    }
}

fn reorder_future(state: &mut State, player: PlayerId, order: &[CardId], events: &mut Vec<Event>) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::AlterFuture {
        actor,
        count,
        share_with_next,
    } = frame.kind
    else {
        unreachable!()
    };
    debug_assert_eq!(actor, player);
    state.last_action = None;
    let keep = state.deck.len().saturating_sub(count);
    state.deck.truncate(keep);
    for card in order.iter().rev() {
        state.deck.push(*card);
    }
    events.push(Event::public(EventKind::FutureAltered { player, count }));
    if share_with_next && let Some(next) = state.next_active(player) {
        let cards: Vec<CardView> = order
            .iter()
            .filter_map(|card| CardView::new(*card))
            .collect();
        events.push(Event::public(EventKind::FutureShared {
            actor: player,
            target: next,
            count,
        }));
        events.push(Event::private(
            next,
            EventKind::FutureSeen {
                player: next,
                cards,
            },
        ));
    }
}

fn put_card_in_deck<R: Rng + ?Sized>(
    state: &mut State,
    player: PlayerId,
    card: CardId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::GiveToDeck {
        mut queue,
        shuffle_after,
    } = frame.kind
    else {
        unreachable!()
    };
    state.last_action = None;
    queue.remove(0);
    state.remove_from_hand(player, card);
    state.deck.push(card);
    events.push(Event::public(EventKind::CardPutInDeck {
        player,
        shuffled: shuffle_after,
    }));
    queue.retain(|id| state.is_active(*id) && !state.players[id.0].hand.is_empty());
    if !queue.is_empty() {
        state.push_pending(PendingKind::GiveToDeck {
            queue,
            shuffle_after,
        });
    } else if shuffle_after {
        state.clear_non_imploding_face_up();
        state.deck.shuffle(rng);
        events.push(Event::public(EventKind::DeckShuffled {
            count: state.deck.len(),
        }));
    }
    check_unprotected_exploding(state, player, events);
}

fn nope(
    state: &mut State,
    player: PlayerId,
    pending_id: crate::state::PendingId,
    events: &mut Vec<Event>,
) {
    let target = state.last_action.take().expect("validated nope window");
    debug_assert_eq!(target.id, pending_id);
    let earlier_actor = target.actor;
    let action_id = target.id;

    let nope = state.players[player.0]
        .hand
        .iter()
        .copied()
        .find(|card| {
            card.kind() == Some(CardKind::Nope)
                && target.history.players[player.0].hand.contains(card)
        })
        .expect("validated Nope card");

    // Consume Nope card in the post-action timeline BEFORE capturing it, AND in
    // the restored pre-action timeline so Nope cards always stay discarded.
    state.remove_from_hand(player, nope);
    state.discard(nope);
    let after = state.capture();

    state.restore(target.history);
    state.remove_from_hand(player, nope);
    state.discard(nope);

    events.push(Event::public(EventKind::NopePlayed { player, action_id }));
    events.push(Event::public(EventKind::ActionUndone {
        action_id,
        actor: earlier_actor,
    }));

    let id = state.new_id();
    state.last_action = Some(LastAction {
        id,
        actor: player,
        played: PlayedAction::Nope,
        nopeable: true,
        history: after,
    });
}

fn defuse(state: &mut State, player: PlayerId, position: usize, events: &mut Vec<Event>) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::Defuse {
        player: owner,
        exploding,
        end_turn,
    } = frame.kind
    else {
        unreachable!()
    };
    debug_assert_eq!(owner, player);
    state.last_action = None;
    deck::insert_from_top(&mut state.deck, exploding, position);
    events.push(Event::public(EventKind::Defused { player, position }));
    if end_turn {
        lift_curse(state, player, events);
        finish_turn(state, events);
    }
}

fn insert_imploding(state: &mut State, player: PlayerId, position: usize, events: &mut Vec<Event>) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::InsertImploding {
        player: owner,
        card,
        end_turn,
    } = frame.kind
    else {
        unreachable!()
    };
    debug_assert_eq!(owner, player);
    state.last_action = None;
    state.face_up.insert(card);
    deck::insert_from_top(&mut state.deck, card, position);
    events.push(Event::public(EventKind::ImplodingPlaced {
        player,
        position,
    }));
    if end_turn {
        lift_curse(state, player, events);
        finish_turn(state, events);
    }
}

fn bury_card(state: &mut State, player: PlayerId, position: usize, events: &mut Vec<Event>) {
    let frame = state.pending.pop().expect("validated pending");
    let PendingKind::BuryCard {
        player: owner,
        card,
    } = frame.kind
    else {
        unreachable!()
    };
    debug_assert_eq!(owner, player);
    state.last_action = None;
    deck::insert_from_top(&mut state.deck, card, position);
    events.push(Event::public(EventKind::CardBuried { player, position }));
    lift_curse(state, player, events);
    finish_turn(state, events);
}

pub fn default_action(state: &State) -> Option<(PlayerId, Action)> {
    if state.winner.is_some() {
        return None;
    }
    if let Some(frame) = state.pending.last() {
        let player = frame.player()?;
        let action = match &frame.kind {
            PendingKind::Defuse { .. } => Action::Defuse {
                pending_id: frame.id,
                position: 0,
            },
            PendingKind::InsertImploding { .. } => Action::InsertImploding {
                pending_id: frame.id,
                position: 0,
            },
            PendingKind::BuryCard { .. } => Action::BuryCard {
                pending_id: frame.id,
                position: 0,
            },
            PendingKind::AttackTarget { .. } => Action::AttackTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
            PendingKind::FavourTarget { .. } => Action::FavourTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
            PendingKind::FavourCard { target, .. } => {
                if state.players[target.0].cursed {
                    Action::ChooseBlindCard {
                        pending_id: frame.id,
                        slot: 0,
                    }
                } else {
                    Action::FavourCard {
                        pending_id: frame.id,
                        card: *state.players[target.0].hand.first()?,
                    }
                }
            }
            PendingKind::RandomTarget { .. } => Action::RandomTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
            PendingKind::StealTarget { .. } => Action::StealTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
            PendingKind::StealKind { target, .. } => Action::StealKind {
                pending_id: frame.id,
                kind: state.players[target.0]
                    .hand
                    .first()
                    .and_then(|card| card.kind())
                    .filter(|kind| !matches!(kind, CardKind::Exploding | CardKind::Imploding))
                    .unwrap_or(CardKind::Defuse),
            },
            PendingKind::TakeDiscard { .. } => Action::TakeDiscard {
                pending_id: frame.id,
                card: state.discard.last().copied(),
            },
            PendingKind::AlterFuture { count, .. } => Action::ReorderFuture {
                pending_id: frame.id,
                order: state.deck.iter().rev().take(*count).copied().collect(),
            },
            PendingKind::GiveToDeck { queue, .. } => {
                let first = *queue.first()?;
                if state.players[first.0].cursed {
                    Action::ChooseBlindCard {
                        pending_id: frame.id,
                        slot: 0,
                    }
                } else {
                    Action::PutCardInDeck {
                        pending_id: frame.id,
                        card: *state.players[first.0].hand.first()?,
                    }
                }
            }
            PendingKind::MarkTarget { .. } => Action::MarkTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
            PendingKind::CurseTarget { .. } => Action::CurseTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
            PendingKind::IllTakeThatTarget { .. } => Action::IllTakeThatTarget {
                pending_id: frame.id,
                target: state.first_ill_take_that_target(player)?,
            },
            PendingKind::BarkingTarget { .. } => Action::BarkingTarget {
                pending_id: frame.id,
                target: state.first_other_active(player)?,
            },
        };
        return Some((player, action));
    }
    let player = state.turn.player;
    state.is_active(player).then_some((player, Action::Draw))
}
