use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Wire snapshots have no variant accepting a raw GameState.
///
/// ```compile_fail
/// fn outgoing(state: ::werewolf::GameState) -> protocol::werewolf::WerewolfView { state.into() }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "perspective", content = "view", rename_all = "snake_case")]
pub enum WerewolfView {
    Player(::werewolf::PlayerView),
    Spectator(::werewolf::SpectatorView),
}

/// Only filtered event kinds can be constructed for outgoing messages.
///
/// ```compile_fail
/// let raw: Vec<::werewolf::Event> = vec![];
/// let outgoing: protocol::werewolf::WerewolfEvents = raw.into();
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct WerewolfEvents(Vec<::werewolf::EventKind>);

impl WerewolfEvents {
    pub fn empty() -> Self {
        Self(Vec::new())
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn extend(&mut self, other: Self) {
        self.0.extend(other.0);
    }

    pub fn for_recipient(
        events: &[::werewolf::Event],
        player: Option<::werewolf::PlayerId>,
    ) -> Self {
        Self(::werewolf::filter_events(events, player))
    }
}
