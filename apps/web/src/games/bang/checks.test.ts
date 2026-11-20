import assert from 'node:assert/strict';
import test from 'node:test';
import { demoGame } from './demo/demo.ts';
import { actionMode, flipBarrelAction, flipCheckAction, respondAction } from './actions.ts';
import { eventsToLog } from './log.ts';
import { turnBanner } from './turnBanner.ts';

function fixture() {
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Expected player');
  const table = game.view.view.table;
  table.waiting = { player: 0, pending_id: 90, kind: { type: 'check', reason: 'dynamite' } };
  return { game, table };
}

test('manual checks use the current actor, pending id and request lock', () => {
  const { game, table } = fixture();
  assert.equal(actionMode(game), 'check');
  assert.deepEqual(flipCheckAction(game, false), { type: 'flip_check', pending_id: 90 });
  table.waiting!.pending_id = 91;
  assert.deepEqual(flipCheckAction(game, false), { type: 'flip_check', pending_id: 91 });
  assert.equal(flipCheckAction(game, true), null);
  assert.equal(flipBarrelAction(game, false), null);
  table.waiting!.player = 1;
  assert.equal(flipCheckAction(game, false), null);
  table.waiting!.player = 0;
  table.waiting!.pending_id = null;
  assert.equal(flipCheckAction(game, false), null);
});

test('Barrel and Missed are parallel choices and only the supplied remaining checks enable flipping', () => {
  const { game, table } = fixture();
  table.waiting!.kind = { type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 2 };
  assert.deepEqual(flipBarrelAction(game, false), { type: 'flip_barrel', pending_id: 90 });
  assert.deepEqual(respondAction(game, 26, false), { type: 'respond', pending_id: 90, card: 26 });
  assert.deepEqual(respondAction(game, null, false), { type: 'respond', pending_id: 90, card: null });
  assert.equal(flipBarrelAction(game, true), null);
  assert.equal(flipCheckAction(game, false), null);
  table.waiting!.kind.checks_left = 0;
  assert.equal(flipBarrelAction(game, false), null);
  table.waiting!.kind = { type: 'choose_draw_result', reason: 'barrel' };
  assert.equal(flipBarrelAction(game, false), null);
});

test('manual check banners and logs announce the reason without inventing the result', () => {
  const { table } = fixture();
  const names = new Map([[0, 'Hân']]);
  assert.equal(turnBanner(table, names, 0)?.text, 'Chờ bạn lật Dynamite');
  assert.equal(turnBanner(table, names, 1)?.text, 'Hân đang lật Dynamite');
  assert.deepEqual(eventsToLog([{ type: 'decision_changed', decision: table.waiting }], { seats: demoGame.seats, you: 0 }), ['Đang chờ Hân (bạn) lật kiểm tra cho Dynamite.']);
  table.waiting!.kind = { type: 'check', reason: 'jail' };
  assert.equal(turnBanner(table, names, 1)?.text, 'Hân đang lật Jail');
  table.waiting!.kind = { type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 1 };
  assert.equal(turnBanner(table, names, 1)?.text, 'Hân đang lật Barrel hoặc phản ứng');
  table.waiting!.kind = { type: 'choose_draw_result', reason: 'barrel' };
  assert.equal(turnBanner(table, names, 1)?.text, 'Hân đang lật Barrel');
});
