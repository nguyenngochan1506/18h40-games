import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seatLayout } from './layout.ts';

for (let count = 4; count <= 8; count++) {
  test(`ellipse ${count}: every viewer stays at the bottom, clockwise order and inward angles remain stable`, () => {
    for (let viewer = 0; viewer < count; viewer++) {
      const seats = seatLayout(count, viewer);
      assert.equal(seats.length, count);
      assert.ok(Math.abs(seats[viewer].x - 50) < 1e-8);
      assert.equal(seats[viewer].y, 88);
      assert.equal(seats[viewer].portraitY, 88);
      assert.equal(seats[viewer].angle, 0);
      assert.equal(seats[viewer].landscapeY, 96);
      for (let step = 0; step < count; step++) {
        const seat = seats[(viewer + step) % count];
        const expected = Math.PI / 2 + step * 2 * Math.PI / count;
        assert.ok(Math.abs((seat.x - 50) / 36 - Math.cos(expected)) < 1e-8);
        assert.ok(Math.abs((seat.y - 50) / 38 - Math.sin(expected)) < 1e-8);
        assert.ok(Math.abs((seat.portraitX - 50) / (count === 6 || count === 8 ? 35 : 32) - Math.cos(expected)) < 1e-8);
        assert.ok(Math.abs((seat.portraitY - 50) / 38 - Math.sin(expected)) < 1e-8);
        assert.ok(Math.abs((seat.landscapeY - 50) / 46 - Math.sin(expected)) < 1e-8);
        assert.ok(seat.x >= 14 && seat.x <= 86 && seat.y >= 12 && seat.y <= 88);
        assert.ok(Math.abs(Math.sin(seat.angle * Math.PI / 180) + Math.cos(expected)) < 1e-8);
        assert.ok(Math.abs(Math.cos(seat.angle * Math.PI / 180) - Math.sin(expected)) < 1e-8);
      }
    }
  });
  test(`ellipse ${count}: spectator uses evenly spaced seats without reserving a private seat`, () => {
    const seats = seatLayout(count, null);
    assert.deepEqual(seats, seatLayout(count, 0));
    assert.equal(new Set(seats.map(seat => `${seat.x},${seat.y}`)).size, count);
  });
}
test('ellipse rejects unsupported counts and invalid viewer indices', () => {
  for (const count of [0, 3, 9, 4.5]) assert.throws(() => seatLayout(count, null), RangeError);
  for (const viewer of [-1, 4, 0.5]) assert.throws(() => seatLayout(4, viewer), RangeError);
});
