use bang::*;
use rand::{RngCore, SeedableRng};
use rand_chacha::ChaCha8Rng;

pub struct Scenario {
    pub state: GameState,
    pub rng: ChaCha8Rng,
}

impl Scenario {
    pub fn new(count: usize) -> Self {
        Self::with_config(count, GameConfig::default())
    }

    /// Dodge City on: 120-card deck, up to 8 players.
    pub fn dodge(count: usize) -> Self {
        Self::with_config(
            count,
            GameConfig {
                expansions: [Expansion::DodgeCity].into(),
                ..Default::default()
            },
        )
    }

    fn with_config(count: usize, config: GameConfig) -> Self {
        let mut rng = ChaCha8Rng::seed_from_u64(42);
        let (mut state, _) = setup(
            count,
            bang::GameConfig {
                roles: bang::RoleCounts::standard(count),
                ..config
            },
            &mut rng,
        )
        .unwrap();
        state.draw_pile = state.config.deck();
        state.discard_pile.clear();
        state.pending.clear();
        state.turn = TurnState {
            player: PlayerId(0),
            step: TurnStep::Play,
            bangs_played: 0,
        };
        for (index, player) in state.players.iter_mut().enumerate() {
            player.hand.clear();
            player.in_play.clear();
            player.role = if index == 0 {
                Role::Sheriff
            } else if index == count - 1 {
                Role::Renegade
            } else {
                Role::Outlaw
            };
            player.character = Character::SidKetchum;
            player.max_health = 4 + i16::from(index == 0);
            player.health = player.max_health;
        }
        Self { state, rng }
    }

    pub fn character(&mut self, player: usize, character: Character) {
        let own = &mut self.state.players[player];
        own.character = character;
        own.max_health = character.health() + i16::from(own.role == Role::Sheriff);
        own.health = own.max_health;
    }

    pub fn give(&mut self, player: usize, kind: CardKind) -> CardId {
        let index = self
            .state
            .draw_pile
            .iter()
            .position(|id| id.card().unwrap().kind == kind)
            .unwrap();
        let id = self.state.draw_pile.remove(index);
        self.state.players[player].hand.push(id);
        id
    }

    /// Moves the exact physical card (kind, suit, rank) from the draw pile to a hand.
    pub fn give_face(&mut self, player: usize, kind: CardKind, suit: Suit, rank: Rank) -> CardId {
        let face = Card { kind, suit, rank };
        let index = self
            .state
            .draw_pile
            .iter()
            .position(|id| id.card() == Some(face))
            .unwrap();
        let id = self.state.draw_pile.remove(index);
        self.state.players[player].hand.push(id);
        id
    }

    /// Puts a green card in front of a player as if placed in an earlier turn (ready to use).
    pub fn ready_green(&mut self, player: usize, kind: CardKind) -> CardId {
        self.equip(player, kind)
    }

    pub fn equip(&mut self, player: usize, kind: CardKind) -> CardId {
        let id = self.give(player, kind);
        self.state.players[player].hand.pop();
        self.state.players[player].in_play.push(id);
        id
    }

    pub fn top(&mut self, card: CardId) {
        let index = self
            .state
            .draw_pile
            .iter()
            .position(|id| *id == card)
            .unwrap();
        self.state.draw_pile.remove(index);
        self.state.draw_pile.push(card);
    }

    pub fn top_face(&mut self, kind: CardKind, suit: Suit, rank: Rank) -> CardId {
        let face = Card { kind, suit, rank };
        let id = *self
            .state
            .draw_pile
            .iter()
            .find(|id| id.card() == Some(face))
            .unwrap();
        self.top(id);
        id
    }

    pub fn dead(&mut self, player: usize) {
        let own = &mut self.state.players[player];
        self.state.draw_pile.append(&mut own.hand);
        self.state.draw_pile.append(&mut own.in_play);
        own.alive = false;
        own.health = 0;
    }

    pub fn act(&mut self, player: usize, action: Action) -> Vec<Event> {
        let result = apply(&mut self.state, PlayerId(player), action, &mut self.rng).unwrap();
        invariant(&self.state);
        result
    }

