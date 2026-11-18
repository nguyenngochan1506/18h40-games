use crate::{
    model::{CardId, CardKind, PlayerId, Role},
    rules::effective_distance,
    state::{AttackKind, GameState, PendingId, PendingKind},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardSelection {
    Hand,
    InPlay(CardId),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Play {
        card: CardId,
        target: Option<PlayerId>,
    },
    AffectCard {
        card: CardId,
        target: PlayerId,
        selection: CardSelection,
    },
    ChooseCard {
        pending_id: PendingId,
        card: CardId,
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
    DuplicateInPlay,
}

fn held_kind(state: &GameState, player: PlayerId, card: CardId) -> Result<CardKind, ActionError> {
    if !state.players[player.0].hand.contains(&card) {
        return Err(ActionError::CardNotInHand);
    }
    Ok(card.card().ok_or(ActionError::InvalidCard)?.kind)
}

fn target_player(state: &GameState, target: PlayerId) -> Result<(), ActionError> {
    if state.players.get(target.0).is_some_and(|p| p.alive) {
        Ok(())
    } else {
        Err(ActionError::InvalidTarget)
    }
}

pub(crate) fn response_kind(frame: &PendingKind) -> Option<CardKind> {
    match frame {
        PendingKind::AttackResponse {
            kind: AttackKind::Indians,
            ..
        }
        | PendingKind::Duel { .. } => Some(CardKind::Bang),
        PendingKind::AttackResponse { .. } => Some(CardKind::Missed),
        PendingKind::Dying { .. } => Some(CardKind::Beer),
        _ => None,
    }
}

pub(crate) fn validate(
    state: &GameState,
    player: PlayerId,
    action: &Action,
) -> Result<(), ActionError> {
    if state.winner.is_some() {
        return Err(ActionError::GameOver);
    }
    let own = state
        .players
        .get(player.0)
        .ok_or(ActionError::UnknownPlayer)?;
    if !own.alive {
        return Err(ActionError::Eliminated);
    }
    if state.decision().map(|d| d.player) != Some(player) {
        return Err(ActionError::NotYourDecision);
    }
    if let Some(frame) = state.pending.last() {
        return match action {
            Action::ChooseCard { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                match &frame.kind {
                    PendingKind::GeneralStore { pool, .. } if pool.contains(card) => Ok(()),
                    PendingKind::GeneralStore { .. } => Err(ActionError::InvalidCard),
                    _ => Err(ActionError::WrongAction),
                }
            }
            Action::Respond { pending_id, card } => {
                if *pending_id != frame.id {
                    return Err(ActionError::StalePending);
                }
                let expected = response_kind(&frame.kind).ok_or(ActionError::WrongAction)?;
                if let Some(card) = card
                    && held_kind(state, player, *card)? != expected
                {
                    return Err(ActionError::WrongAction);
                }
                Ok(())
            }
            _ => Err(ActionError::WrongAction),
        };
    }
    match action {
        Action::Respond { .. } | Action::ChooseCard { .. } => Err(ActionError::StalePending),
        Action::Play { card, target } => {
            let kind = held_kind(state, player, *card)?;
            match kind {
                CardKind::Bang | CardKind::Duel | CardKind::Jail => {
                    let target = target.ok_or(ActionError::InvalidTarget)?;
                    target_player(state, target)?;
                    if target == player {
                        return Err(ActionError::InvalidTarget);
                    }
                    if kind == CardKind::Bang {
                        if state.turn.bangs_played >= 1 && !own.has_in_play(CardKind::Volcanic) {
                            return Err(ActionError::BangLimit);
                        }
                        if effective_distance(state, player, target)? > own.weapon_range() {
                            return Err(ActionError::OutOfRange);
                        }
                    } else if kind == CardKind::Jail {
                        if state.players[target.0].role == Role::Sheriff {
                            return Err(ActionError::InvalidTarget);
                        }
                        if state.players[target.0].has_in_play(kind) {
                            return Err(ActionError::DuplicateInPlay);
                        }
                    }
                    Ok(())
                }
                CardKind::Missed | CardKind::Panic | CardKind::CatBalou => {
                    Err(ActionError::WrongAction)
                }
                _ => {
                    if target.is_some_and(|target| target != player) {
                        return Err(ActionError::InvalidTarget);
                    }
                    if kind.is_equipment() && own.has_in_play(kind) {
                        return Err(ActionError::DuplicateInPlay);
                    }
                    Ok(())
                }
            }
        }
        Action::AffectCard {
            card,
            target,
            selection,
        } => {
            let kind = held_kind(state, player, *card)?;
            if !matches!(kind, CardKind::Panic | CardKind::CatBalou) {
                return Err(ActionError::WrongAction);
            }
            target_player(state, *target)?;
            if kind == CardKind::Panic && effective_distance(state, player, *target)? > 1 {
                return Err(ActionError::OutOfRange);
            }
            let target_player = &state.players[target.0];
            match selection {
                CardSelection::Hand
                    if target_player.hand.len() > usize::from(*target == player) =>
                {
                    Ok(())
                }
                CardSelection::InPlay(card) if target_player.in_play.contains(card) => Ok(()),
                _ => Err(ActionError::InvalidTarget),
            }
        }
        Action::EndTurn { discard } => {
            let excess = own.hand.len().saturating_sub(own.health.max(0) as usize);
            if discard.len() != excess {
                return Err(ActionError::InvalidDiscard);
            }
            for (index, card) in discard.iter().enumerate() {
                if !own.hand.contains(card) || discard[..index].contains(card) {
                    return Err(ActionError::InvalidDiscard);
                }
            }
            Ok(())
        }
    }
}
