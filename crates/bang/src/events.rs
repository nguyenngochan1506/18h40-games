use crate::{
    model::{CardId, Character, PlayerId, Role},
    state::{Decision, Winner},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Visibility {
    Public,
    Player(PlayerId),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub visibility: Visibility,
    pub kind: EventKind,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventKind {
    HandSlotsOpened {
        actor: PlayerId,
        target: PlayerId,
        count: u8,
    },
    HandSlotClaimed {
        actor: PlayerId,
        target: PlayerId,
        slot: u8,
    },
    HandPickCancelled {
        actor: PlayerId,
        target: PlayerId,
    },
    SkillActivated {
        player: PlayerId,
        character: Character,
    },
    ChoiceOffered {
        player: PlayerId,
        cards: Vec<CardId>,
    },
    CardShown {
        player: PlayerId,
        card: CardId,
    },
    CardsStolen {
        source: PlayerId,
        target: PlayerId,
        count: usize,
    },
    StolenCards {
        source: PlayerId,
        target: PlayerId,
        cards: Vec<CardId>,
    },
    CardsInherited {
        player: PlayerId,
        victim: PlayerId,
        count: usize,
    },
    PrivatePoolDiscarded {
        count: usize,
    },
    GameStarted {
        sheriff: PlayerId,
    },
    TurnStarted {
        player: PlayerId,
    },
    CardsDrawn {
        player: PlayerId,
        count: usize,
    },
    CardsReceived {
        player: PlayerId,
        cards: Vec<CardId>,
    },
    DeckReshuffled {
        count: usize,
    },
    CardPlayed {
        player: PlayerId,
        card: CardId,
        target: Option<PlayerId>,
    },
    CardDiscarded {
        player: PlayerId,
        card: CardId,
    },
    HealthChanged {
        player: PlayerId,
        source: Option<PlayerId>,
        delta: i16,
        health: i16,
    },
    PlayerEliminated {
        player: PlayerId,
        role: Role,
    },
    DecisionChanged {
        decision: Option<Decision>,
    },
    CardEquipped {
        player: PlayerId,
        card: CardId,
    },
    CardPassed {
        source: PlayerId,
        target: PlayerId,
        card: CardId,
    },
    DynamiteRoundEnded {
        player: PlayerId,
    },
    JailHeld {
        player: PlayerId,
        turns_left: u8,
    },
    JailExpired {
        player: PlayerId,
    },
    HandAffected {
        source: PlayerId,
        target: PlayerId,
        kind: crate::model::CardKind,
        count: usize,
    },
    HandCardAffected {
        source: PlayerId,
        target: PlayerId,
        kind: crate::model::CardKind,
        card: CardId,
    },
    InPlayCardAffected {
        source: PlayerId,
        target: PlayerId,
        kind: crate::model::CardKind,
        card: CardId,
    },
    DrawRevealed {
        player: PlayerId,
        reason: crate::model::CardKind,
        card: CardId,
    },
    StoreOpened {
        count: u8,
    },
    StoreCardClaimed {
        player: PlayerId,
        slot: u8,
    },
    StoreCardReceived {
        card: CardId,
    },
    PoolDiscarded {
        cards: Vec<CardId>,
    },
    BountyAwarded {
        player: PlayerId,
        victim: PlayerId,
    },
    SheriffPenalized {
        player: PlayerId,
        victim: PlayerId,
    },
    GameEnded {
        winner: Winner,
        roles: Vec<Role>,
    },
}

impl Event {
    pub(crate) fn public(kind: EventKind) -> Self {
        Self {
            visibility: Visibility::Public,
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
