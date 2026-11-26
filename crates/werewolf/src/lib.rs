//! Pure Ultimate Werewolf: Deluxe Edition rules engine.
//! No network, DB, or rendering dependencies.
//! GameState intentionally does not derive Serialize; only filtered Views and Events cross the wire.

pub mod engine;
pub mod types;

pub const PLAYER_LIMITS: (u32, u32) = (5, 16);

pub use engine::{
    GameState, apply, decision, default_action, filter_events, setup, spectator_view, view,
};
pub use types::{
    Action, ActionError, DayVoteChoice, DeathCause, Decision, Event, EventKind, NightStep,
    PlayerId, PlayerView, PublicPhase, PublicPlayer, Role, RoleDeck, SeerInspection, Settings,
    SetupError, SorcererInspection, SpectatorView, Team, Visibility, Winner, WolfVoteEntry,
};