    // Legacy rule scenarios resolve checks and blind picks; input tests use act directly.
    pub fn act_with_checks(&mut self, player: usize, action: Action) -> Vec<Event> {
        let mut events = self.act(player, action);
        while let Some(decision) = self.state.decision() {
            let Some(pending_id) = decision.pending_id else {
                break;
            };
            let action = match decision.kind {
                DecisionKind::PickHandSlot { .. } => Action::ChooseHandSlot {
                    pending_id,
                    slot: 0,
                },
                DecisionKind::Check { .. } => Action::FlipCheck { pending_id },
                DecisionKind::AttackResponse { checks_left, .. } if checks_left > 0 => {
                    Action::FlipBarrel { pending_id }
                }
                _ => break,
            };
            events.extend(self.act(decision.player.0, action));
        }
        events
    }

    pub fn reject(&mut self, player: usize, action: Action, expected: ActionError) {
        let before = self.state.clone();
        let before_rng = self.rng.clone();
        assert_eq!(
            apply(&mut self.state, PlayerId(player), action, &mut self.rng),
            Err(expected)
        );
        assert_eq!(self.state, before);
        assert_eq!(self.rng.get_word_pos(), before_rng.get_word_pos());
        assert_eq!(self.rng.get_stream(), before_rng.get_stream());
        assert_eq!(self.rng.clone().next_u64(), before_rng.clone().next_u64());
        invariant(&self.state);
    }

    pub fn shoot(&mut self, source: usize, target: usize) -> CardId {
        let card = self.give(source, CardKind::Bang);
        self.act_with_checks(
            source,
            Action::Play {
                card,
                target: Some(PlayerId(target)),
            },
        );
        card
    }

    pub fn respond(&mut self, card: Option<CardId>) -> Vec<Event> {
        let frame = self.state.pending.last().unwrap();
        let player = frame.player().unwrap().0;
        let pending_id = frame.id;
        self.act_with_checks(player, Action::Respond { pending_id, card })
    }

    pub fn dying_child(&mut self, player: usize, source: Option<PlayerId>) {
        // Preserve the private id counter when injecting a child interruption into a fixture.
        self.state.players[player].health = 0;
        let mut snapshot = serde_json::to_value(&self.state).unwrap();
        let id = snapshot["next_pending_id"].as_u64().unwrap();
        snapshot["next_pending_id"] = (id + 1).into();
        snapshot["pending"].as_array_mut().unwrap().push(
            serde_json::to_value(Pending {
                id: PendingId(id),
                kind: PendingKind::Dying {
                    player: PlayerId(player),
                    source,
                    needed: 1,
                    duel_initiator: None,
                },
            })
            .unwrap(),
        );
        self.state = serde_json::from_value(snapshot).unwrap();
        invariant(&self.state);
    }

    pub fn end(&mut self) -> Vec<Event> {
        let (player, action) = default_action(&self.state).unwrap();
        self.act_with_checks(player.0, action)
    }
}

