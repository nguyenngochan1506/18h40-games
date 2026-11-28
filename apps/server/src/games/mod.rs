mod bang;
mod uno;
mod werewolf;

use protocol::{
    ErrorCode, GameAction, GameKind, GameSeat, GameSettings, GameSnapshot, GameView, ServerMessage,
};
use tokio::time::Instant;

pub(crate) trait GameModule: Sync {
    fn enabled(&self) -> bool;
    /// Seat limits for the room's current settings (an expansion can raise the maximum).
    fn limits(&self, settings: &GameSettings) -> (u32, u32);
    fn default_settings(&self) -> GameSettings;
    fn validate_settings(&self, settings: &GameSettings, players: usize) -> Result<(), ErrorCode>;
    fn adjust_settings(&self, settings: &mut GameSettings, players: usize);
    fn start(
        &self,
        seats: Vec<GameSeat>,
        settings: &GameSettings,
        seed: Option<u64>,
        now: Instant,
    ) -> Result<Box<dyn GameSession>, ErrorCode>;
}

pub(crate) trait GameSession: Send {
    fn seq(&self) -> u32;
    fn seats(&self) -> &[GameSeat];
    /// Reset only when the awaited decision changes, including a new frame for the same seat.
    fn waiting_since(&self) -> Instant;
    fn is_over(&self) -> bool;
    fn view(&self, member: &str) -> GameView;
    fn snapshot(&mut self, member: &str) -> GameSnapshot {
        GameSnapshot {
            seq: self.seq(),
            seats: self.seats().to_vec(),
            view: self.view(member),
        }
    }
    // Before the first action this renders the setup batch at seq=0; returns None when nothing
    // visible changed for this recipient.
    fn update(&mut self, member: &str) -> Option<ServerMessage>;
    /// Authenticate the actor by member; errors preserve state, RNG, sequence and batch.
    fn apply(&mut self, member: &str, action: GameAction, now: Instant) -> Result<(), ErrorCode>;
    fn apply_default(&mut self, now: Instant) -> Result<(), ErrorCode>;
    /// An index into seats() awaiting the default step; None when no step is available.
    fn awaited_seat(&self) -> Option<usize>;
    /// Presence means retained room membership, including offline members.
    fn may_continue_abandoned(&self, present: &dyn Fn(usize) -> bool) -> bool;
}

pub(crate) fn module(kind: GameKind) -> &'static dyn GameModule {
    match kind {
        GameKind::Bang => &bang::Module,
        GameKind::Uno => &uno::Module,
        GameKind::Werewolf => &werewolf::Module,
    }
}
