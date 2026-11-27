use crate::{
    model::{CardId, CardKind, PlayerId},
    state::PendingId,
};
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsAction"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Draw,
    PlayCard {
        card: CardId,
    },
    PlayPair {
        cards: Vec<CardId>,
    },
    PlayTriple {
        cards: Vec<CardId>,
    },
    PlayFive {
        cards: Vec<CardId>,
    },
    Nope {
        pending_id: PendingId,
    },
    Defuse {
        pending_id: PendingId,
        position: usize,
    },
    InsertImploding {
        pending_id: PendingId,
        position: usize,
    },
    BuryCard {
        pending_id: PendingId,
        position: usize,
    },
    AttackTarget {
        pending_id: PendingId,
        target: PlayerId,
    },
    FavourTarget {
        pending_id: PendingId,
        target: PlayerId,
    },
    FavourCard {
        pending_id: PendingId,
        card: CardId,
    },
    RandomTarget {
        pending_id: PendingId,
        target: PlayerId,
    },
    StealTarget {
        pending_id: PendingId,
        target: PlayerId,
    },
    StealKind {
        pending_id: PendingId,
        kind: CardKind,
    },
    TakeDiscard {
        pending_id: PendingId,
        card: Option<CardId>,
    },
    ReorderFuture {
        pending_id: PendingId,
        /// Top-first order (`order[0]` is drawn next).
        order: Vec<CardId>,
    },
    PutCardInDeck {
        pending_id: PendingId,
        card: CardId,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionError {
    InvalidPlayerCount,
    InvalidSettings,
    UnknownPlayer,
    Eliminated,
    GameOver,
    NotYourDecision,
    WrongAction,
    StalePending,
    CardNotInHand,
    InvalidCard,
    InvalidTarget,
    OutOfRange,
    NoNopeWindow,
    InvalidCombo,
}

pub(crate) fn held_kind(
    state: &crate::state::State,
    player: PlayerId,
    card: CardId,
) -> Result<CardKind, ActionError> {
    if !state.players[player.0].hand.contains(&card) {
        return Err(ActionError::CardNotInHand);
    }
    card.kind().ok_or(ActionError::InvalidCard)
}
