use crate::{
    actions::{Action, ActionError, CardSelection, validate},
    events::{Event, EventKind, Visibility},
    model::{CardId, CardKind, Character, DECK, PlayerId, Role, Suit},
    rules,
    state::{AttackKind, GameState, PendingKind, Player, TurnState, TurnStep},
};
use rand::{Rng, seq::SliceRandom};

/// Deals initial hands, then starts the Sheriff's turn including its two-card draw.
pub fn setup<R: Rng + ?Sized>(
    count: usize,
    rng: &mut R,
) -> Result<(GameState, Vec<Event>), ActionError> {
    use Role::*;
    let mut roles = match count {
        4 => vec![Sheriff, Outlaw, Outlaw, Renegade],
        5 => vec![Sheriff, Deputy, Outlaw, Outlaw, Renegade],
        6 => vec![Sheriff, Deputy, Outlaw, Outlaw, Outlaw, Renegade],
        7 => vec![Sheriff, Deputy, Deputy, Outlaw, Outlaw, Outlaw, Renegade],
        _ => return Err(ActionError::InvalidPlayerCount),
    };
    roles.shuffle(rng);
    let mut characters = Character::ALL;
    characters.shuffle(rng);
    let players: Vec<_> = roles
        .iter()
        .zip(characters)
        .map(|(&role, character)| {
            let max_health = character.health() + i16::from(role == Sheriff);
            Player {
                role,
                character,
                health: max_health,
                max_health,
                alive: true,
                hand: Vec::new(),
                in_play: Vec::new(),
            }
        })
        .collect();
    let sheriff = PlayerId(roles.iter().position(|role| *role == Sheriff).unwrap());
    let mut draw_pile: Vec<_> = (0..DECK.len()).map(|id| CardId(id as u8)).collect();
    draw_pile.shuffle(rng);
    let mut state = GameState {
        players,
        draw_pile,
        discard_pile: Vec::new(),
        turn: TurnState {
            player: sheriff,
            step: TurnStep::Dynamite,
            bangs_played: 0,
        },
        pending: Vec::new(),
        winner: None,
        next_pending_id: 1,
        hidden_discard_top: None,
    };
    let mut events = vec![Event::public(EventKind::GameStarted { sheriff })];
    for index in 0..count {
        let health = state.players[index].health as usize;
        draw(&mut state, PlayerId(index), health, rng, &mut events);
    }
    events.push(Event::public(EventKind::TurnStarted { player: sheriff }));
    advance_until_input(&mut state, rng, &mut events);
    events.push(Event::public(EventKind::DecisionChanged {
        decision: state.decision(),
    }));
    Ok((state, events))
}

