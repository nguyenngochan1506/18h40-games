use super::*;
use crate::actions::DrawSource;

pub(super) fn activate(state: &GameState, player: PlayerId, events: &mut Vec<Event>) {
    events.push(Event::public(EventKind::SkillActivated {
        player,
        character: state.players[player.0].character,
    }));
}

pub(super) fn receive(
    state: &mut GameState,
    player: PlayerId,
    cards: Vec<CardId>,
    events: &mut Vec<Event>,
) {
    if cards.is_empty() {
        return;
    }
    state.players[player.0].hand.extend_from_slice(&cards);
    events.push(Event::public(EventKind::CardsDrawn {
        player,
        count: cards.len(),
    }));
    events.push(Event {
        visibility: Visibility::Player(player),
        kind: EventKind::CardsReceived { player, cards },
    });
}

pub(super) fn offer(player: PlayerId, cards: &[CardId], events: &mut Vec<Event>) {
    events.push(Event {
        visibility: Visibility::Player(player),
        kind: EventKind::ChoiceOffered {
            player,
            cards: cards.to_vec(),
        },
    });
}

pub(super) fn draw_phase<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.turn.step = TurnStep::Play;
    match state.players[player.0].character {
        Character::JesseJones | Character::PedroRamirez => {
            state.push_pending(PendingKind::DrawChoice { player })
        }
        Character::KitCarlson => {
            let pool = take_draw(state, 3, rng, events);
            if !pool.is_empty() {
                activate(state, player, events);
                offer(player, &pool, events);
                let keep = pool.len().min(2);
                state.push_pending(PendingKind::KeepCards { player, pool, keep });
            }
        }
        Character::BlackJack => {
            let cards = take_draw(state, 2, rng, events);
            let second = cards.get(1).copied();
            receive(state, player, cards, events);
            if let Some(card) = second {
                activate(state, player, events);
                events.push(Event::public(EventKind::CardShown { player, card }));
                if matches!(card.card().unwrap().suit, Suit::Hearts | Suit::Diamonds) {
                    draw(state, player, 1, rng, events);
                }
            }
        }
        _ => draw(state, player, 2, rng, events),
    }
}

pub(super) fn steal<R: Rng + ?Sized>(
    state: &mut GameState,
    source: PlayerId,
    target: PlayerId,
    count: usize,
    rng: &mut R,
    events: &mut Vec<Event>,
) -> usize {
    let mut cards = Vec::new();
    for _ in 0..count.min(state.players[target.0].hand.len()) {
        let index = rng.random_range(0..state.players[target.0].hand.len());
        cards.push(state.players[target.0].hand.remove(index));
    }
    let count = cards.len();
    if count > 0 {
        state.players[source.0].hand.extend_from_slice(&cards);
        events.push(Event::public(EventKind::CardsStolen {
            source,
            target,
            count,
        }));
        let kind = EventKind::StolenCards {
            source,
            target,
            cards,
        };
        events.push(Event {
            visibility: Visibility::Player(source),
            kind: kind.clone(),
        });
        events.push(Event {
            visibility: Visibility::Player(target),
            kind,
        });
    }
    count
}

pub(super) fn choose_source<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    source: DrawSource,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.pending.pop();
    match source {
        DrawSource::Deck => draw(state, player, 1, rng, events),
        DrawSource::Discard => {
            let card = state.discard_pile.pop().unwrap();
            state.hidden_discards.retain(|id| *id != card);
            receive(state, player, vec![card], events);
            activate(state, player, events);
        }
        DrawSource::Player(target) => {
            steal(state, player, target, 1, rng, events);
            activate(state, player, events);
        }
    }
    draw(state, player, 1, rng, events);
}

pub(super) fn keep_cards(
    state: &mut GameState,
    player: PlayerId,
    cards: Vec<CardId>,
    events: &mut Vec<Event>,
) {
    let PendingKind::KeepCards { pool, .. } = state.pending.pop().unwrap().kind else {
        unreachable!()
    };
    for card in pool {
        if !cards.contains(&card) {
            state.draw_pile.push(card);
        }
    }
    receive(state, player, cards, events);
}

pub(super) fn after_damage<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    card_owner: Option<PlayerId>,
    damage: u8,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    match state.players[player.0].character {
        Character::BartCassidy => {
            activate(state, player, events);
            draw(state, player, usize::from(damage), rng, events);
        }
        Character::ElGringo => {
            if let Some(source) = card_owner.filter(|owner| *owner != player)
                && steal(state, player, source, usize::from(damage), rng, events) > 0
            {
                activate(state, player, events);
            }
        }
        _ => {}
    }
}

pub(super) fn after_action<R: Rng + ?Sized>(
    state: &mut GameState,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    if state.winner.is_some() {
        return;
    }
    for index in 0..state.players.len() {
        let player = &state.players[index];
        if player.alive && player.character == Character::SuzyLafayette && player.hand.is_empty() {
            let cards = take_draw(state, 1, rng, events);
            if !cards.is_empty() {
                activate(state, PlayerId(index), events);
                receive(state, PlayerId(index), cards, events);
            }
        }
    }
}

pub(super) fn sid_heal(
    state: &mut GameState,
    player: PlayerId,
    discard: [CardId; 2],
    events: &mut Vec<Event>,
) {
    for card in discard {
        remove_from_hand(state, player, card);
        state.discard(card);
        events.push(Event::public(EventKind::CardDiscarded { player, card }));
    }
    activate(state, player, events);
    heal(state, player, events);
    if let Some(frame) = state.pending.last_mut()
        && let PendingKind::Dying {
            player: dying,
            needed,
            ..
        } = &mut frame.kind
        && *dying == player
    {
        if state.players[player.0].health > 0 {
            state.pending.pop();
        } else {
            *needed = (1 - state.players[player.0].health) as u16;
            state.renew_pending_id();
        }
    }
}

pub(super) fn range_used(
    state: &GameState,
    source: PlayerId,
    target: PlayerId,
    events: &mut Vec<Event>,
) {
    if source == target {
        return;
    }
    if state.players[source.0].character == Character::RoseDoolan {
        activate(state, source, events);
    }
    if state.players[target.0].character == Character::PaulRegret {
        activate(state, target, events);
    }
}
