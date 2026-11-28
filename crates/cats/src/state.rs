use crate::model::{CardId, CardKind, PlayerId, Settings};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IllTakeThatTrap {
    pub owner: PlayerId,
    pub card: CardId,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Player {
    pub hand: Vec<CardId>,
    pub marked_cards: Vec<CardId>,
    pub cursed: bool,
    pub barking_front: Option<CardId>,
    pub ill_take_that: Option<IllTakeThatTrap>,
    pub eliminated: bool,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsTurnState"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnState {
    pub player: PlayerId,
    pub turns_left: u8,
    /// `1` = clockwise, `-1` = counter-clockwise.
    pub direction: i8,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsPendingId"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingId(#[cfg_attr(feature = "ts", ts(type = "number"))] pub u64);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PendingKind {
    Defuse {
        player: PlayerId,
        exploding: CardId,
        end_turn: bool,
    },
    InsertImploding {
        player: PlayerId,
        card: CardId,
        end_turn: bool,
    },
    BuryCard {
        player: PlayerId,
        card: CardId,
    },
    AttackTarget {
        actor: PlayerId,
    },
    FavourTarget {
        actor: PlayerId,
    },
    FavourCard {
        actor: PlayerId,
        target: PlayerId,
    },
    RandomTarget {
        actor: PlayerId,
    },
    StealTarget {
        actor: PlayerId,
    },
    StealKind {
        actor: PlayerId,
        target: PlayerId,
    },
    TakeDiscard {
        actor: PlayerId,
    },
    AlterFuture {
        actor: PlayerId,
        count: usize,
        share_with_next: bool,
    },
    GiveToDeck {
        queue: Vec<PlayerId>,
        shuffle_after: bool,
    },
    MarkTarget {
        actor: PlayerId,
    },
    CurseTarget {
        actor: PlayerId,
    },
    IllTakeThatTarget {
        actor: PlayerId,
        card: CardId,
    },
    BarkingTarget {
        actor: PlayerId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pending {
    pub id: PendingId,
    pub kind: PendingKind,
}

impl Pending {
    pub fn player(&self) -> Option<PlayerId> {
        match &self.kind {
            PendingKind::Defuse { player, .. }
            | PendingKind::InsertImploding { player, .. }
            | PendingKind::BuryCard { player, .. } => Some(*player),
            PendingKind::AttackTarget { actor }
            | PendingKind::FavourTarget { actor }
            | PendingKind::RandomTarget { actor }
            | PendingKind::StealTarget { actor }
            | PendingKind::TakeDiscard { actor }
            | PendingKind::AlterFuture { actor, .. }
            | PendingKind::MarkTarget { actor }
            | PendingKind::CurseTarget { actor }
            | PendingKind::IllTakeThatTarget { actor, .. }
            | PendingKind::BarkingTarget { actor } => Some(*actor),
            PendingKind::FavourCard { target, .. } => Some(*target),
            PendingKind::StealKind { actor, .. } => Some(*actor),
            PendingKind::GiveToDeck { queue, .. } => queue.first().copied(),
        }
    }

    pub fn cards(&self) -> Vec<CardId> {
        match self.kind {
            PendingKind::Defuse { exploding, .. } => vec![exploding],
            PendingKind::InsertImploding { card, .. } | PendingKind::BuryCard { card, .. } => {
                vec![card]
            }
            _ => Vec::new(),
        }
    }

    pub fn id(&self) -> PendingId {
        self.id
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsDecisionKind"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DecisionKind {
    Turn,
    Defuse { max_position: usize },
    InsertImploding { max_position: usize },
    BuryCard { max_position: usize },
    AttackTarget,
    FavourTarget,
    FavourCard { actor: PlayerId },
    RandomTarget,
    StealTarget,
    StealKind { target: PlayerId },
    TakeDiscard,
    AlterFuture { count: usize, share_with_next: bool },
    GiveToDeck { shuffle_after: bool },
    MarkTarget,
    CurseTarget,
    IllTakeThatTarget,
    BarkingTarget,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsDecision"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub player: PlayerId,
    pub pending_id: Option<PendingId>,
    pub kind: DecisionKind,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsPlayedAction"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlayedAction {
    Card { kind: CardKind },
    Combo { kind: CardKind, count: u8 },
    Five,
    Nope,
}

/// The last action that can still be Noped. No hidden card is exposed.
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsPublicAction"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicAction {
    pub id: PendingId,
    pub actor: PlayerId,
    pub played: PlayedAction,
    pub nopeable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct History {
    pub players: Vec<Player>,
    pub deck: Vec<CardId>,
    pub discard: Vec<CardId>,
    pub removed: Vec<CardId>,
    pub tower_stash: Vec<CardId>,
    pub tower_owner: Option<PlayerId>,
    pub face_up: BTreeSet<CardId>,
    pub imploding_face_up: bool,
    pub turn: TurnState,
    pub pending: Vec<Pending>,
    pub winner: Option<PlayerId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LastAction {
    pub id: PendingId,
    pub actor: PlayerId,
    pub played: PlayedAction,
    pub nopeable: bool,
    /// Game state immediately before the action effect (with played cards already in discard).
    pub history: History,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct State {
    pub settings: Settings,
    pub players: Vec<Player>,
    /// The last element is the top of the deck.
    pub deck: Vec<CardId>,
    pub discard: Vec<CardId>,
    /// Exploding/Imploding/Barking lethal cards and Streaking Kittens from
    /// eliminated players. Kept for CardId accounting and never offered to
    /// five-cat combos or reshuffled back into the draw pile.
    pub removed: Vec<CardId>,
    /// Face-down Tower of Power stash cards (6 cards dealt at setup when barking is enabled).
    pub tower_stash: Vec<CardId>,
    pub tower_owner: Option<PlayerId>,
    /// Cards currently face-up in the draw pile (e.g. flipped Imploding Kitten or Catomic Bomb).
    pub face_up: BTreeSet<CardId>,
    pub imploding_face_up: bool,
    pub turn: TurnState,
    pub pending: Vec<Pending>,
    pub winner: Option<PlayerId>,
    pub(crate) last_action: Option<LastAction>,
    pub(crate) next_id: u64,
}

impl State {
    pub fn active_count(&self) -> usize {
        self.players
            .iter()
            .filter(|player| !player.eliminated)
            .count()
    }

    pub fn is_active(&self, player: PlayerId) -> bool {
        self.players
            .get(player.0)
            .is_some_and(|entry| !entry.eliminated)
    }

    pub fn active_players(&self) -> impl Iterator<Item = PlayerId> + '_ {
        self.players
            .iter()
            .enumerate()
            .filter(|(_, player)| !player.eliminated)
            .map(|(index, _)| PlayerId(index))
    }

    pub fn next_active(&self, player: PlayerId) -> Option<PlayerId> {
        let count = self.players.len();
        if count == 0 {
            return None;
        }
        let step = if self.turn.direction >= 0 {
            1
        } else {
            count - 1
        };
        (1..=count)
            .map(|offset| PlayerId((player.0 + offset * step) % count))
            .find(|candidate| self.is_active(*candidate))
    }

    pub fn active_order_from(&self, start: PlayerId) -> Vec<PlayerId> {
        let count = self.players.len();
        if count == 0 {
            return Vec::new();
        }
        let step = if self.turn.direction >= 0 {
            1
        } else {
            count - 1
        };
        (0..count)
            .map(|offset| PlayerId((start.0 + offset * step) % count))
            .filter(|candidate| self.is_active(*candidate))
            .collect()
    }

    pub fn first_other_active(&self, player: PlayerId) -> Option<PlayerId> {
        self.active_players().find(|candidate| *candidate != player)
    }

    pub fn first_ill_take_that_target(&self, player: PlayerId) -> Option<PlayerId> {
        self.active_players().find(|candidate| {
            *candidate != player && self.players[candidate.0].ill_take_that.is_none()
        })
    }

    pub fn top_known_card(&self) -> Option<CardKind> {
        let top = self.deck.last()?;
        self.face_up.contains(top).then(|| top.kind()).flatten()
    }

    pub fn decision(&self) -> Option<Decision> {
        if self.winner.is_some() {
            return None;
        }
        if let Some(frame) = self.pending.last() {
            let player = frame.player()?;
            let kind = match frame.kind {
                PendingKind::Defuse { .. } => DecisionKind::Defuse {
                    max_position: self.deck.len(),
                },
                PendingKind::InsertImploding { .. } => DecisionKind::InsertImploding {
                    max_position: self.deck.len(),
                },
                PendingKind::BuryCard { .. } => DecisionKind::BuryCard {
                    max_position: self.deck.len(),
                },
                PendingKind::AttackTarget { .. } => DecisionKind::AttackTarget,
                PendingKind::FavourTarget { .. } => DecisionKind::FavourTarget,
                PendingKind::FavourCard { actor, .. } => DecisionKind::FavourCard { actor },
                PendingKind::RandomTarget { .. } => DecisionKind::RandomTarget,
                PendingKind::StealTarget { .. } => DecisionKind::StealTarget,
                PendingKind::StealKind { target, .. } => DecisionKind::StealKind { target },
                PendingKind::TakeDiscard { .. } => DecisionKind::TakeDiscard,
                PendingKind::AlterFuture {
                    count,
                    share_with_next,
                    ..
                } => DecisionKind::AlterFuture {
                    count,
                    share_with_next,
                },
                PendingKind::GiveToDeck { shuffle_after, .. } => {
                    DecisionKind::GiveToDeck { shuffle_after }
                }
                PendingKind::MarkTarget { .. } => DecisionKind::MarkTarget,
                PendingKind::CurseTarget { .. } => DecisionKind::CurseTarget,
                PendingKind::IllTakeThatTarget { .. } => DecisionKind::IllTakeThatTarget,
                PendingKind::BarkingTarget { .. } => DecisionKind::BarkingTarget,
            };
            return Some(Decision {
                player,
                pending_id: Some(frame.id),
                kind,
            });
        }
        self.is_active(self.turn.player).then_some(Decision {
            player: self.turn.player,
            pending_id: None,
            kind: DecisionKind::Turn,
        })
    }

    pub fn last_action(&self) -> Option<PublicAction> {
        self.last_action.as_ref().map(|action| PublicAction {
            id: action.id,
            actor: action.actor,
            played: action.played,
            nopeable: action.nopeable,
        })
    }

    pub(crate) fn capture(&self) -> History {
        History {
            players: self.players.clone(),
            deck: self.deck.clone(),
            discard: self.discard.clone(),
            removed: self.removed.clone(),
            tower_stash: self.tower_stash.clone(),
            tower_owner: self.tower_owner,
            face_up: self.face_up.clone(),
            imploding_face_up: self.imploding_face_up,
            turn: self.turn,
            pending: self.pending.clone(),
            winner: self.winner,
        }
    }

    pub(crate) fn restore(&mut self, history: History) {
        self.players = history.players;
        self.deck = history.deck;
        self.discard = history.discard;
        self.removed = history.removed;
        self.tower_stash = history.tower_stash;
        self.tower_owner = history.tower_owner;
        self.face_up = history.face_up;
        self.imploding_face_up = history.imploding_face_up;
        self.turn = history.turn;
        self.pending = history.pending;
        self.winner = history.winner;
    }

    pub(crate) fn new_id(&mut self) -> PendingId {
        let id = PendingId(self.next_id);
        self.next_id += 1;
        id
    }

    pub(crate) fn push_pending(&mut self, kind: PendingKind) -> PendingId {
        let id = self.new_id();
        self.pending.push(Pending { id, kind });
        id
    }

    pub(crate) fn remove_from_hand(&mut self, player: PlayerId, card: CardId) -> bool {
        let entry = &mut self.players[player.0];
        let Some(index) = entry.hand.iter().position(|held| *held == card) else {
            return false;
        };
        entry.hand.remove(index);
        entry.marked_cards.retain(|marked| *marked != card);
        true
    }

    pub(crate) fn discard(&mut self, card: CardId) {
        self.face_up.remove(&card);
        self.discard.push(card);
    }

    pub(crate) fn clear_non_imploding_face_up(&mut self) {
        self.face_up
            .retain(|card| card.kind() == Some(CardKind::Imploding) && self.imploding_face_up);
    }
}

impl Pending {
    pub fn player_id(&self) -> Option<PlayerId> {
        self.player()
    }
}