pub fn apply<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    action: Action,
    rng: &mut R,
) -> Result<Vec<Event>, ActionError> {
    validate(state, player, &action)?;
    let before = state.decision();
    let mut events = Vec::new();
    match action {
        Action::Play { card, target } => {
            let kind = card.card().unwrap().kind;
            if kind.is_equipment() {
                equip_card(state, player, card, target.unwrap_or(player), &mut events);
            } else {
                play_card(state, player, card, target, &mut events);
                match kind {
                    CardKind::Bang => {
                        state.turn.bangs_played += 1;
                        start_attack(
                            state,
                            player,
                            target.unwrap(),
                            AttackKind::Bang,
                            rng,
                            &mut events,
                        );
                    }
                    CardKind::Beer => drink_beer(state, player, &mut events),
                    CardKind::Stagecoach => draw(state, player, 2, rng, &mut events),
                    CardKind::WellsFargo => draw(state, player, 3, rng, &mut events),
                    CardKind::Saloon => {
                        for index in 0..state.players.len() {
                            if state.players[index].alive {
                                heal(state, PlayerId(index), &mut events);
                            }
                        }
                    }
                    CardKind::Duel => state.push_pending(PendingKind::Duel {
                        initiator: player,
                        opponent: target.unwrap(),
                        next: target.unwrap(),
                    }),
                    CardKind::Gatling | CardKind::Indians => {
                        let targets = turn_order(state, player, false);
                        state.push_pending(PendingKind::ResolveTargets {
                            source: player,
                            kind: if kind == CardKind::Gatling {
                                AttackKind::Gatling
                            } else {
                                AttackKind::Indians
                            },
                            targets,
                            cursor: 0,
                        });
                    }
                    CardKind::GeneralStore => {
                        let order = turn_order(state, player, true);
                        let pool = take_draw(state, order.len(), rng, &mut events);
                        events.push(Event::public(EventKind::StoreOpened { pool: pool.clone() }));
                        state.push_pending(PendingKind::GeneralStore {
                            pool,
                            order,
                            cursor: 0,
                        });
                    }
                    _ => unreachable!("validated playable card"),
                }
            }
        }
        Action::AffectCard {
            card,
            target,
            selection,
        } => {
            play_card(state, player, card, Some(target), &mut events);
            affect_card(
                state,
                player,
                target,
                card.card().unwrap().kind,
                selection,
                rng,
                &mut events,
            );
        }
        Action::ChooseCard { card, .. } => {
            if let PendingKind::GeneralStore { pool, cursor, .. } =
                &mut state.pending.last_mut().unwrap().kind
            {
                let index = pool.iter().position(|id| *id == card).unwrap();
                pool.remove(index);
                *cursor += 1;
            }
            state.players[player.0].hand.push(card);
            events.push(Event::public(EventKind::StoreCardClaimed { player, card }));
            state.renew_pending_id();
        }
        Action::Respond { card, .. } => {
            let frame = state.pending.last().unwrap().clone();
            if let Some(card) = card {
                play_card(state, player, card, None, &mut events);
                match frame.kind {
                    PendingKind::AttackResponse { remaining, .. } => {
                        if remaining <= 1 {
                            state.pending.pop();
                        } else if let PendingKind::AttackResponse { remaining, .. } =
                            &mut state.pending.last_mut().unwrap().kind
                        {
                            *remaining -= 1;
                        }
                    }
                    PendingKind::Dying { .. } => {
                        drink_beer(state, player, &mut events);
                        if state.players[player.0].health > 0 {
                            state.pending.pop();
                        } else if let PendingKind::Dying { needed, .. } =
                            &mut state.pending.last_mut().unwrap().kind
                        {
                            *needed = (1 - state.players[player.0].health) as u16;
                        }
                    }
                    PendingKind::Duel {
                        initiator,
                        opponent,
                        ..
                    } => {
                        if let PendingKind::Duel { next, .. } =
                            &mut state.pending.last_mut().unwrap().kind
                        {
                            *next = if player == initiator {
                                opponent
                            } else {
                                initiator
                            };
                        }
                        state.renew_pending_id();
                    }
                    _ => unreachable!("validated response frame"),
                }
            } else {
                state.pending.pop();
                match frame.kind {
                    PendingKind::AttackResponse {
                        target,
                        source,
                        damage,
                        ..
                    } => damage_player(state, target, Some(source), damage, &mut events),
                    PendingKind::Dying { player, source, .. } => {
                        eliminate(state, player, source, rng, &mut events)
                    }
                    PendingKind::Duel {
                        initiator,
                        opponent,
                        ..
                    } => {
                        let source = if player == initiator {
                            opponent
                        } else {
                            initiator
                        };
                        damage_player(state, player, Some(source), 1, &mut events);
                    }
                    _ => unreachable!("validated response frame"),
                }
            }
        }
        Action::EndTurn { discard } => {
            for card in discard {
                remove_from_hand(state, player, card);
                state.discard(card);
                events.push(Event::public(EventKind::CardDiscarded { player, card }));
            }
            next_turn(state, &mut events);
        }
    }
    advance_until_input(state, rng, &mut events);
    if state.decision() != before {
        events.push(Event::public(EventKind::DecisionChanged {
            decision: state.decision(),
        }));
    }
    Ok(events)
}

fn remove_from_hand(state: &mut GameState, player: PlayerId, card: CardId) {
    let hand = &mut state.players[player.0].hand;
    let index = hand.iter().position(|id| *id == card).unwrap();
    hand.remove(index);
}

fn play_card(
    state: &mut GameState,
    player: PlayerId,
    card: CardId,
    target: Option<PlayerId>,
    events: &mut Vec<Event>,
) {
    remove_from_hand(state, player, card);
    state.discard(card);
    events.push(Event::public(EventKind::CardPlayed {
        player,
        card,
        target,
    }));
}

