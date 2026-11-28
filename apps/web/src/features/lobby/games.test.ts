import assert from 'node:assert/strict';
import test from 'node:test';
import { availableGames, games } from '../../games/registry.ts';

test('catalog exposes BANG! and Ma Sói as playable and describes upcoming games in Vietnamese', () => {
  assert.deepEqual(games.map(game => [game.id, game.status]), [['bang', 'available'], ['uno', 'soon'], ['werewolf', 'available']]);
  assert.deepEqual(Object.keys(availableGames), games.filter(game => game.status === 'available').map(game => game.id));
  assert.equal(availableGames.bang!.name, 'BANG!');
  assert.equal(availableGames.bang!.limits?.[0], 4);
  assert.equal(availableGames.bang!.limits?.[1], 7);
  assert.equal(availableGames.werewolf!.name, 'Ma Sói');
  assert.equal(availableGames.werewolf!.limits?.[0], 5);
  assert.equal(availableGames.werewolf!.limits?.[1], 16);
  for (const game of games) assert.match(game.description, /[áàảãạăâđéèêíìóòôơúùưýỳ]/);
});
