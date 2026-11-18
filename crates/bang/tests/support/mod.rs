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
        let (mut state, _) = setup(count, &mut rng).unwrap();
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
            player.character = Character::BartCassidy;
            player.max_health = 4 + i16::from(index == 0);
            player.health = player.max_health;
        }
        Self { state, rng }
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
        let player = frame.player().0;
        let pending_id = frame.id;
        self.act(player, Action::Respond { pending_id, card })
    }

    pub fn end(&mut self) -> Vec<Event> {
        let (player, action) = default_action(&self.state).unwrap();
        self.act(player.0, action)
    }
}

pub fn invariant(state: &GameState) {
    let mut counts = [0u8; 80];
    for card in state.draw_pile.iter().chain(&state.discard_pile).chain(
        state
            .players
            .iter()
            .flat_map(|p| p.hand.iter().chain(&p.in_play)),
    ) {
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
