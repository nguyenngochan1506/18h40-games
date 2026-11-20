import assert from 'node:assert/strict';
import test from 'node:test';
import { availableGames, games } from '../../games/registry.ts';

test('catalog exposes only BANG! as playable and describes upcoming games in Vietnamese', () => {
  assert.deepEqual(games.map(game => [game.id, game.status]), [['bang', 'available'], ['uno', 'soon'], ['werewolf', 'soon']]);
  assert.deepEqual(Object.keys(availableGames), games.filter(game => game.status === 'available').map(game => game.id));
  assert.equal(availableGames.bang!.name, 'BANG!');
  assert.equal(availableGames.bang!.limits?.[0], 4);
  assert.equal(availableGames.bang!.limits?.[1], 7);
  assert.equal(games[2].name, 'Ma Sói');
  for (const game of games) assert.match(game.description, /[áàảãạăâđéèêíìóòôơúùưýỳ]/);
});
