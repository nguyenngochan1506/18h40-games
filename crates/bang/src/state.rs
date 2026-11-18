use crate::model::{CardId, Character, PlayerId, Role};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Player {
    pub role: Role,
    pub character: Character,
    pub health: i16,
    pub max_health: i16,
    pub alive: bool,
    pub hand: Vec<CardId>,
    pub in_play: Vec<CardId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnStep {
    Dynamite,
    Jail,
    Draw,
    Play,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnState {
    pub player: PlayerId,
    pub step: TurnStep,
    pub bangs_played: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingId(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttackKind {
    Bang,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pending {
    pub id: PendingId,
    pub kind: PendingKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PendingKind {
    AttackResponse {
        target: PlayerId,
        source: PlayerId,
        kind: AttackKind,
        remaining: u8,
        damage: u8,
    },
    Dying {
        player: PlayerId,
        source: Option<PlayerId>,
        needed: u16,
    },
}

impl Pending {
    pub fn player(&self) -> PlayerId {
        match self.kind {
            PendingKind::AttackResponse { target, .. } => target,
            PendingKind::Dying { player, .. } => player,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Winner {
    SheriffAndDeputies,
    Outlaws,
    Renegade { player: PlayerId },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DecisionKind {
    Turn,
    AttackResponse { remaining: u8 },
    Dying { needed: u16 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub player: PlayerId,
    pub pending_id: Option<PendingId>,
    pub kind: DecisionKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameState {
    pub players: Vec<Player>,
    pub draw_pile: Vec<CardId>,
    pub discard_pile: Vec<CardId>,
    pub turn: TurnState,
    pub pending: Vec<Pending>,
    pub winner: Option<Winner>,
    pub(crate) next_pending_id: u64,
}

impl GameState {
    pub fn decision(&self) -> Option<Decision> {
        if self.winner.is_some() {
            return None;
        }
        if let Some(frame) = self.pending.last() {
            Some(Decision {
                player: frame.player(),
                pending_id: Some(frame.id),
                kind: match frame.kind {
                    PendingKind::AttackResponse { remaining, .. } => {
                        DecisionKind::AttackResponse { remaining }
                    }
                    PendingKind::Dying { needed, .. } => DecisionKind::Dying { needed },
                },
            })
        } else if self.turn.step == TurnStep::Play {
            Some(Decision {
                player: self.turn.player,
                pending_id: None,
                kind: DecisionKind::Turn,
            })
        } else {
            None
        }
    }

    pub(crate) fn push_pending(&mut self, kind: PendingKind) {
        let id = PendingId(self.next_pending_id);
        self.next_pending_id += 1;
        self.pending.push(Pending { id, kind });
    }
}