fn equip_card(
    state: &mut GameState,
    source: PlayerId,
    card: CardId,
    target: PlayerId,
    events: &mut Vec<Event>,
) {
    let kind = card.card().unwrap().kind;
    if kind.weapon_range().is_some()
        && let Some(old) = state.players[target.0]
            .in_play
            .iter()
            .copied()
            .find(|card| card.card().unwrap().kind.weapon_range().is_some())
    {
        discard_in_play(state, target, old, events);
    }
    remove_from_hand(state, source, card);
    state.players[target.0].in_play.push(card);
    events.push(Event::public(EventKind::CardPlayed {
        player: source,
        card,
        target: Some(target),
    }));
    events.push(Event::public(EventKind::CardEquipped {
        player: target,
        card,
    }));
}

fn affect_card<R: Rng + ?Sized>(
    state: &mut GameState,
    source: PlayerId,
    target: PlayerId,
    kind: CardKind,
    selection: CardSelection,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let card = match selection {
        CardSelection::Hand => {
            let index = rng.random_range(0..state.players[target.0].hand.len());
            state.players[target.0].hand.remove(index)
        }
        CardSelection::InPlay(card) => {
            let index = state.players[target.0]
                .in_play
                .iter()
                .position(|id| *id == card)
                .unwrap();
            state.players[target.0].in_play.remove(index)
        }
    };
    if kind == CardKind::Panic {
        state.players[source.0].hand.push(card);
    } else {
        state.discard(card);
        if selection == CardSelection::Hand {
            // The B2 contract keeps random hand discards private, including the top card.
            state.hidden_discard_top = Some(card);
        }
    }
    if selection == CardSelection::Hand {
        events.push(Event::public(EventKind::HandAffected {
            source,
            target,
            kind,
            count: 1,
        }));
        let detail = EventKind::HandCardAffected {
            source,
            target,
            kind,
            card,
        };
        events.push(Event {
            visibility: Visibility::Player(source),
            kind: detail.clone(),
        });
        if target != source {
            events.push(Event {
                visibility: Visibility::Player(target),
                kind: detail,
            });
        }
    } else {
        events.push(Event::public(EventKind::InPlayCardAffected {
            source,
            target,
            kind,
            card,
        }));
    }
}

fn heal(state: &mut GameState, player: PlayerId, events: &mut Vec<Event>) {
    let own = &mut state.players[player.0];
    let previous = own.health;
    own.health = (own.health + 1).min(own.max_health);
    if own.health != previous {
        events.push(Event::public(EventKind::HealthChanged {
            player,
            source: None,
            delta: own.health - previous,
            health: own.health,
        }));
    }
}

fn drink_beer(state: &mut GameState, player: PlayerId, events: &mut Vec<Event>) {
    if state.players.iter().filter(|p| p.alive).count() > 2 {
        heal(state, player, events);
    }
}

fn damage_player(
    state: &mut GameState,
    player: PlayerId,
    source: Option<PlayerId>,
    damage: u8,
    events: &mut Vec<Event>,
) {
    let own = &mut state.players[player.0];
    own.health -= i16::from(damage);
    events.push(Event::public(EventKind::HealthChanged {
        player,
        source,
        delta: -i16::from(damage),
        health: own.health,
    }));
    if own.health <= 0 {
        state.push_pending(PendingKind::Dying {
            player,
            source,
            needed: (1 - state.players[player.0].health) as u16,
        });
    }
}

fn discard_in_play(state: &mut GameState, player: PlayerId, card: CardId, events: &mut Vec<Event>) {
    let index = state.players[player.0]
        .in_play
        .iter()
        .position(|id| *id == card)
        .unwrap();
    state.players[player.0].in_play.remove(index);
    state.discard(card);
    events.push(Event::public(EventKind::CardDiscarded { player, card }));
}

fn discard_all(state: &mut GameState, player: PlayerId, events: &mut Vec<Event>) {
    let own = &mut state.players[player.0];
    let cards: Vec<_> = std::mem::take(&mut own.hand)
        .into_iter()
        .chain(std::mem::take(&mut own.in_play))
        .collect();
    for card in cards {
        state.discard(card);
        events.push(Event::public(EventKind::CardDiscarded { player, card }));
    }
}

fn return_pool(state: &mut GameState, pool: Vec<CardId>, events: &mut Vec<Event>) {
    if pool.is_empty() {
        return;
    }
    for &card in &pool {
        state.discard(card);
    }
    events.push(Event::public(EventKind::PoolDiscarded { cards: pool }));
}

