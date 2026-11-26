use super::{GameModule, GameSession};
use ::werewolf::{Action, Decision, Event, GameState, PlayerId, RoleDeck, Settings};
use protocol::{
    ErrorCode, GameAction, GameDelta, GameSeat, GameSettings, GameView, PROTOCOL_VERSION,
    ServerMessage,
    werewolf::{WerewolfEvents, WerewolfView},
};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use tokio::time::Instant;

pub(super) struct Module;

impl GameModule for Module {
    fn enabled(&self) -> bool {
        true
    }
    fn limits(&self, _settings: &GameSettings) -> (u32, u32) {
        ::werewolf::PLAYER_LIMITS
    }

    fn default_settings(&self) -> GameSettings {
        GameSettings::Werewolf(Settings::default())
    }

    fn validate_settings(&self, settings: &GameSettings, players: usize) -> Result<(), ErrorCode> {
        let GameSettings::Werewolf(settings) = settings else {
            return Err(ErrorCode::InvalidSettings);
        };
        if !settings.roles.valid_for(players.max(5))
            || (players < 5 && settings.roles != RoleDeck::standard(5))
        {
            return Err(ErrorCode::InvalidSettings);
        }
        Ok(())
    }

    fn adjust_settings(&self, settings: &mut GameSettings, players: usize) {
        if let GameSettings::Werewolf(settings) = settings {
            settings.roles = RoleDeck::standard(players);
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
        let GameSettings::Werewolf(settings) = settings else {
            return Err(ErrorCode::InvalidSettings);
        };
        Ok(Box::new(Session::new(seats, *settings, seed, now)?))
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
        settings: Settings,
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
        let (state, events) = ::werewolf::setup(seats.len(), settings, &mut rng)
            .map_err(|_| ErrorCode::InvalidSettings)?;
        let decision = ::werewolf::decision(&state);
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

    fn is_awaited(&self, player: PlayerId) -> bool {
        self.decision
            .as_ref()
            .is_some_and(|decision| decision.awaited.contains(&player))
    }

    fn recipient(&self, member: &str) -> Option<PlayerId> {
        self.player(member)
            .filter(|id| self.state.players[id.0].alive || self.is_awaited(*id))
    }

    fn werewolf_view(&self, member: &str) -> WerewolfView {
        match self.recipient(member) {
            Some(player) => WerewolfView::Player(::werewolf::view(&self.state, player).unwrap()),
            None => WerewolfView::Spectator(::werewolf::spectator_view(&self.state)),
        }
    }

    fn step(&mut self, player: PlayerId, action: Action, now: Instant) -> Result<(), ErrorCode> {
        if self.is_over() {
            return Err(ErrorCode::WrongPhase);
        }
        let events = ::werewolf::apply(&mut self.state, player, action, &mut self.rng)
            .map_err(|_| ErrorCode::IllegalAction)?;
        self.events = events;
        self.seq += 1;
        let decision = ::werewolf::decision(&self.state);
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
        GameView::Werewolf(self.werewolf_view(member))
    }

    fn update(&self, member: &str) -> ServerMessage {
        let update = GameDelta::Werewolf {
            events: WerewolfEvents::for_recipient(&self.events, self.recipient(member)),
            view: self.werewolf_view(member),
        };
        if self.is_over() {
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
        }
    }

    fn apply(&mut self, member: &str, action: GameAction, now: Instant) -> Result<(), ErrorCode> {
        if self.is_over() {
            return Err(ErrorCode::WrongPhase);
        }
        let action = match action {
            GameAction::Werewolf(action) => action,
            GameAction::Bang(_) | GameAction::Uno(_) => return Err(ErrorCode::IllegalAction),
        };
        let player = self.player(member).ok_or(ErrorCode::IllegalAction)?;
        self.step(player, action, now)
    }

    fn apply_default(&mut self, now: Instant) -> Result<(), ErrorCode> {
        let (player, action) =
            ::werewolf::default_action(&self.state).ok_or(ErrorCode::WrongPhase)?;
        self.step(player, action, now)
    }

    fn awaited_seat(&self) -> Option<usize> {
        ::werewolf::default_action(&self.state).map(|(player, _)| player.0)
    }

    fn may_continue_abandoned(&self, present: &dyn Fn(usize) -> bool) -> bool {
        self.state
            .players
            .iter()
            .enumerate()
            .any(|(i, player)| (player.alive || self.is_awaited(PlayerId(i))) && present(i))
    }
}
