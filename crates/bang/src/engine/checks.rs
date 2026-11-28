use super::*;
use crate::state::{Defense, DrawContinuation};

pub(super) fn begin<R: Rng + ?Sized>(
    state: &mut GameState,
    player: PlayerId,
    reason: CardKind,
    continuation: DrawContinuation,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let lucky = state.players[player.0].has(Character::LuckyDuke);
    let pool = take_draw(state, if lucky { 2 } else { 1 }, rng, events);
    if lucky && !pool.is_empty() {
        skills::activate(state, player, events);
        skills::offer(player, &pool, events);
        state.push_pending(PendingKind::ChooseDrawResult {
            player,
            pool,
            reason,
            continuation,
        });
    } else {
        let card = pool.first().copied();
        if let Some(card) = card {
            reveal(state, player, reason, card, events);
        }
        resume(state, continuation, card, rng, events);
    }
}

pub(super) fn wait(
    state: &mut GameState,
    player: PlayerId,
    reason: CardKind,
    continuation: DrawContinuation,
) {
    state.push_pending(PendingKind::Check {
        player,
        reason,
        continuation,
    });
}

fn reveal(
    state: &mut GameState,
    player: PlayerId,
    reason: CardKind,
    card: CardId,
    events: &mut Vec<Event>,
) {
    state.discard(card);
    events.push(Event::public(EventKind::DrawRevealed {
        player,
        reason,
        card,
    }));
}

pub(super) fn choose<R: Rng + ?Sized>(
    state: &mut GameState,
    card: CardId,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let PendingKind::ChooseDrawResult {
        player,
        pool,
        reason,
        continuation,
    } = state.pending.pop().unwrap().kind
    else {
        unreachable!()
    };
    for other in pool {
        if other != card {
            state.discard_hidden(other);
        }
    }
    reveal(state, player, reason, card, events);
    resume(state, continuation, Some(card), rng, events);
}

pub(super) fn defend(state: &mut GameState, defense: Defense) {
    if defense.remaining == 0 {
        return;
    }
    state.push_pending(PendingKind::AttackResponse {
        target: defense.target,
        source: defense.source,
        kind: defense.kind,
        remaining: defense.remaining,
        checks_left: defense.checks_left,
        damage: defense.damage,
    });
}

fn resume<R: Rng + ?Sized>(
    state: &mut GameState,
    continuation: DrawContinuation,
    card: Option<CardId>,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    let face = card.and_then(CardId::card);
    match continuation {
        DrawContinuation::Defense { mut defense } => {
            if face.is_some_and(|c| c.suit == Suit::Hearts) {
                defense.remaining -= 1;
            }
            defend(state, defense);
        }
        DrawContinuation::Dynamite {
            player,
            card: dynamite,
        } => {
            if face.is_some_and(|c| c.suit == Suit::Spades && (2..=9).contains(&(c.rank as u8))) {
                discard_in_play(state, player, dynamite, events);
                damage_player(state, player, None, None, 3, rng, events);
            } else {
                let target = if state.config.mode == crate::GameMode::Club {
                    let round = state
                        .dynamite_rounds
                        .iter_mut()
                        .find(|round| round.card == dynamite)
                        .unwrap();
                    round
                        .remaining
                        .retain(|id| *id != player && state.players[id.0].alive);
                    // Several Dynamites may be on the table: pass over players who already
                    // hold one, but keep the seats after the target for the next pass.
                    let Some(skip) = round
                        .remaining
                        .iter()
                        .position(|id| !state.players[id.0].has_in_play(CardKind::Dynamite))
                    else {
                        discard_in_play(state, player, dynamite, events);
                        events.push(Event::public(EventKind::DynamiteRoundEnded { player }));
                        return;
                    };
                    round.remaining.drain(..skip);
                    round.remaining[0]
                } else {
                    // With two Dynamites (Dodge City) it skips players that already hold one.
                    let count = state.players.len();
                    let Some(target) = (1..count)
                        .map(|offset| PlayerId((player.0 + offset) % count))
                        .find(|id| {
                            state.players[id.0].alive
                                && !state.players[id.0].has_in_play(CardKind::Dynamite)
                        })
                    else {
                        return;
                    };
                    target
                };
                let index = state.players[player.0]
                    .in_play
                    .iter()
                    .position(|id| *id == dynamite)
                    .unwrap();
                state.players[player.0].in_play.remove(index);
                state.players[target.0].in_play.push(dynamite);
                events.push(Event::public(EventKind::CardPassed {
                    source: player,
                    target,
                    card: dynamite,
                }));
            }
        }
        DrawContinuation::Jail { player, card: jail } => {
            let escaped = face.is_some_and(|c| c.suit == Suit::Hearts);
            if state.config.mode == crate::GameMode::Club && !escaped {
                state.players[player.0].jail_turns_served += 1;
                events.push(Event::public(EventKind::JailHeld {
                    player,
                    turns_left: 3 - state.players[player.0].jail_turns_served,
                }));
            } else {
                discard_in_play(state, player, jail, events);
            }
            if !escaped {
                // The turn is skipped before the draw step, so Vera never gets to pick again:
                // her old copy ends with the lost turn (it still held for the check above).
                state.players[player.0].copied = None;
                next_turn(state, events);
            }
        }
    }
}