fn clear_pending(state: &mut GameState, events: &mut Vec<Event>) {
    for frame in std::mem::take(&mut state.pending) {
        match frame.kind {
            PendingKind::GeneralStore { pool, .. } => return_pool(state, pool, events),
            PendingKind::AttackResponse { .. }
            | PendingKind::Dying { .. }
            | PendingKind::Duel { .. }
            | PendingKind::ResolveTargets { .. } => {}
        }
    }
}

fn eliminate<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    source: Option<PlayerId>,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.players[player.0].alive = false;
    let role = state.players[player.0].role;
    events.push(Event::public(EventKind::PlayerEliminated { player, role }));
    discard_all(state, player, events);
    if let Some(source) = source.filter(|id| state.players.get(id.0).is_some_and(|p| p.alive)) {
        if role == Role::Outlaw {
            events.push(Event::public(EventKind::BountyAwarded {
                player: source,
                victim: player,
            }));
            draw(state, source, 3, rng, events);
        } else if role == Role::Deputy && state.players[source.0].role == Role::Sheriff {
            events.push(Event::public(EventKind::SheriffPenalized {
                player: source,
                victim: player,
            }));
            discard_all(state, source, events);
        }
    }
    if let Some(winner) = rules::winner(state) {
        state.winner = Some(winner);
        clear_pending(state, events);
        events.push(Event::public(EventKind::GameEnded {
            winner,
            roles: state.players.iter().map(|p| p.role).collect(),
        }));
    }
}

fn take_draw<R: Rng + ?Sized>(
    state: &mut GameState,
    count: usize,
    rng: &mut R,
    events: &mut Vec<Event>,
) -> Vec<CardId> {
    let mut cards = Vec::new();
    for _ in 0..count {
        if state.draw_pile.is_empty() && !state.discard_pile.is_empty() {
            state.draw_pile = std::mem::take(&mut state.discard_pile);
            state.hidden_discard_top = None;
            state.draw_pile.shuffle(rng);
            events.push(Event::public(EventKind::DeckReshuffled {
                count: state.draw_pile.len(),
            }));
        }
        // shortcut: draws stop when both piles are empty, settle exhaustion rules in B3.
        let Some(card) = state.draw_pile.pop() else {
            break;
        };
        cards.push(card);
    }
    cards
}

fn draw<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    count: usize,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let cards = take_draw(state, count, rng, events);
    if !cards.is_empty() {
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
}

fn draw_check<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    reason: CardKind,
    rng: &mut R,
    events: &mut Vec<Event>,
) -> Option<crate::model::Card> {
    let card = take_draw(state, 1, rng, events).pop()?;
    state.discard(card);
    events.push(Event::public(EventKind::DrawRevealed {
        player,
        reason,
        card,
    }));
    card.card()
}

fn start_attack<R: Rng + ?Sized>(
    state: &mut GameState,
    source: PlayerId,
    target: PlayerId,
    kind: AttackKind,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    if matches!(kind, AttackKind::Bang | AttackKind::Gatling)
        && state.players[target.0].has_in_play(CardKind::Barrel)
        && draw_check(state, target, CardKind::Barrel, rng, events)
            .is_some_and(|card| card.suit == Suit::Hearts)
    {
        return;
    }
    state.push_pending(PendingKind::AttackResponse {
        target,
        source,
        kind,
        remaining: 1,
        damage: 1,
    });
}

fn turn_order(state: &GameState, source: PlayerId, include_source: bool) -> Vec<PlayerId> {
    let start = usize::from(!include_source);
    (start..state.players.len())
        .map(|offset| PlayerId((source.0 + offset) % state.players.len()))
        .filter(|id| state.players[id.0].alive)
        .collect()
}

fn next_living(state: &GameState, current: PlayerId) -> PlayerId {
    let count = state.players.len();
    PlayerId(
        (1..=count)
            .map(|offset| (current.0 + offset) % count)
            .find(|index| state.players[*index].alive)
            .unwrap(),
    )
}

fn next_turn(state: &mut GameState, events: &mut Vec<Event>) {
    let player = next_living(state, state.turn.player);
    state.turn = TurnState {
        player,
        step: TurnStep::Dynamite,
        bangs_played: 0,
    };
    events.push(Event::public(EventKind::TurnStarted { player }));
}

