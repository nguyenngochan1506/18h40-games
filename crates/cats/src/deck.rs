use crate::model::{CardId, CardKind, Settings};
use rand::{Rng, seq::SliceRandom};

/// Non-exploding, non-defuse cards added for 6-8 players when no expansion
/// provides enough extra safe cards.
const EXTRA_ORDER: [CardKind; 11] = [
    CardKind::Nope,
    CardKind::Attack,
    CardKind::Skip,
    CardKind::SeeFuture,
    CardKind::Favour,
    CardKind::Shuffle,
    CardKind::CatTaco,
    CardKind::CatRainbow,
    CardKind::CatBeard,
    CardKind::CatPotato,
    CardKind::CatCattermelon,
];

pub const TOWER_STASH_SIZE: usize = 6;

pub fn total_defuse(player_count: usize) -> usize {
    player_count.max(7)
}

pub fn exploding_count(player_count: usize, settings: &Settings) -> usize {
    if settings.streaking {
        player_count
    } else {
        player_count.saturating_sub(1)
    }
}

pub fn card_counts(player_count: usize, settings: &Settings) -> Vec<(CardKind, u16)> {
    let mut counts: Vec<(CardKind, u16)> = CardKind::ALL
        .into_iter()
        .filter(|kind| {
            !matches!(
                kind,
                CardKind::Exploding | CardKind::Defuse | CardKind::Imploding
            )
        })
        .map(|kind| (kind, kind.base_count() + kind.expansion_count(settings)))
        .filter(|(_, count)| *count > 0)
        .collect();

    let stash = if settings.barking {
        TOWER_STASH_SIZE
    } else {
        0
    };
    let current_total: usize = counts.iter().map(|(_, count)| usize::from(*count)).sum();
    let min_needed = if player_count > 5 {
        player_count * 8 + stash
    } else {
        46 + stash
    };
    let extra = min_needed.saturating_sub(current_total);
    for index in 0..extra {
        let kind = EXTRA_ORDER[index % EXTRA_ORDER.len()];
        let entry = counts
            .iter_mut()
            .find(|(candidate, _)| *candidate == kind)
            .expect("extra kinds are part of the base deck");
        entry.1 += 1;
    }
    counts
}

/// Builds the physical cards for a game, deals the initial hands, and reserves
/// the Tower of Power stash when Barking Kittens is enabled.
pub fn deal<R: Rng + ?Sized>(
    player_count: usize,
    settings: &Settings,
    rng: &mut R,
) -> (Vec<Vec<CardId>>, Vec<CardId>, Vec<CardId>) {
    let counts = card_counts(player_count, settings);
    let total_nondef: usize = counts.iter().map(|(_, count)| usize::from(*count)).sum();
    let mut nondef = Vec::with_capacity(total_nondef);
    for (kind, count) in counts {
        for serial in 0..count {
            nondef.push(CardId::new(kind, serial));
        }
    }
    nondef.shuffle(rng);

    // Reserve 6 face-down stash cards for Tower of Power (never reserving the
    // TowerOfPower card itself so players can always draw and claim it!).
    let mut tower_stash = Vec::new();
    if settings.barking {
        let mut index = 0;
        while tower_stash.len() < TOWER_STASH_SIZE && index < nondef.len() {
            if nondef[index].kind() != Some(CardKind::TowerOfPower) {
                tower_stash.push(nondef.remove(index));
            } else {
                index += 1;
            }
        }
    }

    let mut defuse: Vec<CardId> = (0..total_defuse(player_count))
        .map(|serial| CardId::new(CardKind::Defuse, serial as u16))
        .collect();
    defuse.shuffle(rng);

    let mut hands = Vec::with_capacity(player_count);
    for _ in 0..player_count {
        let mut hand: Vec<CardId> = nondef.drain(..7).collect();
        hand.push(defuse.pop().expect("one Defuse per player is provisioned"));
        hand.shuffle(rng);
        hands.push(hand);
    }

    let mut deck = nondef;
    deck.extend(defuse);
    for serial in 0..exploding_count(player_count, settings) {
        deck.push(CardId::new(CardKind::Exploding, serial as u16));
    }
    if settings.imploding {
        deck.push(CardId::new(CardKind::Imploding, 0));
    }
    deck.shuffle(rng);
    (hands, deck, tower_stash)
}

/// Inserts `card` at `position` counted from the top, where 0 is the next draw.
pub fn insert_from_top(deck: &mut Vec<CardId>, card: CardId, position: usize) {
    let index = deck.len().saturating_sub(position);
    deck.insert(index, card);
}

pub fn take_random<R: Rng + ?Sized>(hand: &mut Vec<CardId>, rng: &mut R) -> Option<CardId> {
    if hand.is_empty() {
        return None;
    }
    let index = rng.random_range(0..hand.len());
    Some(hand.remove(index))
}
