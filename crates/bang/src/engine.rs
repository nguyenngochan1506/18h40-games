use crate::{
    actions::{Action, ActionError},
    events::{Event, EventKind, Visibility},
    model::{CardId, CardKind, Character, DECK, PlayerId, Role},
    rules::{self, DistanceModifiers},
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

fn held_kind(state: &GameState, player: PlayerId, card: CardId) -> Result<CardKind, ActionError> {
    if !state.players[player.0].hand.contains(&card) {
        return Err(ActionError::CardNotInHand);
    }
    Ok(card.card().ok_or(ActionError::InvalidCard)?.kind)
}

fn supported(kind: CardKind) -> Result<(), ActionError> {
    if matches!(kind, CardKind::Bang | CardKind::Missed | CardKind::Beer) {
        Ok(())
    } else {
        Err(ActionError::NotImplemented)
    }
}

fn validate(state: &GameState, player: PlayerId, action: &Action) -> Result<(), ActionError> {
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
    if state.decision().map(|d| d.player) != Some(player) {
        return Err(ActionError::NotYourDecision);
    }
    if let Some(frame) = state.pending.last() {
        let Action::Respond { pending_id, card } = action else {
            return Err(ActionError::WrongAction);
        };
        if *pending_id != frame.id {
            return Err(ActionError::StalePending);
        }
        if let Some(card) = card {
            let kind = held_kind(state, player, *card)?;
            supported(kind)?;
            let expected = match frame.kind {
                PendingKind::AttackResponse { .. } => CardKind::Missed,
                PendingKind::Dying { .. } => CardKind::Beer,
            };
            if kind != expected {
                return Err(ActionError::WrongAction);
            }
        }
        return Ok(());
    }
    match action {
        Action::Respond { .. } => Err(ActionError::StalePending),
        Action::Play { card, target } => {
            let kind = held_kind(state, player, *card)?;
            supported(kind)?;
            match kind {
                CardKind::Bang => {
                    if state.turn.bangs_played >= 1 {
                        return Err(ActionError::BangLimit);
                    }
                    let target = target.ok_or(ActionError::InvalidTarget)?;
                    if target == player || !state.players.get(target.0).is_some_and(|p| p.alive) {
                        return Err(ActionError::InvalidTarget);
                    }
                    if rules::distance(state, player, target, DistanceModifiers::default())? > 1 {
                        return Err(ActionError::OutOfRange);
                    }
                    Ok(())
                }
                CardKind::Beer => {
                    if target.is_some_and(|target| target != player) {
                        Err(ActionError::InvalidTarget)
                    } else {
                        Ok(())
                    }
                }
                _ => Err(ActionError::WrongAction),
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
            play_card(state, player, card, target, &mut events);
            match card.card().unwrap().kind {
                CardKind::Bang => {
                    state.turn.bangs_played += 1;
                    state.push_pending(PendingKind::AttackResponse {
                        target: target.unwrap(),
                        source: player,
                        kind: AttackKind::Bang,
                        remaining: 1,
                        damage: 1,
                    });
                }
                CardKind::Beer => heal(state, player, &mut events),
                _ => unreachable!("validated playable card"),
            }
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
                        heal(state, player, &mut events);
                        if state.players[player.0].health > 0 {
                            state.pending.pop();
                        } else if let PendingKind::Dying { needed, .. } =
                            &mut state.pending.last_mut().unwrap().kind
                        {
                            *needed = (1 - state.players[player.0].health) as u16;
                        }
                    }
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
                }
            }
        }
        Action::EndTurn { discard } => {
            for card in discard {
                remove_from_hand(state, player, card);
                state.discard_pile.push(card);
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
    state.discard_pile.push(card);
    events.push(Event::public(EventKind::CardPlayed {
        player,
        card,
        target,
    }));
}

fn heal(state: &mut GameState, player: PlayerId, events: &mut Vec<Event>) {
    if state.players.iter().filter(|p| p.alive).count() <= 2 {
        return;
    }
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

fn discard_all(state: &mut GameState, player: PlayerId, events: &mut Vec<Event>) {
    let own = &mut state.players[player.0];
    for card in std::mem::take(&mut own.hand)
        .into_iter()
        .chain(std::mem::take(&mut own.in_play))
    {
        state.discard_pile.push(card);
        events.push(Event::public(EventKind::CardDiscarded { player, card }));
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
            draw(state, source, 3, rng, events);
        } else if role == Role::Deputy && state.players[source.0].role == Role::Sheriff {
            discard_all(state, source, events);
        }
    }
    if let Some(winner) = rules::winner(state) {
        state.winner = Some(winner);
        state.pending.clear();
        events.push(Event::public(EventKind::GameEnded {
            winner,
            roles: state.players.iter().map(|p| p.role).collect(),
        }));
    }
}

fn draw<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    count: usize,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let mut cards = Vec::new();
    for _ in 0..count {
        if state.draw_pile.is_empty() && !state.discard_pile.is_empty() {
            state.draw_pile = std::mem::take(&mut state.discard_pile);
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

fn next_turn(state: &mut GameState, events: &mut Vec<Event>) {
    let count = state.players.len();
    let next = (1..=count)
        .map(|offset| (state.turn.player.0 + offset) % count)
        .find(|index| state.players[*index].alive)
        .unwrap();
    let player = PlayerId(next);
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
    while state.winner.is_none() && state.pending.is_empty() {
        if !state.players[state.turn.player.0].alive {
            next_turn(state, events);
        }
        match state.turn.step {
            // B2 will resolve these cards before advancing to the draw step.
            TurnStep::Dynamite => state.turn.step = TurnStep::Jail,
            TurnStep::Jail => state.turn.step = TurnStep::Draw,
            TurnStep::Draw => {
                draw(state, state.turn.player, 2, rng, events);
                state.turn.step = TurnStep::Play;
            }
            TurnStep::Play => break,
        }
    }
}

pub fn default_action(state: &GameState) -> Option<(PlayerId, Action)> {
    let decision = state.decision()?;
    let action = if let Some(pending_id) = decision.pending_id {
        Action::Respond {
            pending_id,
            card: None,
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
