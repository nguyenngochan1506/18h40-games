import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EventKind } from '../../generated/protocol.ts';
import { demoGame } from './demo/demo.ts';
import { demoEvents } from './demo/demoEvents.ts';
import { cardName, eventsToLog, gameResult } from './log.ts';

const ctx = { seats: demoGame.seats, you: 0 };
const expected: Record<EventKind['type'], string> = {
  game_started: 'Ván bắt đầu. Hân (bạn) là Cảnh sát trưởng.',
  turn_started: 'Lượt của Hân (bạn).',
  cards_drawn: 'Hân (bạn) rút 2 lá.',
  cards_received: 'Hân (bạn) nhận: BANG! (2♦), Missed! (3♠).',
  deck_reshuffled: 'Xáo lại 12 lá vào bộ rút.',
  skill_activated: 'Hân (bạn) dùng kỹ năng Black Jack.',
  card_shown: 'Hân (bạn) lộ lá Beer (6♥).',
  choice_offered: 'Hân (bạn) xem riêng để chọn: BANG! (2♦), Missed! (3♠).',
  card_played: 'Hân (bạn) bắn Minh bằng BANG! (2♦).',
  decision_changed: 'Đang chờ Minh đỡ bằng Missed! (còn 1) hoặc chịu đòn.',
  health_changed: 'Minh chịu đòn từ Hân (bạn), mất 1 máu (còn 2).',
  card_discarded: 'Hân (bạn) bỏ Missed! (3♠).',
  card_equipped: 'Minh đặt Barrel (Q♠) trước mặt.',
  draw_revealed: 'Minh lật kiểm tra cho Barrel: Beer (6♥).',
  dynamite_round_ended: 'Hân (bạn) bỏ Dynamite vì đã đi hết một vòng.',
  jail_held: 'Minh mất lượt; Jail còn ở lại (2 lượt).',
  jail_expired: 'Minh thoát Jail sau 3 lượt đã mất, không cần lật kiểm tra.',
  card_passed: 'Hân (bạn) chuyển Dynamite (2♥) sang Minh.',
  hand_slots_opened: 'Hân (bạn) mở bài trên tay Minh (3 lá úp).',
  hand_slot_claimed: 'Hân (bạn) chọn ô 2 trên tay Minh.',
  hand_pick_cancelled: 'Hân (bạn) dừng chọn bài từ tay Minh.',
  hand_affected: 'Hân (bạn) dùng Panic! lấy 1 lá từ tay Minh.',
  hand_card_affected: 'Hân (bạn) dùng Panic! lấy Missed! (3♠) từ tay Minh.',
  in_play_card_affected: 'Hân (bạn) dùng Cat Balou bỏ Barrel (Q♠) trước mặt Minh.',
  cards_stolen: 'Hân (bạn) lấy 1 lá từ tay Minh.',
  stolen_cards: 'Hân (bạn) lấy từ tay Minh: Missed! (3♠).',
  store_opened: 'General Store mở 2 lá úp.',
  store_card_claimed: 'Hân (bạn) chọn một lá General Store.',
  store_card_received: 'Bạn nhận BANG! (2♦).',
  pool_discarded: 'Bỏ các lá còn lại: Missed! (3♠).',
  private_pool_discarded: 'Bỏ 1 lá từ nhóm bài riêng, giữ kín mặt lá.',
  player_eliminated: 'Nam bị loại. Vai: Tội phạm.',
  cards_inherited: 'An nhận 2 lá của Nam.',
  green_activated: 'Hân (bạn) bỏ lá xanh lá BANG! (2♦) để dùng hiệu ứng.',
  table_card_taken: 'Hân (bạn) lấy Mustang (9♥) từ trước mặt Minh.',
  copy_chosen: 'Hân (bạn) có khả năng của Willy the Kid.',
  bounty_awarded: 'Hân (bạn) được thưởng rút 3 lá vì hạ Nam (Tội phạm).',
  sheriff_penalized: 'Hân (bạn) bị phạt bỏ hết bài vì hạ Minh (Phó cảnh sát).',
  game_ended: 'Tội phạm thắng.',
};
for (const [type, event] of Object.entries(demoEvents)) {
  test(`Vietnamese log: ${type}`, () => {
    assert.equal(event.type, type);
    assert.deepEqual(eventsToLog([event], ctx), [expected[event.type]]);
    assert.ok(!eventsToLog([event], { ...ctx, you: null })[0].includes('(bạn)'));
  });
}

