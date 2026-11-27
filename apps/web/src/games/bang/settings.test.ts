import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { BASE_MAX_PLAYERS, expansionPacks, maxPlayersFor, roleTotal, settingsError, standardRoles } from './settings.ts';

test('standard room roles follow each supported player count', () => {
  for (const [players, deputy, outlaw, renegade] of [[4, 0, 2, 1], [5, 1, 2, 1], [6, 1, 3, 1], [7, 2, 3, 1], [8, 2, 3, 2]]) {
    const roles = standardRoles(players);
    assert.deepEqual(roles, { deputy, outlaw, renegade });
    assert.equal(roleTotal(roles), players);
    assert.equal(settingsError(roles, players, 8), null);
  }
  assert.deepEqual(standardRoles(1), standardRoles(4));
});

test('custom roles require the seat total and an opposing role', () => {
  assert.equal(settingsError({ deputy: 1, outlaw: 1, renegade: 1 }, 4, 7), null);
  assert.equal(settingsError({ deputy: 0, outlaw: 0, renegade: 3 }, 4, 7), null);
  assert.match(settingsError({ deputy: 3, outlaw: 0, renegade: 0 }, 4, 7)!, /Tội phạm hoặc Kẻ phản bội/);
  for (const roles of [{ deputy: -1, outlaw: 3, renegade: 1 }, { deputy: 0.5, outlaw: 1.5, renegade: 1 }, { deputy: NaN, outlaw: 2, renegade: 1 }, { deputy: 1, outlaw: 2, renegade: 1 }]) assert.ok(settingsError(roles, 4, 7));
  for (const players of [0, 1, 3]) assert.ok(settingsError(standardRoles(players), players, 8));
  // Eight seats only fit when the room capacity allows it.
  assert.match(settingsError(standardRoles(8), 8, 7)!, /Cần 4–7/);
  assert.equal(settingsError(standardRoles(8), 8, 8), null);
  assert.ok(settingsError({ deputy: 2, outlaw: 3, renegade: 1 }, 8, 8));
});

test('the expansion catalog mirrors the Rust packs and drives capacity', async () => {
  const rust = await readFile(new URL('../../../../../crates/bang/src/model/expansion.rs', import.meta.url), 'utf8');
  const config = await readFile(new URL('../../../../../crates/bang/src/config.rs', import.meta.url), 'utf8');
  assert.equal(BASE_MAX_PLAYERS, Number(config.match(/\.fold\((\d+), usize::max\)/)![1]));
  assert.deepEqual(expansionPacks.map(pack => [pack.id, pack.maxPlayers]), [['dodge_city', Number(rust.match(/max_players: (\d+),\n\s+\},\n\s+\}/)![1])]]);
  assert.equal(maxPlayersFor([]), BASE_MAX_PLAYERS);
  assert.equal(maxPlayersFor(['dodge_city']), 8);
});
