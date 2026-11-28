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
    #[serde(default)]
    pub jail_turns_served: u8,
    /// Green cards placed since the owner's last turn started; they cannot be used yet.
    #[serde(default)]
    pub fresh_green: Vec<CardId>,
    /// Green cards placed during the turn now in progress; they can answer a Missed! only from
    /// the next player's turn on (the turn that placed them has to end first).
    #[serde(default)]
    pub placed_green: Vec<CardId>,
    /// Vera Custer: the character whose ability she holds until her next turn.
    #[serde(default)]
    pub copied: Option<Character>,
}

/// Once-per-turn skill usage, reset when a turn starts.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillUses {
    pub doc_holyday: bool,
    pub jose_delgado: u8,
    /// Vera Custer already picked her ability this turn.
    pub vera_copy: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DynamiteRound {
    pub card: CardId,
    pub remaining: Vec<PlayerId>,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnStep {
    Dynamite,
    Jail,
    Draw,
    Play,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnState {
    pub player: PlayerId,
    pub step: TurnStep,
    pub bangs_played: u32,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingId(#[cfg_attr(feature = "ts", ts(type = "number"))] pub u64);

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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
    pub damage: u8,
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
    PickHandSlot {
        actor: PlayerId,
        target: PlayerId,
        kind: CardKind,
        slots: Vec<CardId>,
    },
    Check {
        player: PlayerId,
        reason: CardKind,
        continuation: DrawContinuation,
    },
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
        checks_left: u8,
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
        /// BANG! cards each side discarded voluntarily (Molly Stark draws for them afterwards).
        #[serde(default)]
        initiator_bangs: u8,
        #[serde(default)]
        opponent_bangs: u8,
    },
    /// Brawl: every other player discards the card the source picked for them.
    ResolveBrawl {
        source: PlayerId,
        picks: Vec<crate::actions::BrawlPick>,
        cursor: usize,
    },
    /// Vera Custer picks whose ability she holds until her next turn.
    ChooseCopy {
        player: PlayerId,
    },
    /// Two players share Vulture Sam's ability: they take turns claiming the victim's cards,
    /// each time either a random hand card or a table card. `pool` holds the `hand_len` hidden
    /// hand cards first, then the face-up table cards.
    VultureSplit {
        victim: PlayerId,
        holders: Vec<PlayerId>,
        cursor: usize,
        pool: Vec<CardId>,
        hand_len: usize,
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
            | PendingKind::VultureSplit { pool, .. }
            | PendingKind::KeepCards { pool, .. }
            | PendingKind::ChooseDrawResult { pool, .. } => pool,
            _ => &[],
        }
    }

    pub fn player(&self) -> Option<PlayerId> {
        match &self.kind {
            PendingKind::PickHandSlot { actor, .. } => Some(*actor),
            PendingKind::AttackResponse { target, .. } => Some(*target),
            PendingKind::Dying { player, .. }
            | PendingKind::Check { player, .. }
            | PendingKind::DrawChoice { player }
            | PendingKind::KeepCards { player, .. }
            | PendingKind::ChooseDrawResult { player, .. } => Some(*player),
            PendingKind::Duel { next, .. } => Some(*next),
            PendingKind::GeneralStore { order, cursor, .. } => order.get(*cursor).copied(),
            PendingKind::ChooseCopy { player } => Some(*player),
            PendingKind::VultureSplit {
                holders, cursor, ..
            } => holders.get(*cursor % holders.len().max(1)).copied(),
            PendingKind::ResolveTargets { .. } | PendingKind::ResolveBrawl { .. } => None,
        }
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Winner {
    SheriffAndDeputies,
    Outlaws,
    Renegade { player: PlayerId },
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DecisionKind {
    PickHandSlot {
        target: PlayerId,
        kind: CardKind,
        count: u8,
    },
    Turn,
    AttackResponse {
        kind: AttackKind,
        remaining: u8,
        checks_left: u8,
    },
    Check {
        reason: CardKind,
    },
    Duel,
    GeneralStore,
    DrawChoice,
    ChooseCopy,
    VultureSplit {
        victim: PlayerId,
        hand_count: u8,
        table_count: u8,
    },
    KeepCards {
        keep: usize,
    },
    ChooseDrawResult {
        reason: CardKind,
    },
    Dying {
        needed: u16,
    },
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub player: PlayerId,
    pub pending_id: Option<PendingId>,
    pub kind: DecisionKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameState {
    pub config: crate::GameConfig,
    #[serde(default)]
    pub dynamite_rounds: Vec<DynamiteRound>,
    pub players: Vec<Player>,
    pub draw_pile: Vec<CardId>,
    pub discard_pile: Vec<CardId>,
    pub turn: TurnState,
    pub pending: Vec<Pending>,
    pub winner: Option<Winner>,
    #[serde(default)]
    pub skill_uses: SkillUses,
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
                    PendingKind::PickHandSlot {
                        target,
                        kind,
                        slots,
                        ..
                    } => DecisionKind::PickHandSlot {
                        target: *target,
                        kind: *kind,
                        count: slots.len() as u8,
                    },
                    PendingKind::AttackResponse {
                        kind,
                        remaining,
                        checks_left,
                        ..
                    } => DecisionKind::AttackResponse {
                        kind: *kind,
                        remaining: *remaining,
                        checks_left: *checks_left,
                    },
                    PendingKind::Check { reason, .. } => DecisionKind::Check { reason: *reason },
                    PendingKind::Dying { needed, .. } => DecisionKind::Dying { needed: *needed },
                    PendingKind::Duel { .. } => DecisionKind::Duel,
                    PendingKind::GeneralStore { .. } => DecisionKind::GeneralStore,
                    PendingKind::DrawChoice { .. } => DecisionKind::DrawChoice,
                    PendingKind::KeepCards { keep, .. } => DecisionKind::KeepCards { keep: *keep },
                    PendingKind::ChooseDrawResult { reason, .. } => {
                        DecisionKind::ChooseDrawResult { reason: *reason }
                    }
                    PendingKind::ChooseCopy { .. } => DecisionKind::ChooseCopy,
                    PendingKind::VultureSplit {
                        victim,
                        pool,
                        hand_len,
                        ..
                    } => DecisionKind::VultureSplit {
                        victim: *victim,
                        hand_count: *hand_len as u8,
                        table_count: (pool.len() - *hand_len) as u8,
                    },
                    PendingKind::ResolveTargets { .. } | PendingKind::ResolveBrawl { .. } => {
                        return None;
                    }
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
    /// Printed character or the ability Vera Custer currently holds.
    pub fn has(&self, character: Character) -> bool {
        self.character == character || self.copied == Some(character)
    }

    pub fn unlimited_bangs(&self) -> bool {
        self.has(Character::WillyTheKid) || self.has_in_play(CardKind::Volcanic)
    }

    /// Whether a hand card of kind `actual` may answer a request for `required`.
    pub fn accepts_response(&self, actual: CardKind, required: CardKind) -> bool {
        actual == required
            || (required == CardKind::Missed && actual == CardKind::Dodge)
            || (required == CardKind::Missed && self.has(Character::ElenaFuente))
            || (self.has(Character::CalamityJanet)
                && matches!(
                    (actual, required),
                    (CardKind::Bang, CardKind::Missed)
                        | (CardKind::Missed | CardKind::Dodge, CardKind::Bang)
                ))
    }

    pub fn play_kind(&self, physical: CardKind) -> CardKind {
        if matches!(physical, CardKind::Missed | CardKind::Dodge)
            && self.has(Character::CalamityJanet)
        {
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
            .filter_map(|card| card.card().and_then(|card| card.kind.weapon_range()))
            .max()
            .unwrap_or(1)
    }

    /// Hand size to keep at the end of the turn.
    pub fn hand_limit(&self) -> usize {
        if self.has(Character::SeanMallory) {
            10
        } else {
            self.health.max(0) as usize
        }
    }

    /// Green Missed! cards that may answer a shot now (placed in a turn that has ended).
    pub fn green_answers(&self) -> impl Iterator<Item = CardId> + '_ {
        self.in_play.iter().copied().filter(|card| {
            card.card().is_some_and(|c| c.kind.green_missed()) && !self.placed_green.contains(card)
        })
    }

    /// Green cards in front of the player that were placed in an earlier turn.
    pub fn ready_green(&self) -> impl Iterator<Item = CardId> + '_ {
        self.in_play.iter().copied().filter(|card| {
            card.card().is_some_and(|c| c.kind.is_green()) && !self.fresh_green.contains(card)
        })
    }
}
