import assert from 'node:assert/strict';
import test from 'node:test';
import { games, loadGame, registry } from './registry.ts';

test('registry covers all three game kinds and keeps unfinished games disabled', async () => {
  assert.deepEqual(games.map(game => game.id), ['bang', 'uno', 'werewolf']);
  assert.deepEqual(games.map(game => game.enabled), [true, false, false]);
  assert.deepEqual(registry.bang.limits, [4, 7]);
  for (const game of [registry.uno, registry.werewolf]) {
    assert.equal(game.status, 'soon');
    assert.equal(game.enabled, false);
    await assert.rejects(loadGame(game.id), /chưa được hỗ trợ/);
  }
});