fn advance_until_input<R: Rng + ?Sized>(
    state: &mut GameState,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    while state.winner.is_none() {
        if let Some(frame) = state.pending.last().cloned() {
            match frame.kind {
                PendingKind::ResolveTargets {
                    source,
                    kind,
                    targets,
                    mut cursor,
                } => {
                    while cursor < targets.len() && !state.players[targets[cursor].0].alive {
                        cursor += 1;
                    }
                    if cursor == targets.len() {
                        state.pending.pop();
                        continue;
                    }
                    if let PendingKind::ResolveTargets { cursor: stored, .. } =
                        &mut state.pending.last_mut().unwrap().kind
                    {
                        *stored = cursor + 1;
                    }
                    start_attack(state, source, targets[cursor], kind, rng, events);
                    continue;
                }
                PendingKind::GeneralStore {
                    pool,
                    order,
                    mut cursor,
                } => {
                    let old_cursor = cursor;
                    while cursor < order.len() && !state.players[order[cursor].0].alive {
                        cursor += 1;
                    }
                    if pool.is_empty() || cursor == order.len() {
                        state.pending.pop();
                        return_pool(state, pool, events);
                        continue;
                    }
                    if cursor != old_cursor {
                        if let PendingKind::GeneralStore { cursor: stored, .. } =
                            &mut state.pending.last_mut().unwrap().kind
                        {
                            *stored = cursor;
                        }
                        state.renew_pending_id();
                    }
                }
                PendingKind::Duel {
                    initiator,
                    opponent,
                    ..
                } if !state.players[initiator.0].alive || !state.players[opponent.0].alive => {
                    state.pending.pop();
                    continue;
                }
                PendingKind::AttackResponse { target, .. } if !state.players[target.0].alive => {
                    state.pending.pop();
                    continue;
                }
                _ => {}
            }
            break;
        }
        if !state.players[state.turn.player.0].alive {
            next_turn(state, events);
        }
        let player = state.turn.player;
        match state.turn.step {
            TurnStep::Dynamite => {
                state.turn.step = TurnStep::Jail;
                if let Some(dynamite) = state.players[player.0]
                    .in_play
                    .iter()
                    .copied()
                    .find(|card| card.card().unwrap().kind == CardKind::Dynamite)
                {
                    let explodes = draw_check(state, player, CardKind::Dynamite, rng, events)
                        .is_some_and(|card| {
                            card.suit == Suit::Spades && (2..=9).contains(&(card.rank as u8))
                        });
                    if explodes {
                        discard_in_play(state, player, dynamite, events);
                        damage_player(state, player, None, 3, events);
                    } else {
                        let target = next_living(state, player);
                        let index = state.players[player.0]
                            .in_play
                            .iter()
                            .position(|id| *id == dynamite)
                            .unwrap();
                        state.players[player.0].in_play.remove(index);
                        state.players[target.0].in_play.push(dynamite);
                        events.push(Event::public(EventKind::CardPassed {
                            source: player,
                            target,
                            card: dynamite,
                        }));
                    }
                }
            }
            TurnStep::Jail => {
                state.turn.step = TurnStep::Draw;
                if let Some(jail) = state.players[player.0]
                    .in_play
                    .iter()
                    .copied()
                    .find(|card| card.card().unwrap().kind == CardKind::Jail)
                {
                    let escapes = draw_check(state, player, CardKind::Jail, rng, events)
                        .is_some_and(|card| card.suit == Suit::Hearts);
                    discard_in_play(state, player, jail, events);
                    if !escapes {
                        next_turn(state, events);
                    }
                }
            }
            TurnStep::Draw => {
                draw(state, player, 2, rng, events);
                state.turn.step = TurnStep::Play;
            }
            TurnStep::Play => break,
        }
    }
}

pub fn default_action(state: &GameState) -> Option<(PlayerId, Action)> {
    let decision = state.decision()?;
    let action = if let Some(pending_id) = decision.pending_id {
        if let Some(crate::state::Pending {
            kind: PendingKind::GeneralStore { pool, .. },
            ..
        }) = state.pending.last()
        {
            Action::ChooseCard {
                pending_id,
                card: *pool.first()?,
            }
        } else {
            Action::Respond {
                pending_id,
                card: None,
            }
        }
    } else {
        let player = &state.players[decision.player.0];
        let excess = player
            .hand
            .len()
            .saturating_sub(player.health.max(0) as usize);
        Action::EndTurn {
            discard: player.hand.iter().rev().take(excess).copied().collect(),
        }
    };
    Some((decision.player, action))
}
