import type { CardId, EventKind, PublicPlayer } from '../../generated/protocol.ts';

export const DEAL_LIMIT = 35;
export const DEAL_DURATION = .3;

export function shouldDeal(events: EventKind[] | undefined, seen: number | null, id: number | undefined, state: { enabled: boolean; hidden: boolean; reduced: boolean; ownTurn: boolean }) {
  return id !== undefined && id !== seen && !!events?.some(event => event.type === 'game_started') && state.enabled && !state.hidden && !state.reduced && !state.ownTurn;
}

export function dealPlan(players: Pick<PublicPlayer, 'id' | 'max_health' | 'hand_count'>[], you: number | null, hand: CardId[]) {
  const plan: { player: number; card: CardId | null; delay: number; index: number }[] = [];
  // Public counts determine the flight count; only the recipient's hand can supply faces.
  for (let round = 0; round < 5; round++) for (const player of players) {
    if (round >= Math.min(player.max_health, player.hand_count) || plan.length >= DEAL_LIMIT) continue;
    plan.push({ player: player.id, card: player.id === you ? hand[round] ?? null : null, delay: plan.length * .025, index: round });
  }
  return plan;
}

export function handPose(index: number, count: number, picked: boolean, active: boolean, reduced: boolean) {
  const fan = Math.max(-12, Math.min(12, (index - (count - 1) / 2) * 4));
  return reduced ? { y: 0, rotate: fan, scale: 1 } : { y: picked ? -20 : active ? -12 : 0, rotate: picked ? -3 : active ? 0 : fan, scale: active || picked ? 1.04 : 1 };
}

export function cardFlight(hand: boolean, reduced: boolean) {
  return reduced ? { x: 0, y: 0, rotate: 0 } : hand ? { x: 24, y: 40, rotate: 8 } : { x: 0, y: -12, rotate: -6 };
}
