use crate::{
    model::{CardId, CardKind, CardView, PlayerId, Settings},
    state::{Decision, PendingKind, PublicAction, State, TurnState},
};
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsPublicPlayer"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicPlayer {
    pub id: PlayerId,
    pub hand_count: usize,
    pub eliminated: bool,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsSpectatorView"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpectatorView {
    pub settings: Settings,
    pub players: Vec<PublicPlayer>,
    pub turn: TurnState,
    pub deck_count: usize,
    pub top_known: Option<CardKind>,
    pub imploding_face_up: bool,
    pub discard: Vec<CardView>,
    pub decision: Option<Decision>,
    pub last_action: Option<PublicAction>,
    pub winner: Option<PlayerId>,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "CatsPlayerView"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerView {
    pub you: PlayerId,
    pub hand: Vec<CardView>,
    /// Private cards visible only to the decision owner (e.g. Alter/Share Future or Bury).
    pub preview_cards: Vec<CardView>,
    pub table: SpectatorView,
}

pub fn spectator_view(state: &State) -> SpectatorView {
    SpectatorView {
        settings: state.settings.clone(),
        players: state
            .players
            .iter()
            .enumerate()
            .map(|(index, player)| PublicPlayer {
                id: PlayerId(index),
                hand_count: player.hand.len(),
                eliminated: player.eliminated,
            })
            .collect(),
        turn: state.turn,
        deck_count: state.deck.len(),
        top_known: state.top_known_card(),
        imploding_face_up: state.imploding_face_up,
        discard: cards(&state.discard),
        decision: state.decision(),
        last_action: state.last_action(),
        winner: state.winner,
    }
}

pub fn view(state: &State, player: PlayerId) -> PlayerView {
    let preview_cards = match state.pending.last().map(|frame| &frame.kind) {
        Some(PendingKind::AlterFuture { actor, count, .. }) if *actor == player => state
            .deck
            .iter()
            .rev()
            .take(*count)
            .filter_map(|card| CardView::new(*card))
            .collect(),
        Some(PendingKind::BuryCard {
            player: owner,
            card,
        }) if *owner == player => CardView::new(*card).into_iter().collect(),
        _ => Vec::new(),
    };

    PlayerView {
        you: player,
        hand: state
            .players
            .get(player.0)
            .map(|entry| cards(&entry.hand))
            .unwrap_or_default(),
        preview_cards,
        table: spectator_view(state),
    }
}

fn cards(cards: &[CardId]) -> Vec<CardView> {
    cards
        .iter()
        .filter_map(|card| CardView::new(*card))
        .collect()
}