test('recipient-filtered public events never acquire private card details, while source/target logs keep nicknames', () => {
  const publicEvents = [demoEvents.cards_stolen, demoEvents.hand_affected, demoEvents.cards_drawn, demoEvents.private_pool_discarded];
  const observer = eventsToLog(publicEvents, { ...ctx, you: 2 }).join('\n');
  assert.ok(!observer.includes('Missed!') && !observer.includes('3♠') && !observer.includes('BANG!'));
  assert.match(eventsToLog([demoEvents.hand_card_affected], { ...ctx, you: 1 })[0], /Minh \(bạn\)/);
  assert.match(eventsToLog([demoEvents.stolen_cards], { ...ctx, you: 1 })[0], /Missed! \(3♠\)/);
  assert.deepEqual(eventsToLog([{ ...demoEvents.hand_affected, kind: 'cat_balou' }], ctx), ['Hân (bạn) dùng Cat Balou buộc bỏ 1 lá từ tay Minh.']);
});

test('response phrasing follows supplied decisions, including Calamity, Slab and Duel; reveals do not invent a draw result', () => {
  const events: EventKind[] = [demoEvents.decision_changed, { type: 'card_played', player: 1, card: 26, target: null }];
  assert.equal(eventsToLog(events, ctx)[1], 'Minh đỡ bằng Missed! (3♠).');
  assert.equal(eventsToLog([{ type: 'card_played', player: 1, card: 1, target: null }], { ...ctx, waiting: { player: 1, pending_id: 1, kind: { type: 'duel' } } })[0], 'Minh đáp Duel bằng BANG! (2♦).');
  assert.equal(eventsToLog([{ type: 'health_changed', player: 0, source: null, delta: 1, health: 3 }], ctx)[0], 'Hân (bạn) hồi 1 máu (còn 3).');
  for (const reason of ['barrel', 'jail', 'dynamite'] as const) assert.ok(!eventsToLog([{ ...demoEvents.draw_revealed, reason }], ctx)[0].includes('thành công'));
  const attack = { player: 1, pending_id: 8, kind: { type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 0 } } as const;
  assert.match(eventsToLog([{ type: 'decision_changed', decision: attack }], ctx)[0], /còn 2/);
  assert.equal(eventsToLog([{ type: 'card_played', player: 1, card: 1, target: null }], { ...ctx, waiting: attack })[0], 'Minh đỡ bằng BANG! (2♦).');
  assert.equal(eventsToLog([{ type: 'card_played', player: 0, card: 37, target: null }], { ...ctx, waiting: { player: 0, pending_id: 9, kind: { type: 'dying', needed: 1 } } })[0], 'Hân (bạn) dùng Beer (6♥) để cứu mạng.');
  assert.equal(cardName(255), 'lá chưa xác định');
});

test('result reads all final roles and winner membership, including eliminated winners and the exact renegade id', () => {
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Expected player view');
  const table = game.view.view.table;
  assert.equal(gameResult(game, 0), null);
  ['sheriff', 'deputy', 'renegade', 'outlaw', 'outlaw'].forEach((role, i) => { table.players[i].role = role as typeof table.players[number]['role']; });
  table.players[0].alive = false;
  table.winner = 'sheriff_and_deputies';
  assert.deepEqual(gameResult(game, 0)!.players.map(p => p.won), [true, true, false, false, false]);
  assert.equal(gameResult(game, 0)!.players[0].name, 'Hân (bạn)');
  assert.equal(gameResult(game, 0)!.players[0].alive, false);
  assert.ok(gameResult(game, 0)!.players.every(p => p.role !== 'Vai chưa lộ'));
  table.winner = 'outlaws';
  assert.deepEqual(gameResult(game, 0)!.players.map(p => p.won), [false, false, false, true, true]);
  table.winner = { renegade: { player: 2 } };
  assert.deepEqual(gameResult(game, null)!.players.map(p => p.won), [false, false, true, false, false]);
  table.players[4].role = null;
  assert.equal(gameResult(game, null)!.players[4].won, null);
});

test('four-player custom roles show a Deputy and distinguish multiple Renegades in results', () => {
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Expected player view');
  game.seats = game.seats.slice(0, 4);
  const table = game.view.view.table;
  table.players = table.players.slice(0, 4);
  table.players.forEach((player, index) => { player.role = (['sheriff', 'deputy', 'renegade', 'renegade'] as const)[index]; });
  table.winner = 'sheriff_and_deputies';
  const result = gameResult(game, 0)!;
  assert.deepEqual(result.players.map(player => player.won), [true, true, false, false]);
  assert.equal(result.players[1].role, 'Phó cảnh sát');
  table.winner = { renegade: { player: 3 } };
  assert.deepEqual(gameResult(game, 0)!.players.map(player => player.won), [false, false, false, true]);
});


test('third failed Jail turn says release is next turn, without adding a fourth draw', () => {
  assert.deepEqual(eventsToLog([{ type: 'jail_held', player: 1, turns_left: 0 }], ctx), ['Minh đã mất 3 lượt vì Jail; Jail tự bỏ ở đầu lượt kế tiếp.']);
});
