import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardCatalog } from './cardCatalog.ts';
import { equipmentFan, equipmentLabel, equipmentPose, jailTurnsLabel, orderedEquipment, ownEquipmentWidth, handCardWidth } from './equipment.ts';

const id = (kind: string) => cardCatalog.findIndex(card => card.kind === kind);
const list = ['jail', 'mustang', 'barrel', 'winchester', 'dynamite', 'scope', 'volcanic'].map(id);

test('equipment groups are stable, immutable and end with Dynamite then Jail', () => {
  const before = [...list];
  assert.deepEqual(orderedEquipment(list), ['winchester', 'volcanic', 'barrel', 'mustang', 'scope', 'dynamite', 'jail'].map(id));
  assert.deepEqual(list, before);
  assert.deepEqual(orderedEquipment([255, id('barrel')]), [id('barrel'), 255]);
});

test('range captions use the authoritative server range, including no weapon and multiple weapons', () => {
  for (const weapon_range of [1, 2, 5]) {
    assert.equal(equipmentLabel({ weapon_range }), `Tầm ${weapon_range}`);
    assert.equal(equipmentLabel({ weapon_range }, true), `Trước mặt bạn · Tầm bắn ${weapon_range}`);
  }
});

test('Jail chips distinguish absent metadata from zero turns without inventing Classic counters', () => {
  assert.equal(jailTurnsLabel({}, id('jail')), null);
  assert.equal(jailTurnsLabel({ jail_turns_left: 2 }, id('barrel')), null);
  assert.equal(jailTurnsLabel({ jail_turns_left: 2 }, id('jail')), 'Jail: còn 2 lượt');
  assert.match(jailTurnsLabel({ jail_turns_left: 0 }, id('jail'))!, /đã chờ đủ 3 lượt/);
});

test('fans retain the approved step when possible, compress crowded seats and keep every card the same size', () => {
  for (const scene of [1280, 1920]) for (const count of [0, 1, 3, 5, 8, 10]) {
    const width = Math.max(44, scene * .032), available = scene * .12;
    const cards = Array.from({ length: count }, (_, i) => list[i % list.length]);
    const fan = equipmentFan(cards, width, available, scene);
    assert.ok(fan.width <= available + 1e-8);
    assert.equal(fan.slots.length, count);
    if (!count) assert.equal(fan.height, 0, 'Empty seats keep their range chip next to the badge');
    assert.ok(fan.step <= width * 2 / 3.5 + 1e-8);
    if (count === 3) assert.ok(Math.abs(fan.step - width * 2 / 3.5) < 1e-8);
    if (count >= 8) assert.ok(fan.step < width * .5);
    fan.slots.forEach((slot, i) => {
      assert.ok(slot.left >= 0 && slot.left + width <= fan.width + 1e-8);
      assert.equal(slot.rotate, -fan.slots[count - i - 1].rotate || 0);
      assert.equal(slot.curve, fan.slots[count - i - 1].curve);
      assert.deepEqual(equipmentPose(slot, true, false), { rotate: 0, y: -scene * .014, scale: 1.35 });
      assert.deepEqual(equipmentPose(slot, true, true), { rotate: slot.rotate, y: slot.curve, scale: 1 });
    });
    const own = equipmentFan(cards, scene * .032 * 1.12, scene * .48 - 32, scene, true);
    assert.ok(own.slots.every(slot => slot.rotate === 0 && slot.curve === 0));
  }
});


test('own tray card sizes follow both viewport dimensions and fit within 26% height', () => {
  for (const [width, height, expected] of [[1250, 600, 51], [1284, 642, 54.57], [1366, 657, 55.845], [1280, 720, 56], [1877, 950, 80.75], [1920, 950, 80.75], [1920, 1080, 84]]) {
    const hand = handCardWidth(width, height), own = ownEquipmentWidth(width, height);
    assert.ok(Math.abs(hand - expected) < 1e-6);
    assert.ok(hand <= height * .085 && own < hand);
    assert.ok(hand * 2.4896 + 28 <= height * .26);
    assert.equal(own, hand * .6);
  }
});
