//! Dodge City card list (spec: specs/games/bang/dodge-city.md). Ids follow the base deck.

use super::{Card, CardKind, DECK, Rank, Suit};

/// First `CardId` of the Dodge City pack; ids `0..80` are the base deck.
pub const DODGE_CITY_FIRST_CARD: usize = DECK.len();

pub const DODGE_CITY_DECK: [Card; 40] = {
    use CardKind::*;
    use Rank::*;
    use Suit::*;
    [
        Card::new(Barrel, Clubs, Ace),
        Card::new(Binocular, Diamonds, Ten),
        Card::new(Dynamite, Clubs, Ten),
        Card::new(Mustang, Hearts, Five),
        Card::new(Remington, Diamonds, Six),
        Card::new(RevCarabine, Spades, Five),
        Card::new(Hideout, Diamonds, King),
        Card::new(Bang, Spades, Eight),
        Card::new(Bang, Clubs, Five),
        Card::new(Bang, Clubs, Six),
        Card::new(Bang, Clubs, King),
        Card::new(Beer, Hearts, Six),
        Card::new(Beer, Spades, Six),
        Card::new(CatBalou, Clubs, Eight),
        Card::new(GeneralStore, Spades, Ace),
        Card::new(Indians, Diamonds, Five),
        Card::new(Missed, Diamonds, Eight),
        Card::new(Panic, Hearts, Jack),
        Card::new(Punch, Spades, Ten),
        Card::new(RagTime, Hearts, Nine),
        Card::new(Brawl, Spades, Jack),
        Card::new(Dodge, Diamonds, Seven),
        Card::new(Dodge, Hearts, King),
        Card::new(Springfield, Spades, King),
        Card::new(Tequila, Clubs, Nine),
        Card::new(Whisky, Diamonds, Queen),
        Card::new(Bible, Hearts, Ten),
        Card::new(Canteen, Hearts, Seven),
        Card::new(CanCan, Clubs, Jack),
        Card::new(TenGallonHat, Diamonds, Jack),
        Card::new(Conestoga, Diamonds, Nine),
        Card::new(Derringer, Spades, Seven),
        Card::new(BuffaloRifle, Clubs, Queen),
        Card::new(Howitzer, Spades, Nine),
        Card::new(Pepperbox, Hearts, Ace),
        Card::new(IronPlate, Diamonds, Ace),
        Card::new(IronPlate, Spades, Queen),
        Card::new(PonyExpress, Diamonds, Queen),
        Card::new(Knife, Hearts, Eight),
        Card::new(Sombrero, Clubs, Seven),
    ]
};
