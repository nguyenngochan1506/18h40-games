use super::{Card, Character, DODGE_CITY_DECK, DODGE_CITY_FIRST_CARD};
use serde::{Deserialize, Serialize};

/// Optional content packs a room can add to the base game.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Expansion {
    DodgeCity,
}

/// Declarative content of an expansion: the room deck is the base deck plus the cards of every
/// enabled pack. Rules that need code live next to the engine and check `GameConfig::has`.
pub struct Pack {
    /// First `CardId` of the pack; the cards occupy consecutive ids from here.
    pub first_card: usize,
    pub cards: &'static [Card],
    pub characters: &'static [Character],
    /// Largest table the pack supports (role presets are in `RoleCounts::standard`).
    pub max_players: usize,
}

impl Expansion {
    pub const fn pack(self) -> Pack {
        match self {
            Self::DodgeCity => Pack {
                first_card: DODGE_CITY_FIRST_CARD,
                cards: &DODGE_CITY_DECK,
                characters: &Character::DODGE_CITY,
                max_players: 8,
            },
        }
    }
}
