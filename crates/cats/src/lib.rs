//! Pure Mèo Nổ (Exploding Kittens) rules. All randomness is supplied by the
//! caller. `State` and raw `Event` carry secrets and intentionally do not
//! implement `Serialize`; send views and filtered events instead.

pub mod actions;
pub mod deck;
pub mod engine;
pub mod events;
pub mod model;
pub mod state;
pub mod view;

pub use actions::{Action, ActionError};
pub use engine::{apply, decision, default_action, setup};
pub use events::{Event, EventKind, Visibility, filter_events};
pub use model::{CardId, CardKind, CardView, PlayerId, Settings};
pub use state::{Decision, DecisionKind, PendingId, PlayedAction, PublicAction, State, TurnState};
pub use view::{PlayerView, SpectatorView, spectator_view, view};

pub const PLAYER_LIMITS: (u32, u32) = (2, 8);
