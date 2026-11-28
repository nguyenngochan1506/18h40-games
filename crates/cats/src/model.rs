use serde::{Deserialize, Serialize};

/// Stable seat identity for one game.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsPlayerId"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PlayerId(pub usize);

/// Physical card identity. The kind is encoded in the high digits so a held
/// `CardId` can always be resolved without a second table.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsCardId"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CardId(pub u16);

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsCardKind"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardKind {
    // Base game (13)
    Exploding,
    Defuse,
    Nope,
    Attack,
    Skip,
    Shuffle,
    SeeFuture,
    Favour,
    CatTaco,
    CatRainbow,
    CatBeard,
    CatPotato,
    CatCattermelon,
    // Imploding Kittens expansion (6 new kinds, 20 cards)
    Imploding,
    Reverse,
    DrawBottom,
    FeralCat,
    AlterFuture,
    TargetedAttack,
    // Streaking Kittens expansion (9 new kinds + 1 extra Exploding = 15 cards)
    Streaking,
    SuperSkip,
    SeeFuture5,
    AlterFuture5,
    SwapTopBottom,
    GarbageCollection,
    CatomicBomb,
    Mark,
    CurseCatButt,
    // Barking Kittens expansion (8 new kinds + 1 SuperSkip = 20 cards)
    PersonalAttack,
    ShareFuture,
    Bury,
    Potluck,
    BarkingKitten,
    IllTakeThat,
    TowerOfPower,
    AlterFutureNow,
}

impl CardKind {
    pub const ALL: [Self; 36] = [
        Self::Exploding,
        Self::Defuse,
        Self::Nope,
        Self::Attack,
        Self::Skip,
        Self::Shuffle,
        Self::SeeFuture,
        Self::Favour,
        Self::CatTaco,
        Self::CatRainbow,
        Self::CatBeard,
        Self::CatPotato,
        Self::CatCattermelon,
        Self::Imploding,
        Self::Reverse,
        Self::DrawBottom,
        Self::FeralCat,
        Self::AlterFuture,
        Self::TargetedAttack,
        Self::Streaking,
        Self::SuperSkip,
        Self::SeeFuture5,
        Self::AlterFuture5,
        Self::SwapTopBottom,
        Self::GarbageCollection,
        Self::CatomicBomb,
        Self::Mark,
        Self::CurseCatButt,
        Self::PersonalAttack,
        Self::ShareFuture,
        Self::Bury,
        Self::Potluck,
        Self::BarkingKitten,
        Self::IllTakeThat,
        Self::TowerOfPower,
        Self::AlterFutureNow,
    ];

    pub const CATS: [Self; 5] = [
        Self::CatTaco,
        Self::CatRainbow,
        Self::CatBeard,
        Self::CatPotato,
        Self::CatCattermelon,
    ];

    pub const fn index(self) -> u16 {
        self as u16
    }

    pub const fn is_cat(self) -> bool {
        matches!(
            self,
            Self::CatTaco
                | Self::CatRainbow
                | Self::CatBeard
                | Self::CatPotato
                | Self::CatCattermelon
        )
    }

    pub const fn is_combo_cat(self) -> bool {
        self.is_cat() || matches!(self, Self::FeralCat)
    }

    pub const fn is_playable_single(self) -> bool {
        matches!(
            self,
            Self::Attack
                | Self::Skip
                | Self::Shuffle
                | Self::SeeFuture
                | Self::Favour
                | Self::Reverse
                | Self::DrawBottom
                | Self::AlterFuture
                | Self::TargetedAttack
                | Self::SuperSkip
                | Self::SeeFuture5
                | Self::AlterFuture5
                | Self::SwapTopBottom
                | Self::GarbageCollection
                | Self::CatomicBomb
                | Self::Mark
                | Self::CurseCatButt
                | Self::PersonalAttack
                | Self::ShareFuture
                | Self::Bury
                | Self::Potluck
                | Self::BarkingKitten
                | Self::IllTakeThat
                | Self::TowerOfPower
                | Self::AlterFutureNow
        )
    }

    /// Cards included in the base deck before Exploding/Defuse setup.
    pub const fn base_count(self) -> u16 {
        match self {
            Self::SeeFuture | Self::Nope => 5,
            Self::Attack | Self::Skip | Self::Shuffle | Self::Favour => 4,
            Self::CatTaco
            | Self::CatRainbow
            | Self::CatBeard
            | Self::CatPotato
            | Self::CatCattermelon => 4,
            _ => 0,
        }
    }

    /// Safe cards added by enabled expansion packs (matching official physical boxes).
    pub const fn expansion_count(self, settings: &Settings) -> u16 {
        let mut count = 0;
        if settings.imploding {
            // 19 safe cards + 1 Imploding = 20 cards total
            count += match self {
                Self::Reverse | Self::DrawBottom | Self::FeralCat | Self::AlterFuture => 4,
                Self::TargetedAttack => 3,
                _ => 0,
            };
        }
        if settings.streaking {
            // 14 safe cards + 1 extra Exploding = 15 cards total
            count += match self {
                Self::Mark | Self::SwapTopBottom => 3,
                Self::CurseCatButt => 2,
                Self::Streaking
                | Self::SuperSkip
                | Self::SeeFuture5
                | Self::AlterFuture5
                | Self::GarbageCollection
                | Self::CatomicBomb => 1,
                _ => 0,
            };
        }
        if settings.barking {
            // 20 safe cards total
            count += match self {
                Self::PersonalAttack | Self::IllTakeThat => 4,
                Self::BarkingKitten
                | Self::AlterFutureNow
                | Self::ShareFuture
                | Self::Bury
                | Self::Potluck => 2,
                Self::TowerOfPower | Self::SuperSkip => 1,
                _ => 0,
            };
        }
        count
    }
}

impl CardId {
    pub const fn new(kind: CardKind, serial: u16) -> Self {
        Self(kind.index() * 100 + serial)
    }

    pub fn kind(self) -> Option<CardKind> {
        let index = usize::from(self.0 / 100);
        let serial = self.0 % 100;
        CardKind::ALL.get(index).copied().filter(|_| serial < 100)
    }
}

/// Wire-safe card description: the physical id plus its public kind.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsCardView"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CardView {
    pub id: CardId,
    pub kind: CardKind,
}

impl CardView {
    pub fn new(id: CardId) -> Option<Self> {
        Some(Self {
            id,
            kind: id.kind()?,
        })
    }
}

fn default_true() -> bool {
    true
}

/// Expansion packs toggleable in the waiting room.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsSettings"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_true")]
    pub imploding: bool,
    #[serde(default = "default_true")]
    pub streaking: bool,
    #[serde(default = "default_true")]
    pub barking: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            imploding: true,
            streaking: true,
            barking: true,
        }
    }
}

impl Settings {
    pub const fn base_only() -> Self {
        Self {
            imploding: false,
            streaking: false,
            barking: false,
        }
    }
}
