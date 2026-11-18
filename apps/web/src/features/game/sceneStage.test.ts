import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneStage } from './sceneStage.ts';
import { sceneSeatLayout, sceneSeats } from './sceneSeats.ts';

test('desktop scene letterboxes a 16:9 stage and leaves narrow layouts unchanged', () => {
  assert.equal(sceneStage(899, 1000), null);
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [900, 900], [1600, 720]]) {
    const stage = sceneStage(width, height)!;
    assert.ok(Math.abs(stage.width / stage.height - 16 / 9) < 1e-9);
    assert.ok(stage.left >= 0 && stage.top >= 0);
    assert.ok(stage.width <= width && stage.height <= height);
    assert.ok(Math.abs(stage.left * 2 + stage.width - width) < 1e-8);
    assert.ok(Math.abs(stage.top * 2 + stage.height - height) < 1e-8);
  }
  for (const dimensions of [[0, 720], [1280, -1], [NaN, 720], [Infinity, 720]]) assert.throws(() => sceneStage(...dimensions as [number, number]), RangeError);
});

for (const count of [4, 5, 6, 7] as const) {
  test(`painted scene ${count}: measured chairs, symmetric cards, clockwise order and depth`, () => {
    const seats = sceneSeats[count];
    assert.equal(seats.length, count);
    assert.equal(seats[0].x, 50);
    assert.equal(seats[0].y, 89);
    let previous = Math.PI / 2 - .01;
    for (const [i, seat] of seats.entries()) {
      for (const value of [seat.x, seat.y, seat.cardsX, seat.cardsY]) assert.ok(value >= 0 && value <= 100);
      assert.ok(seat.x >= 0 && seat.x <= 100 && seat.y <= 100 && seat.y >= seat.actorHeight * 100);
      assert.ok(seat.cardsX >= 20 && seat.cardsX <= 80 && seat.cardsY >= 30 && seat.cardsY <= 85);
      assert.ok(seat.actorHeight >= .22 && seat.actorHeight <= .30);
      assert.ok(seat.depth <= seats[0].depth);
      let angle = Math.atan2(seat.y - 50, seat.x - 50);
      while (angle < Math.PI / 2 - .01) angle += Math.PI * 2;
      assert.ok(angle > previous);
      previous = angle;
      const mirror = seats[(count - i) % count];
      assert.ok(Math.abs(seat.x + mirror.x - 100) < .01);
      assert.ok(Math.abs(seat.y - mirror.y) < .01);
      assert.equal(seat.cardsX + mirror.cardsX, 100);
      assert.equal(seat.cardsY, mirror.cardsY);
      assert.equal(seat.angle, -mirror.angle || 0);
    }
  });
  test(`painted scene ${count}: every viewer rotates to the front; spectators use all chairs`, () => {
    for (let viewer = 0; viewer < count; viewer++) {
      const mapped = sceneSeatLayout(count, viewer);
      assert.equal(mapped[viewer].slot, 0);
      assert.equal(mapped[viewer].cardsY, 70);
      for (let step = 0; step < count; step++) assert.equal(mapped[(viewer + step) % count].slot, step);
    }
    const spectator = sceneSeatLayout(count, null);
    assert.deepEqual(spectator.map(({ slot, ...seat }) => seat), sceneSeats[count]);
  });
}

test('painted scene rejects unsupported counts and viewer indices', () => {
  for (const count of [3, 8, 4.5]) assert.throws(() => sceneSeatLayout(count, null), RangeError);
  for (const viewer of [-1, 4, .5]) assert.throws(() => sceneSeatLayout(4, viewer), RangeError);
});