pub fn invariant(state: &GameState) {
    let mut counts = [0u8; 256];
    for card in state
        .draw_pile
        .iter()
        .chain(&state.discard_pile)
        .chain(
            state
                .players
                .iter()
                .flat_map(|p| p.hand.iter().chain(&p.in_play)),
        )
        .chain(state.pending.iter().flat_map(Pending::cards))
    {
        assert!(card.card().is_some());
        counts[usize::from(card.0)] += 1;
    }
    // One pass over the room deck builds the expected counts; compare the two arrays.
    let mut expected = [0u8; 256];
    for id in state.config.deck() {
        expected[usize::from(id.0)] = 1;
    }
    assert!(
        counts == expected,
        "Every physical card of the room deck must belong to exactly one zone"
    );
    for (index, player) in state.players.iter().enumerate() {
        assert_eq!(
            player.max_health,
            player.character.health() + i16::from(player.role == Role::Sheriff)
        );
        assert!(player.health <= player.max_health);
        let kinds: std::collections::BTreeSet<_> = player
            .in_play
            .iter()
            .map(|card| card.card().unwrap().kind)
            .collect();
        assert_eq!(kinds.len(), player.in_play.len());
        assert!(
            state.config.mode == GameMode::Club
                || kinds
                    .iter()
                    .filter(|kind| kind.weapon_range().is_some())
                    .count()
                    <= 1
        );
        if player.alive && player.health <= 0 {
            assert!(state.pending.iter().any(|frame| matches!(frame.kind, PendingKind::Dying { player, needed, .. } if player == PlayerId(index) && needed == (1 - state.players[index].health) as u16)));
        }
        if !player.alive {
            assert!(player.hand.is_empty() && player.in_play.is_empty());
        }
        assert!(
            player
                .fresh_green
                .iter()
                .all(|c| player.in_play.contains(c))
        );
        assert!(
            player
                .placed_green
                .iter()
                .all(|c| player.fresh_green.contains(c))
        );
        assert!(player.copied.is_none() || player.character == Character::VeraCuster);
    }
    if state.winner.is_none() {
        let decision = state
            .decision()
            .expect("A running game must await a valid decision");
        assert!(state.players[decision.player.0].alive);
        if decision.pending_id.is_none() {
            assert!(state.players[decision.player.0].health > 0);
        }
    } else {
        assert!(state.pending.is_empty());
        assert!(state.decision().is_none());
    }
}

