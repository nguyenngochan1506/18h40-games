use crate::{
    actions::ActionError,
    model::{CardKind, Character, PlayerId, Role},
    state::{GameState, Winner},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DistanceModifiers {
    pub target_mustang: u8,
    pub target_paul: u8,
    pub source_scope: u8,
    pub source_rose: u8,
}

pub fn distance(
    state: &GameState,
    from: PlayerId,
    to: PlayerId,
    modifiers: DistanceModifiers,
) -> Result<u16, ActionError> {
    let living: Vec<_> = state
        .players
        .iter()
        .enumerate()
        .filter(|(_, p)| p.alive)
        .map(|(i, _)| PlayerId(i))
        .collect();
    let from = living
        .iter()
        .position(|id| *id == from)
        .ok_or(ActionError::InvalidTarget)?;
    let to = living
        .iter()
        .position(|id| *id == to)
        .ok_or(ActionError::InvalidTarget)?;
    let clockwise = from.abs_diff(to);
    let base = clockwise.min(living.len() - clockwise) as i32;
    Ok(
        (base + i32::from(modifiers.target_mustang) + i32::from(modifiers.target_paul)
            - i32::from(modifiers.source_scope)
            - i32::from(modifiers.source_rose))
        .max(1) as u16,
    )
}

pub(crate) fn winner(state: &GameState) -> Option<Winner> {
    let living: Vec<_> = state
        .players
        .iter()
        .enumerate()
        .filter(|(_, p)| p.alive)
        .collect();
    if !living.iter().any(|(_, p)| p.role == Role::Sheriff) {
        if living.len() == 1 && living[0].1.role == Role::Renegade {
            Some(Winner::Renegade {
                player: PlayerId(living[0].0),
            })
        } else {
            Some(Winner::Outlaws)
        }
    } else if !living
        .iter()
        .any(|(_, p)| matches!(p.role, Role::Outlaw | Role::Renegade))
    {
        Some(Winner::SheriffAndDeputies)
    } else {
        None
    }
}

/// Belle Star: during her turn every card in front of the other players is inactive.
pub fn table_active(state: &GameState, owner: PlayerId) -> bool {
    let turn = &state.players[state.turn.player.0];
    owner == state.turn.player || !(turn.alive && turn.has(Character::BelleStar))
}

fn count_in_play(state: &GameState, owner: PlayerId, kinds: &[CardKind]) -> u8 {
    if !table_active(state, owner) {
        return 0;
    }
    kinds
        .iter()
        .filter(|kind| state.players[owner.0].has_in_play(**kind))
        .count() as u8
}

pub fn effective_distance(
    state: &GameState,
    from: PlayerId,
    to: PlayerId,
) -> Result<u16, ActionError> {
    let source = state
        .players
        .get(from.0)
        .ok_or(ActionError::InvalidTarget)?;
    let target = state.players.get(to.0).ok_or(ActionError::InvalidTarget)?;
    distance(
        state,
        from,
        to,
        DistanceModifiers {
            target_mustang: count_in_play(state, to, &[CardKind::Mustang, CardKind::Hideout]),
            source_scope: count_in_play(state, from, &[CardKind::Scope, CardKind::Binocular]),
            target_paul: u8::from(from != to && target.has(Character::PaulRegret)),
            source_rose: u8::from(source.has(Character::RoseDoolan)),
        },
    )
}
