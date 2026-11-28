use super::{GameModule, GameSession};
use ::bang::{Action, Decision, Event, GameConfig, GameState, PlayerId, RoleCounts};
use protocol::{
    ErrorCode, GameAction, GameDelta, GameSeat, GameSettings, GameView, PROTOCOL_VERSION,
    ServerMessage,
    bang::{BangEvents, BangView},
};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use tokio::time::Instant;

pub(super) struct Module;

impl GameModule for Module {
    fn enabled(&self) -> bool {
        true
    }

    fn limits(&self, settings: &GameSettings) -> (u32, u32) {
        match settings {
            GameSettings::Bang(config) => (4, config.max_players() as u32),
            _ => (4, 7),
        }
    }

    fn default_settings(&self) -> GameSettings {
        GameSettings::Bang(GameConfig::default())
    }

    fn validate_settings(&self, settings: &GameSettings, players: usize) -> Result<(), ErrorCode> {
        let GameSettings::Bang(settings) = settings else {
            return Err(ErrorCode::InvalidSettings);
        };
        // Capacity follows the enabled packs; seated players above it reject the change.
        let max = settings.max_players();
        if !settings.expansions_valid()
            || players > max
            || !settings.roles.valid_within(players.max(4), max)
            || (players < 4 && settings.roles != RoleCounts::standard(4))
        {
            return Err(ErrorCode::InvalidSettings);
        }
        Ok(())
    }

    fn adjust_settings(&self, settings: &mut GameSettings, players: usize) {
        if let GameSettings::Bang(settings) = settings {
            settings.roles = RoleCounts::standard(players);
        }
    }

    fn start(
        &self,
        seats: Vec<GameSeat>,
        settings: &GameSettings,
        seed: Option<u64>,
        now: Instant,
    ) -> Result<Box<dyn GameSession>, ErrorCode> {
        self.validate_settings(settings, seats.len())?;
        let GameSettings::Bang(settings) = settings else {
            return Err(ErrorCode::InvalidSettings);
        };
        Ok(Box::new(Session::new(seats, settings.clone(), seed, now)?))
    }
}

struct Session {
    state: GameState,
    seq: u32,
    seats: Vec<GameSeat>,
    rng: ChaCha8Rng,
    decision: Option<Decision>,
    waiting_since: Instant,
    events: Vec<Event>,
}

impl Session {
    fn new(
        seats: Vec<GameSeat>,
        settings: GameConfig,
        seed: Option<u64>,
        now: Instant,
    ) -> Result<Self, ErrorCode> {
        let mut rng = if let Some(seed) = seed {
            ChaCha8Rng::seed_from_u64(seed)
        } else {
            let mut seed = [0; 32];
            getrandom::fill(&mut seed).map_err(|_| ErrorCode::ServerBusy)?;
            ChaCha8Rng::from_seed(seed)
        };
        let (state, events) = ::bang::setup(seats.len(), settings, &mut rng)
            .map_err(|_| ErrorCode::InvalidSettings)?;
        let decision = state.decision();
        Ok(Self {
            state,
            seq: 0,
            seats,
            rng,
            decision,
            waiting_since: now,
            events,
        })
    }

    fn player(&self, member: &str) -> Option<PlayerId> {
        self.seats
            .iter()
            .position(|seat| seat.member_id == member)
            .map(PlayerId)
    }

    fn recipient(&self, member: &str) -> Option<PlayerId> {
        self.player(member)
            .filter(|id| self.state.players[id.0].alive)
    }

    fn bang_view(&self, member: &str) -> BangView {
        match self.recipient(member) {
            Some(player) => BangView::Player(::bang::view(&self.state, player).unwrap()),
            None => BangView::Spectator(::bang::spectator_view(&self.state)),
        }
    }

    fn step(&mut self, player: PlayerId, action: Action, now: Instant) -> Result<(), ErrorCode> {
        if self.is_over() {
            return Err(ErrorCode::WrongPhase);
        }
        // The engine validates before mutating state or consuming randomness.
        let events = ::bang::apply(&mut self.state, player, action, &mut self.rng)
            .map_err(|_| ErrorCode::IllegalAction)?;
        self.events = events;
        self.seq += 1;
        let decision = self.state.decision();
        if decision != self.decision {
            self.waiting_since = now;
            self.decision = decision;
        }
        Ok(())
    }
}

impl GameSession for Session {
    fn seq(&self) -> u32 {
        self.seq
    }

    fn seats(&self) -> &[GameSeat] {
        &self.seats
    }

    fn waiting_since(&self) -> Instant {
        self.waiting_since
    }

    fn is_over(&self) -> bool {
        self.state.winner.is_some()
    }

    fn view(&self, member: &str) -> GameView {
        GameView::Bang(self.bang_view(member))
    }

    fn update(&mut self, member: &str) -> Option<ServerMessage> {
        let update = GameDelta::Bang {
            events: BangEvents::for_recipient(&self.events, self.recipient(member)),
            view: self.bang_view(member),
        };
        Some(if self.is_over() {
            ServerMessage::GameOver {
                v: PROTOCOL_VERSION,
                seq: self.seq,
                update,
            }
        } else {
            ServerMessage::GameUpdate {
                v: PROTOCOL_VERSION,
                seq: self.seq,
                update,
            }
        })
    }

    fn apply(&mut self, member: &str, action: GameAction, now: Instant) -> Result<(), ErrorCode> {
        if self.is_over() {
            return Err(ErrorCode::WrongPhase);
        }
        let action = match action {
            GameAction::Bang(action) => action,
            GameAction::Cats(_) | GameAction::Uno(_) | GameAction::Werewolf(_) => {
                return Err(ErrorCode::IllegalAction);
            }
        };
        let player = self.player(member).ok_or(ErrorCode::IllegalAction)?;
        self.step(player, action, now)
    }

    fn apply_default(&mut self, now: Instant) -> Result<(), ErrorCode> {
        let (player, action) = ::bang::default_action(&self.state).ok_or(ErrorCode::WrongPhase)?;
        self.step(player, action, now)
    }

    fn awaited_seat(&self) -> Option<usize> {
        // Follow default_action, not decision(): a decision without a default step must not
        // reach apply_default (the room would panic) nor arm a deadline that can never fire.
        ::bang::default_action(&self.state).map(|(player, _)| player.0)
    }

    fn may_continue_abandoned(&self, present: &dyn Fn(usize) -> bool) -> bool {
        !self.state.pending.is_empty()
            || self
                .state
                .players
                .iter()
                .enumerate()
                .any(|(i, player)| player.alive && present(i))
    }
}
