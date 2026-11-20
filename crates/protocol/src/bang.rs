use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Wire snapshots have no variant accepting a raw GameState.
///
/// ```compile_fail
/// fn outgoing(state: ::bang::GameState) -> protocol::bang::BangView { state.into() }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "perspective", content = "view", rename_all = "snake_case")]
pub enum BangView {
    Player(::bang::PlayerView),
    Spectator(::bang::SpectatorView),
}

/// Only filtered event kinds can be constructed for outgoing messages.
///
/// ```compile_fail
/// let raw: Vec<::bang::Event> = vec![];
/// let outgoing: protocol::bang::BangEvents = raw.into();
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct BangEvents(Vec<::bang::EventKind>);

impl BangEvents {
    pub fn for_recipient(events: &[::bang::Event], player: Option<::bang::PlayerId>) -> Self {
        Self(
            ::bang::filter_events(events, player)
                .into_iter()
                .map(|event| event.kind)
                .collect(),
        )
    }
}
