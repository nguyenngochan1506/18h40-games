use crate::{
    actions::ActionError,
    model::{PlayerId, Role},
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
