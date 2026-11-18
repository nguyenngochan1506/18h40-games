use crate::model::{CardId, CardKind, Character, PlayerId, Role};
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
    pub bangs_played: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingId(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttackKind {
    Bang,
    Gatling,
    Indians,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Defense {
    pub source: PlayerId,
    pub target: PlayerId,
    pub kind: AttackKind,
    pub remaining: u8,
    pub checks_left: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DrawContinuation {
    Defense { defense: Defense },
    Dynamite { player: PlayerId, card: CardId },
    Jail { player: PlayerId, card: CardId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pending {
    pub id: PendingId,
    pub kind: PendingKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PendingKind {
    DrawChoice {
        player: PlayerId,
    },
    KeepCards {
        player: PlayerId,
        pool: Vec<CardId>,
        keep: usize,
    },
    ChooseDrawResult {
        player: PlayerId,
        pool: Vec<CardId>,
        reason: CardKind,
        continuation: DrawContinuation,
    },
    AttackResponse {
        target: PlayerId,
        source: PlayerId,
        kind: AttackKind,
        remaining: u8,
        damage: u8,
    },
    ResolveTargets {
        source: PlayerId,
        kind: AttackKind,
        targets: Vec<PlayerId>,
        cursor: usize,
    },
    Duel {
        initiator: PlayerId,
        opponent: PlayerId,
        next: PlayerId,
    },
    GeneralStore {
        pool: Vec<CardId>,
        order: Vec<PlayerId>,
        cursor: usize,
    },
    Dying {
        player: PlayerId,
        source: Option<PlayerId>,
        needed: u16,
        #[serde(default)]
        duel_initiator: Option<PlayerId>,
    },
}

impl Pending {
    pub fn cards(&self) -> &[CardId] {
        match &self.kind {
            PendingKind::GeneralStore { pool, .. }
            | PendingKind::KeepCards { pool, .. }
            | PendingKind::ChooseDrawResult { pool, .. } => pool,
            _ => &[],
        }
    }

    pub fn player(&self) -> Option<PlayerId> {
        match &self.kind {
            PendingKind::AttackResponse { target, .. } => Some(*target),
            PendingKind::Dying { player, .. }
            | PendingKind::DrawChoice { player }
            | PendingKind::KeepCards { player, .. }
            | PendingKind::ChooseDrawResult { player, .. } => Some(*player),
            PendingKind::Duel { next, .. } => Some(*next),
            PendingKind::GeneralStore { order, cursor, .. } => order.get(*cursor).copied(),
            PendingKind::ResolveTargets { .. } => None,
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
    AttackResponse { kind: AttackKind, remaining: u8 },
    Duel,
    GeneralStore,
    DrawChoice,
    KeepCards { keep: usize },
    ChooseDrawResult { reason: CardKind },
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
    // Pedro can uncover an older private discard after taking the public top.
    pub(crate) hidden_discards: Vec<CardId>,
}

impl GameState {
    pub fn decision(&self) -> Option<Decision> {
        if self.winner.is_some() {
            return None;
        }
        if let Some(frame) = self.pending.last() {
            Some(Decision {
                player: frame.player()?,
                pending_id: Some(frame.id),
                kind: match &frame.kind {
                    PendingKind::AttackResponse {
                        kind, remaining, ..
                    } => DecisionKind::AttackResponse {
                        kind: *kind,
                        remaining: *remaining,
                    },
                    PendingKind::Dying { needed, .. } => DecisionKind::Dying { needed: *needed },
                    PendingKind::Duel { .. } => DecisionKind::Duel,
                    PendingKind::GeneralStore { .. } => DecisionKind::GeneralStore,
                    PendingKind::DrawChoice { .. } => DecisionKind::DrawChoice,
                    PendingKind::KeepCards { keep, .. } => DecisionKind::KeepCards { keep: *keep },
                    PendingKind::ChooseDrawResult { reason, .. } => {
                        DecisionKind::ChooseDrawResult { reason: *reason }
                    }
                    PendingKind::ResolveTargets { .. } => return None,
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

    pub(crate) fn discard(&mut self, card: CardId) {
        self.hidden_discards.retain(|id| *id != card);
        self.discard_pile.push(card);
    }

    pub(crate) fn discard_hidden(&mut self, card: CardId) {
        self.discard(card);
        self.hidden_discards.push(card);
    }

    pub(crate) fn renew_pending_id(&mut self) {
        let id = PendingId(self.next_pending_id);
        self.next_pending_id += 1;
        self.pending.last_mut().unwrap().id = id;
    }

    pub(crate) fn push_pending(&mut self, kind: PendingKind) {
        let id = PendingId(self.next_pending_id);
        self.next_pending_id += 1;
        self.pending.push(Pending { id, kind });
    }
}

impl Player {
    pub fn unlimited_bangs(&self) -> bool {
        self.character == Character::WillyTheKid || self.has_in_play(CardKind::Volcanic)
    }

    pub fn accepts_response(&self, actual: CardKind, required: CardKind) -> bool {
        actual == required
            || (self.character == Character::CalamityJanet
                && matches!(
                    (actual, required),
                    (CardKind::Bang, CardKind::Missed) | (CardKind::Missed, CardKind::Bang)
                ))
    }

    pub fn play_kind(&self, physical: CardKind) -> CardKind {
        if physical == CardKind::Missed && self.character == Character::CalamityJanet {
            CardKind::Bang
        } else {
            physical
        }
    }

    pub fn has_in_play(&self, kind: CardKind) -> bool {
        self.in_play
            .iter()
            .any(|card| card.card().is_some_and(|card| card.kind == kind))
    }

    pub fn weapon_range(&self) -> u16 {
        self.in_play
            .iter()
            .find_map(|card| card.card().and_then(|card| card.kind.weapon_range()))
            .unwrap_or(1)
    }
}
