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
    let lucky = state.players[player.0].character == Character::LuckyDuke;
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

pub(super) fn defend<R: Rng + ?Sized>(
    state: &mut GameState,
    mut defense: Defense,
    rng: &mut R,
    events: &mut Vec<Event>,
) {
    if defense.remaining == 0 {
        return;
    }
    if defense.checks_left > 0 {
        defense.checks_left -= 1;
        begin(
            state,
            defense.target,
            CardKind::Barrel,
            DrawContinuation::Defense { defense },
            rng,
            events,
        );
    } else {
        state.push_pending(PendingKind::AttackResponse {
            target: defense.target,
            source: defense.source,
            kind: defense.kind,
            remaining: defense.remaining,
            damage: 1,
        });
    }
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
            defend(state, defense, rng, events);
        }
        DrawContinuation::Dynamite {
            player,
            card: dynamite,
        } => {
            if face.is_some_and(|c| c.suit == Suit::Spades && (2..=9).contains(&(c.rank as u8))) {
                discard_in_play(state, player, dynamite, events);
                damage_player(state, player, None, None, 3, rng, events);
            } else {
                let target = next_living(state, player);
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
            discard_in_play(state, player, jail, events);
            if !face.is_some_and(|c| c.suit == Suit::Hearts) {
                next_turn(state, events);
            }
        }
    }
}
