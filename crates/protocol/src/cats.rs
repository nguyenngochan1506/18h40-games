use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Wire snapshots have no variant accepting a raw cats::State.
///
/// ```compile_fail
/// fn outgoing(state: ::cats::State) -> protocol::cats::CatsView { state.into() }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "perspective", content = "view", rename_all = "snake_case")]
pub enum CatsView {
    Player(::cats::PlayerView),
    Spectator(::cats::SpectatorView),
}

/// Only filtered event kinds can be constructed for outgoing messages.
///
/// ```compile_fail
/// let raw: Vec<::cats::Event> = vec![];
/// let outgoing: protocol::cats::CatsEvents = raw.into();
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CatsEvents(Vec<::cats::EventKind>);

impl CatsEvents {
    pub fn for_recipient(events: &[::cats::Event], player: Option<::cats::PlayerId>) -> Self {
        Self(
            ::cats::filter_events(events, player)
                .into_iter()
                .map(|event| event.kind)
                .collect(),
        )
    }
}
