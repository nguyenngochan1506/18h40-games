import type { EventKind } from '../../generated/protocol.ts';

// Dev-only event fixtures; this module is reachable only through GameDemo.
export const demoFx = {
  shot: { label: 'BANG! · khói và lửa', events: [{ type: 'card_played', player: 1, card: 1, target: 0 }] },
  gatling: { label: 'Gatling', events: [{ type: 'card_played', player: 0, card: 58, target: null }] },
  damage: { label: 'Chịu đòn', events: [{ type: 'health_changed', player: 1, source: 0, delta: -1, health: 1 }] },
  missed: { label: 'Missed! / bật đạn', events: [{ type: 'decision_changed', decision: { player: 1, pending_id: 7, kind: { type: 'attack_response', kind: 'bang', remaining: 1, checks_left: 0 } } }, { type: 'card_played', player: 1, card: 26, target: null }] },
  heal: { label: 'Beer · hồi máu', events: [{ type: 'card_played', player: 1, card: 37, target: null }, { type: 'health_changed', player: 1, source: null, delta: 1, health: 3 }] },
  explosion: { label: 'Dynamite nổ', events: [{ type: 'draw_revealed', player: 1, reason: 'dynamite', card: 27 }, { type: 'card_discarded', player: 1, card: 65 }, { type: 'health_changed', player: 1, source: null, delta: -3, health: 0 }] },
  jail: { label: 'Jail · song sắt', events: [{ type: 'card_played', player: 0, card: 66, target: 1 }, { type: 'card_equipped', player: 1, card: 66 }] },
  duel: { label: 'Duel / Indians!', events: [{ type: 'card_played', player: 0, card: 51, target: 1 }, { type: 'card_played', player: 0, card: 54, target: null }] },
  eliminate: { label: 'Bị loại · hồn ma', events: [{ type: 'player_eliminated', player: 1, role: 'outlaw' }] },
  draw: { label: 'Rút bài', events: [{ type: 'cards_drawn', player: 0, count: 2 }, { type: 'cards_received', player: 0, cards: [1, 26] }] },
  steal: { label: 'Cướp bài · lá úp', events: [{ type: 'cards_stolen', source: 0, target: 1, count: 1 }] },
  turn: { label: 'Chuyển lượt', events: [{ type: 'turn_started', player: 2 }] },
  win: { label: 'Thắng · pháo giấy', events: [{ type: 'game_ended', winner: 'outlaws', roles: ['sheriff', 'outlaw', 'deputy', 'outlaw'] }] },
} satisfies Record<string, { label: string; events: EventKind[] }>;
