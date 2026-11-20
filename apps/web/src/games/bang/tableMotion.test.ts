import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEAL_DURATION, DEAL_LIMIT, cardFlight, dealPlan, handPose, shouldDeal } from './tableMotion.ts';
import { demoEvents } from './demo/demoEvents.ts';

for (const count of [4, 5, 6, 7]) test(`deal ${count}: round-robin public seats, bounded duration and private faces`, () => {
  const players = Array.from({ length: count }, (_, id) => ({ id, max_health: id === 0 ? 5 : 4, hand_count: id === 0 ? 7 : 4 }));
  const hand = [1, 26, 37, 43];
  const plan = dealPlan(players, 1, hand);
  assert.deepEqual(plan.slice(0, count).map(flight => flight.player), players.map(player => player.id));
  assert.equal(plan.length, 5 + (count - 1) * 4);
  assert.ok(plan.length <= DEAL_LIMIT);
  assert.ok(plan.at(-1)!.delay + DEAL_DURATION < 2);
  assert.deepEqual(plan.filter(flight => flight.player === 1).map(flight => flight.card), hand);
  assert.ok(plan.filter(flight => flight.player !== 1).every(flight => flight.card === null));
  assert.ok(dealPlan(players, null, hand).every(flight => flight.card === null));
  assert.deepEqual(dealPlan(players.map(player => ({ ...player, hand_count: 0 })), 1, []), []);
});

test('only a fresh setup event deals; joined/rejoin, repeats, hidden, offline, reduced or own decision never do', () => {
  const state = { enabled: true, hidden: false, reduced: false, ownTurn: false };
  assert.equal(shouldDeal([demoEvents.game_started], null, 0, state), true);
  assert.equal(shouldDeal([demoEvents.game_started], 0, 0, state), false);
  assert.equal(shouldDeal(undefined, null, undefined, state), false);
  assert.equal(shouldDeal([demoEvents.turn_started], null, 1, state), false);
  for (const disabled of [{ enabled: false }, { hidden: true }, { reduced: true }, { ownTurn: true }]) assert.equal(shouldDeal([demoEvents.game_started], null, 0, { ...state, ...disabled }), false);
});

test('deal caps even excessive public counts, never invents a missing private face', () => {
  const players = Array.from({ length: 40 }, (_, id) => ({ id, max_health: 20, hand_count: 100 }));
  const plan = dealPlan(players, 0, []);
  assert.equal(plan.length, DEAL_LIMIT);
  assert.ok(plan.every(flight => flight.card === null));
});

test('hand stays straight, bounded and selection lifts above hover; reduced motion has no translation/scale', () => {
  for (const count of [1, 4, 7, 20]) for (let index = 0; index < count; index++) {
    const pose = handPose(index, count, false, false, false);
    const mirrored = handPose(count - index - 1, count, false, false, false);
    assert.equal(pose.rotate, 0); assert.equal(mirrored.rotate, 0);
    assert.ok(Math.abs(pose.rotate) <= 12);
    assert.ok(handPose(index, count, true, false, false).y < handPose(index, count, false, true, false).y);
    const reduced = handPose(index, count, true, true, true);
    assert.equal(reduced.y, 0); assert.equal(reduced.scale, 1);
  }
  assert.ok(cardFlight(true, false).y > 0);
  assert.ok(cardFlight(false, false).y < 0);
  assert.deepEqual(cardFlight(true, true), { x: 0, y: 0, rotate: 0 });
});
