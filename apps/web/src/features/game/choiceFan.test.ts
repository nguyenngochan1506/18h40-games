import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choiceFan, nextChoiceSlot, storeOwners } from './choiceFan.ts';

test('blind fans fit their container with at least 44px exposed, bounded angles and symmetric curves', () => {
  for (const [width, available] of [[64, 688], [96, 688], [50, 307], [56, 325], [56, 700]]) for (const count of [0, 1, 3, 7, 12]) {
    const rows = choiceFan(count, width, available);
    assert.equal(rows.flatMap(row => row.slots).length, count);
    if (available === 688 && count) assert.equal(rows.length, 1, 'Desktop uses one fan, including twelve cards');
    for (const row of rows) {
      assert.ok(row.width <= available + .01);
      if (row.slots.length > 1) assert.ok(row.step >= 44);
      for (const [index, slot] of row.slots.entries()) {
        const mirror = row.slots[row.slots.length - index - 1];
        assert.ok(Math.abs(slot.angle) <= 25);
        assert.equal(slot.angle, -mirror.angle || 0);
        assert.equal(slot.curve, mirror.curve);
        assert.ok(slot.left >= 0 && slot.left + width <= row.width);
      }
    }
  }
});

test('arrow navigation wraps only among available slots, with Home/End and no accidental confirmation', () => {
  assert.equal(nextChoiceSlot('ArrowLeft', 0, 12), 11);
  assert.equal(nextChoiceSlot('ArrowRight', 11, 12), 0);
  assert.equal(nextChoiceSlot('Home', 7, 12), 0);
  assert.equal(nextChoiceSlot('End', 2, 12), 11);
  for (const key of ['Enter', 'Escape', '3', ' ']) assert.equal(nextChoiceSlot(key, 0, 12), null);
  assert.equal(nextChoiceSlot('ArrowRight', 0, 0), null);
});

test('store claim markers preserve holes while server indices compact; snapshots never invent owners', () => {
  const start = storeOwners([], 4, [{ type: 'store_opened', count: 4 }]);
  const first = storeOwners(start, 3, [{ type: 'store_card_claimed', player: 2, slot: 1 }]);
  assert.deepEqual(first, [null, 2, null, null]);
  const second = storeOwners(first, 2, [{ type: 'store_card_claimed', player: 3, slot: 1 }]);
  assert.deepEqual(second, [null, 2, 3, null]);
  assert.deepEqual(start, [null, null, null, null]);
  assert.deepEqual(first, [null, 2, null, null]);
  assert.deepEqual(storeOwners(second, 3, []), [null, null, null]);
  assert.deepEqual(storeOwners([], 2, [{ type: 'store_card_claimed', player: 0, slot: 2 }]), [null, null, 0]);
  assert.deepEqual(storeOwners(second, 5, [{ type: 'store_opened', count: 5 }]), Array(5).fill(null));
});
