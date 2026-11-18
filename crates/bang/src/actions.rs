use crate::model::{CardId, PlayerId};
use crate::state::PendingId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Play {
        card: CardId,
        target: Option<PlayerId>,
    },
    Respond {
        pending_id: PendingId,
        card: Option<CardId>,
    },
    EndTurn {
        discard: Vec<CardId>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionError {
    InvalidPlayerCount,
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
    BangLimit,
    NotImplemented,
    InvalidDiscard,
}
