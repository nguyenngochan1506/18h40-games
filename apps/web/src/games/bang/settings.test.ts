import assert from 'node:assert/strict';
import test from 'node:test';
import { roleTotal, settingsError, standardRoles } from './bangSettings.ts';

test('standard room roles follow each supported player count', () => {
  for (const [players, deputy, outlaw] of [[4, 0, 2], [5, 1, 2], [6, 1, 3], [7, 2, 3]]) {
    const roles = standardRoles(players);
    assert.deepEqual(roles, { deputy, outlaw, renegade: 1 });
    assert.equal(roleTotal(roles), players);
    assert.equal(settingsError(roles, players), null);
  }
  assert.deepEqual(standardRoles(1), standardRoles(4));
});

test('custom roles require the seat total and an opposing role', () => {
  assert.equal(settingsError({ deputy: 1, outlaw: 1, renegade: 1 }, 4), null);
  assert.equal(settingsError({ deputy: 0, outlaw: 0, renegade: 3 }, 4), null);
  assert.match(settingsError({ deputy: 3, outlaw: 0, renegade: 0 }, 4)!, /Tội phạm hoặc Kẻ phản bội/);
  for (const roles of [{ deputy: -1, outlaw: 3, renegade: 1 }, { deputy: 0.5, outlaw: 1.5, renegade: 1 }, { deputy: NaN, outlaw: 2, renegade: 1 }, { deputy: 1, outlaw: 2, renegade: 1 }]) assert.ok(settingsError(roles, 4));
  for (const players of [0, 1, 3, 8]) assert.ok(settingsError(standardRoles(players), players));
});
