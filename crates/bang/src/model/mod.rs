mod cards;
mod dodge_city;
mod expansion;
pub use cards::*;
pub use dodge_city::{DODGE_CITY_DECK, DODGE_CITY_FIRST_CARD};
pub use expansion::*;
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
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
    // Dodge City.
    ApacheKid,
    BelleStar,
    BillNoface,
    ChuckWengam,
    DocHolyday,
    ElenaFuente,
    GregDigger,
    HerbHunter,
    JoseDelgado,
    MollyStark,
    PatBrennan,
    PixiePete,
    SeanMallory,
    TequilaJoe,
    VeraCuster,
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

    /// Characters that exist only in Dodge City.
    pub const DODGE_CITY: [Self; 15] = [
        Self::ApacheKid,
        Self::BelleStar,
        Self::BillNoface,
        Self::ChuckWengam,
        Self::DocHolyday,
        Self::ElenaFuente,
        Self::GregDigger,
        Self::HerbHunter,
        Self::JoseDelgado,
        Self::MollyStark,
        Self::PatBrennan,
        Self::PixiePete,
        Self::SeanMallory,
        Self::TequilaJoe,
        Self::VeraCuster,
    ];

    pub const fn health(self) -> i16 {
        match self {
            Self::ElGringo
            | Self::PaulRegret
            | Self::ApacheKid
            | Self::ElenaFuente
            | Self::PixiePete
            | Self::SeanMallory
            | Self::VeraCuster => 3,
            _ => 4,
        }
    }
}