fn decision_actions(state: &GameState) -> Vec<Action> {
    let (player, default) = default_action(state).unwrap();
    let own = &state.players[player.0];
    let mut actions = vec![default];
    if let Some(frame) = state.pending.last() {
        let kind = match &frame.kind {
            PendingKind::PickHandSlot { slots, .. } => {
                return (0..slots.len())
                    .map(|slot| Action::ChooseHandSlot {
                        pending_id: frame.id,
                        slot: slot as u8,
                    })
                    .collect();
            }
            PendingKind::Check { .. } => {
                return vec![Action::FlipCheck {
                    pending_id: frame.id,
                }];
            }
            PendingKind::AttackResponse {
                kind: AttackKind::Indians,
                ..
            }
            | PendingKind::Duel { .. } => CardKind::Bang,
            PendingKind::AttackResponse { .. } => CardKind::Missed,
            PendingKind::Dying { .. } => CardKind::Beer,
            PendingKind::DrawChoice { .. } => {
                if own.has(Character::PedroRamirez) && !state.discard_pile.is_empty() {
                    actions.push(Action::ChooseDrawSource {
                        pending_id: frame.id,
                        source: DrawSource::Discard,
                    });
                }
                if own.has(Character::PatBrennan) {
                    for (i, target) in state.players.iter().enumerate() {
                        for &card in &target.in_play {
                            actions.push(Action::ChooseDrawSource {
                                pending_id: frame.id,
                                source: DrawSource::InPlay {
                                    player: PlayerId(i),
                                    card,
                                },
                            });
                        }
                    }
                }
                if own.has(Character::JesseJones) {
                    for (i, target) in state.players.iter().enumerate() {
                        if i != player.0 && target.alive && !target.hand.is_empty() {
                            actions.push(Action::ChooseDrawSource {
                                pending_id: frame.id,
                                source: DrawSource::Player(PlayerId(i)),
                            });
                        }
                    }
                }
                return actions;
            }
            PendingKind::KeepCards { pool, keep, .. } => {
                for start in 0..pool.len() {
                    actions.push(Action::KeepCards {
                        pending_id: frame.id,
                        cards: pool
                            .iter()
                            .cycle()
                            .skip(start)
                            .take(*keep)
                            .copied()
                            .collect(),
                    });
                }
                return actions;
            }
            PendingKind::ChooseDrawResult { pool, .. } => {
                actions.extend(pool.iter().map(|&card| Action::ChooseDrawResult {
                    pending_id: frame.id,
                    card,
                }));
                return actions;
            }
            PendingKind::GeneralStore { pool, .. } => {
                actions.extend((0..pool.len() as u8).map(|slot| Action::ChooseStoreSlot {
                    pending_id: frame.id,
                    slot,
                }));
                return actions;
            }
            PendingKind::ChooseCopy { .. } => {
                return (0..state.players.len())
                    .filter(|i| *i != player.0 && state.players[*i].alive)
                    .map(|i| Action::ChooseCopy {
                        pending_id: frame.id,
                        target: PlayerId(i),
                    })
                    .collect();
            }
            PendingKind::VultureSplit { pool, hand_len, .. } => {
                if *hand_len > 0 {
                    actions.push(Action::VultureTake {
                        pending_id: frame.id,
                        selection: CardSelection::Hand,
                    });
                }
                actions.extend(pool[*hand_len..].iter().map(|&card| Action::VultureTake {
                    pending_id: frame.id,
                    selection: CardSelection::InPlay(card),
                }));
                return actions;
            }
            PendingKind::ResolveTargets { .. } | PendingKind::ResolveBrawl { .. } => {
                panic!("Automatic frame must not await input")
            }
        };
        if matches!(frame.kind, PendingKind::AttackResponse { checks_left, .. } if checks_left > 0)
        {
            actions.push(Action::Respond {
                pending_id: frame.id,
                card: None,
            });
        }
        actions.extend(
            own.hand
                .iter()
                .filter(|card| own.accepts_response(card.card().unwrap().kind, kind))
                .map(|&card| Action::Respond {
                    pending_id: frame.id,
                    card: Some(card),
                }),
        );
        if kind == CardKind::Missed {
            actions.extend(own.green_answers().map(|card| Action::Respond {
                pending_id: frame.id,
                card: Some(card),
            }));
        }
    } else {
        for &card in &own.hand {
            let kind = own.play_kind(card.card().unwrap().kind);
            match kind {
                CardKind::Bang | CardKind::Duel | CardKind::Jail => {
                    for (index, target) in state.players.iter().enumerate() {
                        if !target.alive || index == player.0 {
                            continue;
                        }
                        if kind == CardKind::Bang
                            && ((state.turn.bangs_played > 0 && !own.unlimited_bangs())
                                || effective_distance(state, player, PlayerId(index)).unwrap()
                                    > own.weapon_range())
                        {
                            continue;
                        }
                        if kind == CardKind::Jail
                            && (target.role == Role::Sheriff || target.has_in_play(kind))
                        {
                            continue;
                        }
                        actions.push(Action::Play {
                            card,
                            target: Some(PlayerId(index)),
                        });
                    }
                }
                CardKind::Panic | CardKind::CatBalou => {
                    for (index, target) in state.players.iter().enumerate() {
                        if !target.alive
                            || (kind == CardKind::Panic
                                && effective_distance(state, player, PlayerId(index)).unwrap() > 1)
                        {
                            continue;
                        }
                        if target.hand.len() > usize::from(index == player.0) {
                            actions.push(Action::AffectCard {
                                card,
                                target: PlayerId(index),
                                selection: CardSelection::Hand,
                            });
                        }
                        actions.extend(target.in_play.iter().map(|&selected| Action::AffectCard {
                            card,
                            target: PlayerId(index),
                            selection: CardSelection::InPlay(selected),
                        }));
                    }
                }
                CardKind::Missed
                | CardKind::Dodge
                | CardKind::Punch
                | CardKind::RagTime
                | CardKind::Brawl
                | CardKind::Springfield
                | CardKind::Tequila
                | CardKind::Whisky => {}
                _ if kind.is_equipment() && own.has_in_play(kind) => {}
                _ => actions.push(Action::Play { card, target: None }),
            }
        }
    }
    actions
}

