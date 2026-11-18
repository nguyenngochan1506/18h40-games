mod cards;
pub use cards::*;
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PlayerId(pub usize);

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", ts(rename = "BangRole"))]
pub enum Role {
    Sheriff,
    Deputy,
    Outlaw,
    Renegade,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Character {
    BartCassidy,
    BlackJack,
    CalamityJanet,
    ElGringo,
    JesseJones,
    Jourdonnais,
    KitCarlson,
    LuckyDuke,
    PaulRegret,
    PedroRamirez,
    RoseDoolan,
    SidKetchum,
    SlabTheKiller,
    SuzyLafayette,
    VultureSam,
    WillyTheKid,
}

impl Character {
    pub const ALL: [Self; 16] = [
        Self::BartCassidy,
        Self::BlackJack,
        Self::CalamityJanet,
        Self::ElGringo,
        Self::JesseJones,
        Self::Jourdonnais,
        Self::KitCarlson,
        Self::LuckyDuke,
        Self::PaulRegret,
        Self::PedroRamirez,
        Self::RoseDoolan,
        Self::SidKetchum,
        Self::SlabTheKiller,
        Self::SuzyLafayette,
        Self::VultureSam,
        Self::WillyTheKid,
    ];

    pub const fn health(self) -> i16 {
        match self {
            Self::ElGringo | Self::PaulRegret => 3,
            _ => 4,
        }
    }
}
