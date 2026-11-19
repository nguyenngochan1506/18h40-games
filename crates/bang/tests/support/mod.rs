use bang::*;
use rand::{RngCore, SeedableRng};
use rand_chacha::ChaCha8Rng;

pub struct Scenario {
    pub state: GameState,
    pub rng: ChaCha8Rng,
}

impl Scenario {
    pub fn new(count: usize) -> Self {
        let mut rng = ChaCha8Rng::seed_from_u64(42);
        let (mut state, _) = setup(
            count,
            bang::GameConfig {
                roles: bang::RoleCounts::standard(count),
                ..Default::default()
            },
            &mut rng,
        )
        .unwrap();
        state.draw_pile = (0..80).map(CardId).collect();
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
        self.act(
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
        self.act(player, Action::Respond { pending_id, card })
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
        self.act(player.0, action)
    }
}

pub fn invariant(state: &GameState) {
    let mut counts = [0u8; 80];
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
    assert!(
        counts.iter().all(|count| *count == 1),
        "Every physical card must belong to exactly one zone"
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
            PendingKind::AttackResponse {
                kind: AttackKind::Indians,
                ..
            }
            | PendingKind::Duel { .. } => CardKind::Bang,
            PendingKind::AttackResponse { .. } => CardKind::Missed,
            PendingKind::Dying { .. } => CardKind::Beer,
            PendingKind::DrawChoice { .. } => {
                if own.character == Character::PedroRamirez && !state.discard_pile.is_empty() {
                    actions.push(Action::ChooseDrawSource {
                        pending_id: frame.id,
                        source: DrawSource::Discard,
                    });
                }
                if own.character == Character::JesseJones {
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
            PendingKind::ResolveTargets { .. } => panic!("Automatic frame must not await input"),
        };
        actions.extend(
            own.hand
                .iter()
                .filter(|card| own.accepts_response(card.card().unwrap().kind, kind))
                .map(|&card| Action::Respond {
                    pending_id: frame.id,
                    card: Some(card),
                }),
        );
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
                CardKind::Missed => {}
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
