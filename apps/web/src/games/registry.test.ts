import assert from 'node:assert/strict';
import test from 'node:test';
import { games, loadGame, registry } from './registry.ts';

test('registry covers every game kind and only enables ready games', async () => {
  assert.deepEqual(games.map(game => game.id), ['bang', 'uno', 'werewolf', 'cats']);
  assert.deepEqual(games.map(game => game.enabled), [true, false, false, true]);
  assert.deepEqual(registry.bang.limits, [4, 7]);
  assert.deepEqual(registry.cats.limits, [2, 8]);
  assert.equal(registry.cats.status, 'available');
  assert.equal(registry.cats.enabled, true);
  for (const game of [registry.uno, registry.werewolf]) {
    assert.equal(game.status, 'soon');
    assert.equal(game.enabled, false);
    await assert.rejects(loadGame(game.id), /chưa được hỗ trợ/);
  }
});
