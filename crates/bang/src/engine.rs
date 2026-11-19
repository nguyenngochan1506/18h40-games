use crate::state::{Defense, DrawContinuation};
use crate::{
    actions::{Action, ActionError, CardSelection, validate},
    events::{Event, EventKind, Visibility},
    model::{CardId, CardKind, Character, DECK, PlayerId, Role, Suit},
    rules,
    state::{AttackKind, GameState, PendingKind, Player, TurnState, TurnStep},
};
use rand::{Rng, seq::SliceRandom};
mod checks;
mod skills;

/// Deals initial hands, then starts the Sheriff's turn including character draw choices.
pub fn setup<R: Rng + ?Sized>(
    count: usize,
    config: crate::GameConfig,
    rng: &mut R,
) -> Result<(GameState, Vec<Event>), ActionError> {
    use Role::*;
    if !(4..=7).contains(&count) {
        return Err(ActionError::InvalidPlayerCount);
    }
    if !config.roles.valid_for(count) {
        return Err(ActionError::InvalidSettings);
    }
    let mut roles = vec![Sheriff];
    for (role, count) in [
        (Deputy, config.roles.deputy),
        (Outlaw, config.roles.outlaw),
        (Renegade, config.roles.renegade),
    ] {
        roles.extend(std::iter::repeat_n(role, usize::from(count)));
    }
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
                jail_turns_served: 0,
            }
        })
        .collect();
    let sheriff = PlayerId(roles.iter().position(|role| *role == Sheriff).unwrap());
    let mut draw_pile: Vec<_> = (0..DECK.len()).map(|id| CardId(id as u8)).collect();
    draw_pile.shuffle(rng);
    let mut state = GameState {
        config,
        dynamite_round: None,
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
        hidden_discards: Vec::new(),
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
        Action::ChooseHandSlot { slot, .. } => {
            let PendingKind::PickHandSlot {
                actor,
                target,
                kind,
                slots,
            } = state.pending.pop().unwrap().kind
            else {
                unreachable!()
            };
            let card = slots[usize::from(slot)];
            let index = state.players[target.0]
                .hand
                .iter()
                .position(|id| *id == card)
                .unwrap();
            state.players[target.0].hand.remove(index);
            events.push(Event::public(EventKind::HandSlotClaimed {
                actor,
                target,
                slot,
            }));
            resolve_affected_card(state, actor, target, kind, card, true, &mut events);
        }
        Action::FlipCheck { .. } => {
            let PendingKind::Check {
                player,
                reason,
                continuation,
            } = state.pending.pop().unwrap().kind
            else {
                unreachable!()
            };
            checks::begin(state, player, reason, continuation, rng, &mut events);
        }
        Action::FlipBarrel { .. } => {
            let PendingKind::AttackResponse {
                target,
                source,
                kind,
                remaining,
                checks_left,
                damage,
            } = state.pending.pop().unwrap().kind
            else {
                unreachable!()
            };
            if checks_left == 1 && state.players[target.0].character == Character::Jourdonnais {
                skills::activate(state, target, &mut events);
            }
            checks::begin(
                state,
                target,
                CardKind::Barrel,
                DrawContinuation::Defense {
                    defense: Defense {
                        target,
                        source,
                        kind,
                        remaining,
                        checks_left: checks_left - 1,
                        damage,
                    },
                },
                rng,
                &mut events,
            );
        }
        Action::ChooseDrawSource { source, .. } => {
            skills::choose_source(state, player, source, rng, &mut events)
        }
        Action::KeepCards { cards, .. } => skills::keep_cards(state, player, cards, &mut events),
        Action::ChooseDrawResult { card, .. } => checks::choose(state, card, rng, &mut events),
        Action::SidHeal { discard, .. } => skills::sid_heal(state, player, discard, &mut events),
        Action::Play { card, target } => {
            let physical = card.card().unwrap().kind;
            let kind = state.players[player.0].play_kind(physical);
            if kind != physical {
                skills::activate(state, player, &mut events);
            }
            if kind.is_equipment() {
                equip_card(state, player, card, target.unwrap_or(player), &mut events);
            } else {
                play_card(state, player, card, target, &mut events);
                match kind {
                    CardKind::Bang => {
                        if state.turn.bangs_played > 0
                            && state.players[player.0].character == Character::WillyTheKid
                        {
                            skills::activate(state, player, &mut events);
                        }
                        skills::range_used(state, player, target.unwrap(), &mut events);
                        state.turn.bangs_played += 1;
                        start_attack(
                            state,
                            player,
                            target.unwrap(),
                            AttackKind::Bang,
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
                        let mut pool = take_draw(state, order.len(), rng, &mut events);
                        pool.shuffle(rng);
                        events.push(Event::public(EventKind::StoreOpened {
                            count: pool.len() as u8,
                        }));
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
            if card.card().unwrap().kind == CardKind::Panic {
                skills::range_used(state, player, target, &mut events);
            }
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
        Action::ChooseStoreSlot { slot, .. } => {
            let card = if let PendingKind::GeneralStore { pool, cursor, .. } =
                &mut state.pending.last_mut().unwrap().kind
            {
                *cursor += 1;
                pool.remove(usize::from(slot))
            } else {
                unreachable!("validated store slot")
            };
            state.players[player.0].hand.push(card);
            events.push(Event::public(EventKind::StoreCardClaimed { player, slot }));
            events.push(Event {
                visibility: Visibility::Player(player),
                kind: EventKind::StoreCardReceived { card },
            });
            state.renew_pending_id();
        }
        Action::Respond { card, .. } => {
            let frame = state.pending.last().unwrap().clone();
            if let Some(card) = card {
                if card.card().unwrap().kind != crate::actions::response_kind(&frame.kind).unwrap()
                {
                    skills::activate(state, player, &mut events);
                }
                play_card(state, player, card, None, &mut events);
                match frame.kind {
                    PendingKind::AttackResponse { remaining, .. } => {
                        if remaining <= 1 {
                            state.pending.pop();
                        } else if let PendingKind::AttackResponse { remaining, .. } =
                            &mut state.pending.last_mut().unwrap().kind
                        {
                            *remaining -= 1;
                            state.renew_pending_id();
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
                            state.renew_pending_id();
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
                    } => damage_player(
                        state,
                        target,
                        Some(source),
                        Some(source),
                        damage,
                        rng,
                        &mut events,
                    ),
                    PendingKind::Dying {
                        player,
                        source,
                        duel_initiator,
                        ..
                    } => eliminate(state, player, source, duel_initiator, rng, &mut events),
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
                        damage_player(
                            state,
                            player,
                            Some(source),
                            Some(initiator),
                            1,
                            rng,
                            &mut events,
                        );
                        if let Some(frame) = state.pending.last_mut()
                            && let PendingKind::Dying { duel_initiator, .. } = &mut frame.kind
                        {
                            *duel_initiator = Some(initiator);
                        }
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
    if state.config.mode == crate::GameMode::Classic
        && kind.weapon_range().is_some()
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
    if state.config.mode == crate::GameMode::Club && kind == CardKind::Dynamite {
        state.dynamite_round = Some(crate::DynamiteRound {
            card,
            remaining: turn_order(state, target, true),
        });
    }
    if kind == CardKind::Jail {
        state.players[target.0].jail_turns_served = 0;
    }
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
            let mut slots = state.players[target.0].hand.clone();
            slots.shuffle(rng);
            events.push(Event::public(EventKind::HandSlotsOpened {
                actor: source,
                target,
                count: slots.len() as u8,
            }));
            state.push_pending(PendingKind::PickHandSlot {
                actor: source,
                target,
                kind,
                slots,
            });
            return;
        }
        CardSelection::InPlay(card) => {
            let index = state.players[target.0]
                .in_play
                .iter()
                .position(|id| *id == card)
                .unwrap();
            let card = state.players[target.0].in_play.remove(index);
            clear_in_play_state(state, target, card);
            card
        }
    };
    resolve_affected_card(state, source, target, kind, card, false, events);
}

fn resolve_affected_card(
    state: &mut GameState,
    source: PlayerId,
    target: PlayerId,
    kind: CardKind,
    card: CardId,
    from_hand: bool,
    events: &mut Vec<Event>,
) {
    if kind == CardKind::Panic {
        state.players[source.0].hand.push(card);
    } else {
        if from_hand {
            state.discard_hidden(card);
        } else {
            state.discard(card);
        }
    }
    if from_hand {
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
        if target != source && kind == CardKind::CatBalou {
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

fn damage_player<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    source: Option<PlayerId>,
    card_owner: Option<PlayerId>,
    damage: u8,
    rng: &mut R,
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
    skills::after_damage(state, player, card_owner, damage, rng, events);
    if state.players[player.0].health <= 0 {
        state.push_pending(PendingKind::Dying {
            player,
            source,
            needed: (1 - state.players[player.0].health) as u16,
            duel_initiator: None,
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
    clear_in_play_state(state, player, card);
    state.discard(card);
    events.push(Event::public(EventKind::CardDiscarded { player, card }));
}

fn clear_in_play_state(state: &mut GameState, player: PlayerId, card: CardId) {
    if card.card().unwrap().kind == CardKind::Jail {
        state.players[player.0].jail_turns_served = 0;
    }
    if state
        .dynamite_round
        .as_ref()
        .is_some_and(|round| round.card == card)
    {
        state.dynamite_round = None;
    }
}

fn discard_all(state: &mut GameState, player: PlayerId, events: &mut Vec<Event>) {
    let own = &mut state.players[player.0];
    let cards: Vec<_> = std::mem::take(&mut own.hand)
        .into_iter()
        .chain(std::mem::take(&mut own.in_play))
        .collect();
    for card in cards {
        clear_in_play_state(state, player, card);
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

fn discard_private_pool(state: &mut GameState, pool: Vec<CardId>, events: &mut Vec<Event>) {
    if pool.is_empty() {
        return;
    }
    let count = pool.len();
    for card in pool {
        state.discard_hidden(card);
    }
    events.push(Event::public(EventKind::PrivatePoolDiscarded { count }));
}

fn clear_pending(state: &mut GameState, events: &mut Vec<Event>) {
    for frame in std::mem::take(&mut state.pending) {
        match frame.kind {
            PendingKind::GeneralStore { pool, .. } => return_pool(state, pool, events),
            PendingKind::KeepCards { pool, .. } | PendingKind::ChooseDrawResult { pool, .. } => {
                discard_private_pool(state, pool, events);
            }
            PendingKind::PickHandSlot { .. }
            | PendingKind::DrawChoice { .. }
            | PendingKind::Check { .. }
            | PendingKind::AttackResponse { .. }
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
    duel_initiator: Option<PlayerId>,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    state.players[player.0].alive = false;
    let role = state.players[player.0].role;
    events.push(Event::public(EventKind::PlayerEliminated { player, role }));
    let vulture = state
        .players
        .iter()
        .position(|p| p.alive && p.character == Character::VultureSam)
        .map(PlayerId);
    let inherited = if vulture.is_some() {
        let own = &mut state.players[player.0];
        std::mem::take(&mut own.hand)
            .into_iter()
            .chain(std::mem::take(&mut own.in_play))
            .collect::<Vec<_>>()
    } else {
        discard_all(state, player, events);
        Vec::new()
    };
    for &card in &inherited {
        clear_in_play_state(state, player, card);
    }
    if let Some(source) = source.filter(|id| state.players.get(id.0).is_some_and(|p| p.alive)) {
        if role == Role::Outlaw && duel_initiator != Some(player) {
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
    if let Some(vulture) = vulture
        && !inherited.is_empty()
    {
        skills::activate(state, vulture, events);
        events.push(Event::public(EventKind::CardsInherited {
            player: vulture,
            victim: player,
            count: inherited.len(),
        }));
        skills::receive(state, vulture, inherited, events);
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
            state.hidden_discards.clear();
            state.draw_pile.shuffle(rng);
            events.push(Event::public(EventKind::DeckReshuffled {
                count: state.draw_pile.len(),
            }));
        }
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
    skills::receive(state, player, cards, events);
}

fn start_attack(
    state: &mut GameState,
    source: PlayerId,
    target: PlayerId,
    kind: AttackKind,
    events: &mut Vec<Event>,
) {
    let slab =
        kind == AttackKind::Bang && state.players[source.0].character == Character::SlabTheKiller;
    if slab {
        skills::activate(state, source, events);
    }
    let mut checks_left = 0;
    if kind != AttackKind::Indians {
        checks_left = u8::from(state.players[target.0].has_in_play(CardKind::Barrel));
        if state.players[target.0].character == Character::Jourdonnais {
            checks_left += 1;
        }
    }
    checks::defend(
        state,
        Defense {
            source,
            target,
            kind,
            remaining: if slab { 2 } else { 1 },
            checks_left,
            damage: 1,
        },
    );
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
        skills::after_action(state, rng, events);
        if let Some(frame) = state.pending.last().cloned() {
            if frame
                .player()
                .is_some_and(|player| !state.players[player.0].alive)
                && matches!(
                    frame.kind,
                    PendingKind::DrawChoice { .. }
                        | PendingKind::Check { .. }
                        | PendingKind::KeepCards { .. }
                        | PendingKind::ChooseDrawResult { .. }
                )
            {
                state.pending.pop();
                discard_private_pool(state, frame.cards().to_vec(), events);
                continue;
            }
            match frame.kind {
                PendingKind::PickHandSlot {
                    actor,
                    target,
                    kind,
                    slots,
                } => {
                    let hand = &state.players[target.0].hand;
                    if !state.players[actor.0].alive
                        || !state.players[target.0].alive
                        || hand.is_empty()
                    {
                        state.pending.pop();
                        events.push(Event::public(EventKind::HandPickCancelled {
                            actor,
                            target,
                        }));
                        continue;
                    }
                    if slots.len() != hand.len() || !slots.iter().all(|card| hand.contains(card)) {
                        let mut slots = hand.clone();
                        slots.shuffle(rng);
                        state.pending.last_mut().unwrap().kind = PendingKind::PickHandSlot {
                            actor,
                            target,
                            kind,
                            slots,
                        };
                        state.renew_pending_id();
                    }
                }
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
                    start_attack(state, source, targets[cursor], kind, events);
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
                    if state.config.mode == crate::GameMode::Club && state.dynamite_round.is_none()
                    {
                        state.dynamite_round = Some(crate::DynamiteRound {
                            card: dynamite,
                            remaining: turn_order(state, player, true),
                        });
                    }
                    checks::wait(
                        state,
                        player,
                        CardKind::Dynamite,
                        DrawContinuation::Dynamite {
                            player,
                            card: dynamite,
                        },
                    );
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
                    if state.config.mode == crate::GameMode::Club
                        && state.players[player.0].jail_turns_served >= 3
                    {
                        discard_in_play(state, player, jail, events);
                        events.push(Event::public(EventKind::JailExpired { player }));
                        continue;
                    }
                    checks::wait(
                        state,
                        player,
                        CardKind::Jail,
                        DrawContinuation::Jail { player, card: jail },
                    );
                }
            }
            TurnStep::Draw => {
                skills::draw_phase(state, player, rng, events);
            }
            TurnStep::Play => break,
        }
    }
}

pub fn default_action(state: &GameState) -> Option<(PlayerId, Action)> {
    let decision = state.decision()?;
    let action = if let Some(pending_id) = decision.pending_id {
        match &state.pending.last()?.kind {
            PendingKind::PickHandSlot { .. } => Action::ChooseHandSlot {
                pending_id,
                slot: 0,
            },
            PendingKind::GeneralStore { pool, .. } => {
                pool.first()?;
                Action::ChooseStoreSlot {
                    pending_id,
                    slot: 0,
                }
            }
            PendingKind::DrawChoice { .. } => Action::ChooseDrawSource {
                pending_id,
                source: crate::actions::DrawSource::Deck,
            },
            PendingKind::KeepCards { pool, keep, .. } => Action::KeepCards {
                pending_id,
                cards: pool.iter().take(*keep).copied().collect(),
            },
            PendingKind::ChooseDrawResult { pool, .. } => Action::ChooseDrawResult {
                pending_id,
                card: *pool.first()?,
            },
            PendingKind::Check { .. } => Action::FlipCheck { pending_id },
            PendingKind::AttackResponse { checks_left, .. } if *checks_left > 0 => {
                Action::FlipBarrel { pending_id }
            }
            _ => Action::Respond {
                pending_id,
                card: None,
            },
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
