use super::{GameModule, GameSession};
use protocol::{ErrorCode, GameAction, GameSeat, GameSettings, GameView, ServerMessage};
use tokio::time::Instant;

pub(super) struct Module;

impl GameModule for Module {
    fn enabled(&self) -> bool {
        false
    }
    fn limits(&self, _settings: &GameSettings) -> (u32, u32) {
        ::werewolf::PLAYER_LIMITS
    }
    fn default_settings(&self) -> GameSettings {
        GameSettings::Werewolf(::werewolf::Settings::default())
    }
    fn validate_settings(&self, settings: &GameSettings, _players: usize) -> Result<(), ErrorCode> {
        match settings {
            GameSettings::Werewolf(_) => Ok(()),
            _ => Err(ErrorCode::InvalidSettings),
        }
    }
    fn adjust_settings(&self, _settings: &mut GameSettings, _players: usize) {}
    fn start(
        &self,
        _seats: Vec<GameSeat>,
        _settings: &GameSettings,
        _seed: Option<u64>,
        _now: Instant,
    ) -> Result<Box<dyn GameSession>, ErrorCode> {
        Err(ErrorCode::GameUnavailable)
    }
}

// Kept as an implementation checklist; disabled modules never construct sessions.
#[allow(dead_code)]
struct Session;

impl GameSession for Session {
    fn seq(&self) -> u32 {
        todo!("Track the successful Werewolf step sequence")
    }
    fn seats(&self) -> &[GameSeat] {
        todo!("Keep immutable Werewolf seat identities")
    }
    fn waiting_since(&self) -> Instant {
        todo!("Track when the awaited Werewolf decision changes")
    }
    fn is_over(&self) -> bool {
        todo!("Implement Werewolf victory rules")
    }
    fn view(&self, _member: &str) -> GameView {
        todo!("Filter Werewolf views by authenticated recipient")
    }
    fn update(&self, _member: &str) -> ServerMessage {
        todo!("Render recipient-filtered Werewolf events and view, including setup at seq=0")
    }
    fn apply(
        &mut self,
        _member: &str,
        _action: GameAction,
        _now: Instant,
    ) -> Result<(), ErrorCode> {
        todo!("Validate Werewolf tag and actor; errors preserve state, RNG and seq")
    }
    fn apply_default(&mut self, _now: Instant) -> Result<(), ErrorCode> {
        todo!("Apply one deterministic Werewolf default step through the same sequence path")
    }
    fn awaited_seat(&self) -> Option<usize> {
        todo!("Identify the Werewolf seat awaiting a default action")
    }
    fn may_continue_abandoned(&self, _present: &dyn Fn(usize) -> bool) -> bool {
        todo!("Define when an abandoned Werewolf session can advance without spinning")
    }
}
