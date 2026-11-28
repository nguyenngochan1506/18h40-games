use crate::{
    model::{CardKind, CardView, PlayerId},
    state::{Decision, PendingId},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visibility {
    Public,
    Player(PlayerId),
}

/// Raw event. This type deliberately has no Serialize implementation because
/// private variants carry physical cards.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    pub visibility: Visibility,
    pub kind: EventKind,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsEventKind"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventKind {
    GameStarted {
        starting_player: PlayerId,
    },
    TurnStarted {
        player: PlayerId,
        turns_left: u8,
    },
    DirectionReversed {
        direction: i8,
    },
    CardPlayed {
        player: PlayerId,
        kind: CardKind,
    },
    ComboPlayed {
        player: PlayerId,
        kind: CardKind,
        count: u8,
    },
    FivePlayed {
        player: PlayerId,
    },
    TargetChosen {
        actor: PlayerId,
        target: PlayerId,
    },
    CardsDrawn {
        player: PlayerId,
        count: u8,
    },
    CardDrawn {
        player: PlayerId,
        card: CardView,
    },
    DeckShuffled {
        count: usize,
    },
    DeckReshuffled {
        count: usize,
    },
    DeckSwapped,
    DeckEmpty,
    FutureSeen {
        player: PlayerId,
        cards: Vec<CardView>,
    },
    FutureAltered {
        player: PlayerId,
        count: usize,
    },
    FutureShared {
        actor: PlayerId,
        target: PlayerId,
        count: usize,
    },
    CardBuried {
        player: PlayerId,
    },
    CardPutInDeck {
        player: PlayerId,
        shuffled: bool,
    },
    CatomicBombTriggered {
        player: PlayerId,
        exploding_count: usize,
    },
    CardMarked {
        actor: PlayerId,
        target: PlayerId,
        card: CardView,
    },
    PlayerCursed {
        actor: PlayerId,
        target: PlayerId,
    },
    CurseLifted {
        player: PlayerId,
    },
    BlindCardWasted {
        player: PlayerId,
        card: CardView,
    },
    BarkingPlaced {
        player: PlayerId,
    },
    BarkingTriggered {
        actor: PlayerId,
        target: PlayerId,
    },
    BarkingDefused {
        player: PlayerId,
    },
    IllTakeThatPlaced {
        actor: PlayerId,
        target: PlayerId,
    },
    IllTakeThatTriggered {
        owner: PlayerId,
        victim: PlayerId,
    },
    TowerClaimed {
        player: PlayerId,
        stash_count: usize,
    },
    TowerBlocked {
        victim: PlayerId,
        actor: PlayerId,
    },
    ExplodingDrawn {
        player: PlayerId,
    },
    ImplodingDrawn {
        player: PlayerId,
        face_up: bool,
    },
    ImplodingPlaced {
        player: PlayerId,
    },
    Defused {
        player: PlayerId,
    },
    PlayerEliminated {
        player: PlayerId,
    },
    FavourAsked {
        actor: PlayerId,
        target: PlayerId,
    },
    FavourSkipped {
        actor: PlayerId,
        target: PlayerId,
    },
    FavourCompleted {
        actor: PlayerId,
        target: PlayerId,
    },
    CardReceived {
        player: PlayerId,
        from: PlayerId,
        card: CardView,
    },
    CardGiven {
        player: PlayerId,
        to: PlayerId,
        card: CardView,
    },
    RandomSteal {
        actor: PlayerId,
        target: PlayerId,
        found: bool,
    },
    NamedSteal {
        actor: PlayerId,
        target: PlayerId,
        kind: CardKind,
        found: bool,
    },
    FiveTaken {
        player: PlayerId,
        card: CardView,
    },
    NopePlayed {
        player: PlayerId,
        action_id: PendingId,
    },
    ActionUndone {
        action_id: PendingId,
        actor: PlayerId,
    },
    DecisionChanged {
        decision: Option<Decision>,
    },
    Winner {
        player: PlayerId,
    },
}

impl Event {
    pub(crate) fn public(kind: EventKind) -> Self {
        Self {
            visibility: Visibility::Public,
            kind,
        }
    }

    pub(crate) fn private(player: PlayerId, kind: EventKind) -> Self {
        Self {
            visibility: Visibility::Player(player),
            kind,
        }
    }
}

pub fn filter_events(events: &[Event], recipient: Option<PlayerId>) -> Vec<Event> {
    events
        .iter()
        .filter(|event| match event.visibility {
            Visibility::Public => true,
            Visibility::Player(player) => recipient == Some(player),
        })
        .cloned()
        .collect()
}