pub fn legal_actions(state: &GameState) -> Vec<(PlayerId, Action)> {
    let player = state.decision().unwrap().player;
    let mut actions: Vec<_> = decision_actions(state)
        .into_iter()
        .map(|a| (player, a))
        .collect();
    for (i, own) in state.players.iter().enumerate() {
        if own.alive
            && own.character == Character::SidKetchum
            && own.health < own.max_health
            && own.hand.len() >= 2
        {
            let player = PlayerId(i);
            let pending_id = state
                .pending
                .last()
                .filter(|f| matches!(f.kind, PendingKind::Dying { player: p, .. } if p == player))
                .map(|f| f.id);
            actions.push((
                player,
                Action::SidHeal {
                    pending_id,
                    discard: [own.hand[0], own.hand[1]],
                },
            ));
        }
    }
    actions
}

/// Dodge City decision candidates for the fuzz bots: everything `legal_actions` offers plus
/// the new actions, keeping only those the engine accepts (checked on clones).
pub fn dodge_legal_actions(state: &GameState, rng: &ChaCha8Rng) -> Vec<(PlayerId, Action)> {
    let mut candidates = legal_actions(state);
    let decision = state.decision().unwrap();
    if decision.pending_id.is_none() {
        let player = decision.player;
        let own = &state.players[player.0];
        let others: Vec<_> = (0..state.players.len())
            .filter(|i| *i != player.0 && state.players[*i].alive)
            .map(PlayerId)
            .collect();
        let selections = |target: PlayerId| {
            let t = &state.players[target.0];
            let mut list = vec![CardSelection::Hand];
            list.extend(t.in_play.iter().map(|c| CardSelection::InPlay(*c)));
            list
        };
        let mut actions = vec![Action::ChuckDraw];
        for &card in &own.hand {
            if card.card().unwrap().kind == CardKind::Punch {
                actions.extend(others.iter().map(|&target| Action::Play {
                    card,
                    target: Some(target),
                }));
            }
        }
        let mut targets: Vec<Option<PlayerId>> = vec![None];
        targets.extend((0..state.players.len()).map(|i| Some(PlayerId(i))));
        for &card in &own.hand {
            actions.push(Action::JoseDelgado { card });
            for &discard in own.hand.iter().filter(|c| **c != card).take(2) {
                for &target in &targets {
                    actions.push(Action::PlayWithDiscard {
                        card,
                        discard,
                        target,
                    });
                }
                for i in 0..state.players.len() {
                    for selection in selections(PlayerId(i)) {
                        actions.push(Action::AffectWithDiscard {
                            card,
                            discard,
                            target: PlayerId(i),
                            selection,
                        });
                    }
                }
                for in_play_first in [false, true] {
                    let picks = others
                        .iter()
                        .filter_map(|&target| {
                            let t = &state.players[target.0];
                            let selection =
                                if t.hand.is_empty() || (in_play_first && !t.in_play.is_empty()) {
                                    CardSelection::InPlay(*t.in_play.first()?)
                                } else {
                                    CardSelection::Hand
                                };
                            Some(BrawlPick { target, selection })
                        })
                        .collect();
                    actions.push(Action::Brawl {
                        card,
                        discard,
                        picks,
                    });
                }
            }
            for second in own.hand.iter().filter(|c| **c != card).take(2) {
                for &target in &others {
                    actions.push(Action::DocHolyday {
                        cards: [card, *second],
                        target,
                    });
                }
            }
        }
        for green in own.ready_green() {
            actions.push(Action::ActivateGreen {
                card: green,
                target: None,
                selection: None,
            });
            for i in 0..state.players.len() {
                actions.push(Action::ActivateGreen {
                    card: green,
                    target: Some(PlayerId(i)),
                    selection: None,
                });
                for selection in selections(PlayerId(i)) {
                    actions.push(Action::ActivateGreen {
                        card: green,
                        target: Some(PlayerId(i)),
                        selection: Some(selection),
                    });
                }
            }
        }
        candidates.extend(actions.into_iter().map(|a| (player, a)));
    }
    candidates.retain(|(player, action)| {
        apply(
            &mut state.clone(),
            *player,
            action.clone(),
            &mut rng.clone(),
        )
        .is_ok()
    });
    assert!(!candidates.is_empty());
    candidates
}
