use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CardId(pub u8);

impl CardId {
    pub fn card(self) -> Option<Card> {
        DECK.get(usize::from(self.0)).copied()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardKind {
    Bang,
    Missed,
    Beer,
    Panic,
    CatBalou,
    Duel,
    Indians,
    GeneralStore,
    Gatling,
    Saloon,
    Stagecoach,
    WellsFargo,
    Barrel,
    Dynamite,
    Jail,
    Mustang,
    Scope,
    Volcanic,
    Schofield,
    Remington,
    RevCarabine,
    Winchester,
}

impl CardKind {
    pub const ALL: [Self; 22] = [
        Self::Bang,
        Self::Missed,
        Self::Beer,
        Self::Panic,
        Self::CatBalou,
        Self::Duel,
        Self::Indians,
        Self::GeneralStore,
        Self::Gatling,
        Self::Saloon,
        Self::Stagecoach,
        Self::WellsFargo,
        Self::Barrel,
        Self::Dynamite,
        Self::Jail,
        Self::Mustang,
        Self::Scope,
        Self::Volcanic,
        Self::Schofield,
        Self::Remington,
        Self::RevCarabine,
        Self::Winchester,
    ];
}

impl CardKind {
    pub const fn weapon_range(self) -> Option<u16> {
        match self {
            Self::Volcanic => Some(1),
            Self::Schofield => Some(2),
            Self::Remington => Some(3),
            Self::RevCarabine => Some(4),
            Self::Winchester => Some(5),
            _ => None,
        }
    }

    pub const fn is_equipment(self) -> bool {
        self.weapon_range().is_some()
            || matches!(
                self,
                Self::Barrel | Self::Dynamite | Self::Jail | Self::Mustang | Self::Scope
            )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Suit {
    Spades,
    Hearts,
    Diamonds,
    Clubs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[repr(u8)]
pub enum Rank {
    Two = 2,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
    Ace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Card {
    pub kind: CardKind,
    pub suit: Suit,
    pub rank: Rank,
}

impl Card {
    const fn new(kind: CardKind, suit: Suit, rank: Rank) -> Self {
        Self { kind, suit, rank }
    }
}

pub const DECK: [Card; 80] = {
    use CardKind::*;
    use Rank::*;
    use Suit::*;
    [
        Card::new(Bang, Spades, Ace),
        Card::new(Bang, Diamonds, Two),
        Card::new(Bang, Diamonds, Three),
        Card::new(Bang, Diamonds, Four),
        Card::new(Bang, Diamonds, Five),
        Card::new(Bang, Diamonds, Six),
        Card::new(Bang, Diamonds, Seven),
        Card::new(Bang, Diamonds, Eight),
        Card::new(Bang, Diamonds, Nine),
        Card::new(Bang, Diamonds, Ten),
        Card::new(Bang, Diamonds, Jack),
        Card::new(Bang, Diamonds, Queen),
        Card::new(Bang, Diamonds, King),
        Card::new(Bang, Diamonds, Ace),
        Card::new(Bang, Clubs, Two),
        Card::new(Bang, Clubs, Three),
        Card::new(Bang, Clubs, Four),
        Card::new(Bang, Clubs, Five),
        Card::new(Bang, Clubs, Six),
        Card::new(Bang, Clubs, Seven),
        Card::new(Bang, Clubs, Eight),
        Card::new(Bang, Clubs, Nine),
        Card::new(Bang, Hearts, Queen),
        Card::new(Bang, Hearts, King),
        Card::new(Bang, Hearts, Ace),
        Card::new(Missed, Spades, Two),
        Card::new(Missed, Spades, Three),
        Card::new(Missed, Spades, Four),
        Card::new(Missed, Spades, Five),
        Card::new(Missed, Spades, Six),
        Card::new(Missed, Spades, Seven),
        Card::new(Missed, Spades, Eight),
        Card::new(Missed, Clubs, Ten),
        Card::new(Missed, Clubs, Jack),
        Card::new(Missed, Clubs, Queen),
        Card::new(Missed, Clubs, King),
        Card::new(Missed, Clubs, Ace),
        Card::new(Beer, Hearts, Six),
        Card::new(Beer, Hearts, Seven),
        Card::new(Beer, Hearts, Eight),
        Card::new(Beer, Hearts, Nine),
        Card::new(Beer, Hearts, Ten),
        Card::new(Beer, Hearts, Jack),
        Card::new(Panic, Hearts, Jack),
        Card::new(Panic, Hearts, Queen),
        Card::new(Panic, Hearts, Ace),
        Card::new(Panic, Diamonds, Eight),
        Card::new(CatBalou, Hearts, King),
        Card::new(CatBalou, Diamonds, Nine),
        Card::new(CatBalou, Diamonds, Ten),
        Card::new(CatBalou, Diamonds, Jack),
        Card::new(Duel, Diamonds, Queen),
        Card::new(Duel, Spades, Jack),
        Card::new(Duel, Clubs, Eight),
        Card::new(Indians, Diamonds, King),
        Card::new(Indians, Diamonds, Ace),
        Card::new(GeneralStore, Clubs, Nine),
        Card::new(GeneralStore, Spades, Queen),
        Card::new(Gatling, Hearts, Ten),
        Card::new(Saloon, Hearts, Five),
        Card::new(Stagecoach, Spades, Nine),
        Card::new(Stagecoach, Spades, Nine),
        Card::new(WellsFargo, Hearts, Three),
        Card::new(Barrel, Spades, Queen),
        Card::new(Barrel, Spades, King),
        Card::new(Dynamite, Hearts, Two),
        Card::new(Jail, Spades, Jack),
        Card::new(Jail, Hearts, Four),
        Card::new(Jail, Spades, Ten),
        Card::new(Mustang, Hearts, Eight),
        Card::new(Mustang, Hearts, Nine),
        Card::new(Scope, Spades, Ace),
        Card::new(Volcanic, Spades, Ten),
        Card::new(Volcanic, Clubs, Ten),
        Card::new(Schofield, Clubs, Jack),
        Card::new(Schofield, Clubs, Queen),
        Card::new(Schofield, Spades, King),
        Card::new(Remington, Clubs, King),
        Card::new(RevCarabine, Clubs, Ace),
        Card::new(Winchester, Spades, Eight),
    ]
};
