use bang::{Action, Decision, Event, GameState, PlayerId};
use protocol::{
    ErrorCode, GameEvents, GameSeat, GameSnapshot, GameView, PROTOCOL_VERSION, ServerMessage,
};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use tokio::time::Instant;

pub(super) struct Game {
    pub state: GameState,
    pub seq: u32,
    pub seats: Vec<GameSeat>,
    rng: ChaCha8Rng,
    decision: Option<Decision>,
    pub waiting_since: Instant,
}

impl Game {
    pub fn new(
        seats: Vec<GameSeat>,
        seed: Option<u64>,
        now: Instant,
    ) -> Result<(Self, Vec<Event>), ErrorCode> {
        let mut rng = if let Some(seed) = seed {
            ChaCha8Rng::seed_from_u64(seed)
        } else {
            let mut seed = [0; 32];
            getrandom::fill(&mut seed).map_err(|_| ErrorCode::ServerBusy)?;
            ChaCha8Rng::from_seed(seed)
        };
        let (state, events) =
            bang::setup(seats.len(), &mut rng).map_err(|_| ErrorCode::NotEnoughPlayers)?;
        let decision = state.decision();
        Ok((
            Self {
                state,
                seq: 0,
                seats,
                rng,
                decision,
                waiting_since: now,
            },
            events,
        ))
    }

    pub fn player(&self, member: &str) -> Option<PlayerId> {
        self.seats
            .iter()
            .position(|seat| seat.member_id == member)
            .map(PlayerId)
    }

    fn recipient(&self, member: &str) -> Option<PlayerId> {
        self.player(member)
            .filter(|id| self.state.players[id.0].alive)
    }

    pub fn view(&self, member: &str) -> GameView {
        match self.recipient(member) {
            Some(player) => GameView::Player(bang::view(&self.state, player).unwrap()),
            None => GameView::Spectator(bang::spectator_view(&self.state)),
        }
    }

    pub fn snapshot(&self, member: &str) -> GameSnapshot {
        GameSnapshot {
            seq: self.seq,
            seats: self.seats.clone(),
            view: self.view(member),
        }
    }

    pub fn apply(
        &mut self,
        player: PlayerId,
        action: Action,
        now: Instant,
    ) -> Result<Vec<Event>, ErrorCode> {
        if self.state.winner.is_some() {
            return Err(ErrorCode::WrongPhase);
        }
        let events = bang::apply(&mut self.state, player, action, &mut self.rng)
            .map_err(|_| ErrorCode::IllegalAction)?;
        self.seq += 1;
        let decision = self.state.decision();
        if decision != self.decision {
            self.waiting_since = now;
            self.decision = decision;
        }
        Ok(events)
    }

    pub fn update(&self, member: &str, events: &[Event]) -> ServerMessage {
        let events = GameEvents::for_recipient(events, self.recipient(member));
        let view = self.view(member);
        if self.state.winner.is_some() {
            ServerMessage::GameOver {
                v: PROTOCOL_VERSION,
                seq: self.seq,
                events,
                view,
            }
        } else {
            ServerMessage::GameUpdate {
                v: PROTOCOL_VERSION,
                seq: self.seq,
                events,
                view,
            }
        }
    }
}
