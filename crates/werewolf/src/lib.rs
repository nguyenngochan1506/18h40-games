//! SCAFFOLD only: no rules yet; read ADDING_A_GAME.md before implementing.
//! Pure game rules must not know about rooms or connections.
//! GameState must never derive Serialize; View and Events contain only recipient-filtered data.

// TODO: Estimated player limits; the implementer must finalize them.
pub const PLAYER_LIMITS: (u32, u32) = (5, 16);

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfSettings"))]
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Settings {}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfAction"))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfView"))]
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct View {}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfEvents"))]
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Events {}
