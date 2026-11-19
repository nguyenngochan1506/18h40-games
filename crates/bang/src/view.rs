use crate::{
    actions::ActionError,
    model::{CardId, Character, PlayerId, Role},
    state::{Decision, GameState, TurnState, Winner},
};
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicPlayer {
    pub id: PlayerId,
    pub character: Character,
    pub health: i16,
    pub max_health: i16,
    pub alive: bool,
    pub hand_count: usize,
    pub in_play: Vec<CardId>,
    pub weapon_range: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub jail_turns_left: Option<u8>,
    pub role: Option<Role>,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpectatorView {
    pub players: Vec<PublicPlayer>,
    pub turn: TurnState,
    pub waiting: Option<Decision>,
    pub draw_count: usize,
    pub discard_count: usize,
    pub discard_top: Option<CardId>,
    pub winner: Option<Winner>,
    pub store_slots: u8,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerView {
    pub you: PlayerId,
    pub hand: Vec<CardId>,
    /// The top private Kit/Lucky pool, visible only to its owner.
    pub choices: Vec<CardId>,
    pub table: SpectatorView,
}

pub fn spectator_view(state: &GameState) -> SpectatorView {
    SpectatorView {
        players: state
            .players
            .iter()
            .enumerate()
            .map(|(i, p)| PublicPlayer {
                id: PlayerId(i),
                character: p.character,
                health: p.health,
                max_health: p.max_health,
                alive: p.alive,
                hand_count: p.hand.len(),
                in_play: p.in_play.clone(),
                weapon_range: p.weapon_range(),
                jail_turns_left: (state.config.mode == crate::GameMode::Club
                    && p.has_in_play(crate::CardKind::Jail))
                .then_some(3u8.saturating_sub(p.jail_turns_served)),
                role: (p.role == Role::Sheriff || !p.alive || state.winner.is_some())
                    .then_some(p.role),
            })
            .collect(),
        turn: state.turn,
        waiting: state.decision(),
        draw_count: state.draw_pile.len(),
        discard_count: state.discard_pile.len(),
        discard_top: state
            .discard_pile
            .last()
            .copied()
            .filter(|card| !state.hidden_discards.contains(card)),
        winner: state.winner,
        store_slots: state
            .pending
            .iter()
            .map(|frame| match &frame.kind {
                crate::state::PendingKind::GeneralStore { pool, .. } => pool.len() as u8,
                _ => 0,
            })
            .sum(),
    }
}

pub fn view(state: &GameState, player: PlayerId) -> Result<PlayerView, ActionError> {
    let own = state
        .players
        .get(player.0)
        .ok_or(ActionError::UnknownPlayer)?;
    let mut table = spectator_view(state);
    table.players[player.0].role = Some(own.role);
    Ok(PlayerView {
        you: player,
        hand: own.hand.clone(),
        choices: state
            .pending
            .last()
            .filter(|frame| frame.player() == Some(player))
            .map(|frame| match &frame.kind {
                crate::state::PendingKind::KeepCards { pool, .. }
                | crate::state::PendingKind::ChooseDrawResult { pool, .. } => pool.clone(),
                _ => Vec::new(),
            })
            .unwrap_or_default(),
        table,
    })
}
