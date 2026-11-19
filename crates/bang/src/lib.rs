//! Pure BANG! rules; all randomness is supplied by the caller.
//! GameState and raw events contain secrets; send views and filtered events to clients.

pub mod actions;
pub mod config;
pub mod engine;
pub mod events;
pub mod model;
pub mod rules;
pub mod state;
pub mod view;

pub use actions::{Action, ActionError, CardSelection, DrawSource};
pub use config::{GameConfig, GameMode, RoleCounts};
pub use engine::{apply, default_action, setup};
pub use events::{Event, EventKind, Visibility, filter_events};
pub use model::*;
pub use rules::{DistanceModifiers, distance, effective_distance};
pub use state::*;
pub use view::{PlayerView, SpectatorView, spectator_view, view};
