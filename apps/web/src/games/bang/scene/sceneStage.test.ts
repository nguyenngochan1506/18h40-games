import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneStage, tableCenterY } from './sceneStage.ts';
import { sceneSeatLayout, sceneSeats, sceneSeatGeometry } from './sceneSeats.ts';

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
    assert.equal(seats[0].y, 85);
    let previous = Math.PI / 2 - .01;
    for (const [i, seat] of seats.entries()) {
      for (const value of [seat.x, seat.y, seat.cardsX, seat.cardsY]) assert.ok(value >= 0 && value <= 100);
      assert.ok(seat.x >= 0 && seat.x <= 100 && seat.y <= 100 && seat.y >= seat.actorHeight * 100);
      assert.ok(seat.cardsX >= 8 && seat.cardsX <= 92 && seat.cardsY >= 18 && seat.cardsY <= 85);
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
      assert.equal(seat.view, mirror.view);
      assert.equal(seat.flip, seat.x > 50);
      if (seat.x !== 50) {
        assert.notEqual(seat.flip, mirror.flip);
        assert.equal(seat.handX + mirror.handX, 1);
        assert.equal(seat.faceX + mirror.faceX, 1);
      }
    }
  });
  test(`painted scene ${count}: every viewer rotates to the front; spectators use all chairs`, () => {
    for (let viewer = 0; viewer < count; viewer++) {
      const mapped = sceneSeatLayout(count, viewer);
      assert.equal(mapped[viewer].slot, 0);
      assert.equal(mapped[viewer].cardsY, sceneSeats[count][0].cardsY);
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


test('each painted chair uses an inward view, including side chairs in four and six seats', () => {
  const expected = {
    4: ['q3back', 'side', 'front', 'side'],
    5: ['q3back', 'side', 'q3front', 'q3front', 'side'],
    6: ['q3back', 'q3back', 'side', 'front', 'side', 'q3back'],
    7: ['q3back', 'q3back', 'side', 'q3front', 'q3front', 'side', 'q3back'],
  };
  for (const count of [4, 5, 6, 7] as const) {
    assert.deepEqual(sceneSeats[count].map(seat => seat.view), expected[count]);
    for (const seat of sceneSeats[count]) {
      assert.ok(seat.faceY < seat.handY && seat.handY < 1);
      assert.ok(seat.flip ? seat.handX < seat.faceX : seat.handX >= seat.faceX);
    }
  }
});


test('near-side ribbons in six and seven seats leave the central hand tray clear', () => {
  for (const count of [6, 7] as const) {
    for (const seat of sceneSeats[count].filter(seat => seat.near)) {
      const halfWidth = 12 * seat.depth / 2;
      assert.ok(seat.cardsX + halfWidth < 33 || seat.cardsX - halfWidth > 67);
      assert.ok(seat.cardsX - halfWidth >= 3 && seat.cardsX + halfWidth <= 97, 'Near racks keep a scene-edge margin');
      assert.ok(seat.cardsX >= 13 && seat.cardsX <= 87, 'Near racks move inward with their ribbons');
    }
  }
});


test('draw/discard center follows the free space between upper racks and the own tray', () => {
  for (const height of [635, 642, 657, 720, 950, 1080]) {
    const upper = height * .4, lower = height * .7;
    const center = tableCenterY(height, upper, lower);
    assert.ok(center > upper && center < lower);
    assert.ok(tableCenterY(height, upper, lower + 30) > center, 'A smaller tray leaves more room below');
    assert.ok(tableCenterY(height, upper + 20, lower) > center, 'Taller upper equipment moves the center down');
  }
});

test('opponent badges stay on the torso below the face at every supported scene height', () => {
  for (const count of [4, 5, 6, 7] as const) for (const height of [635, 657, 685, 720, 1080]) {
    for (const seat of sceneSeats[count].slice(1)) {
      const geometry = sceneSeatGeometry(seat, height);
      const lift = height * seat.y / 100 - geometry.actorY;
      assert.ok(lift >= height * .0149 && lift <= height * .0151, 'Chairs move up gently together');
      assert.ok(Math.abs(height * seat.cardsY / 100 - geometry.badgeY - lift) < .01, 'Badges follow their actors');
      const actorTop = geometry.actorY - height * seat.actorHeight;
      const face = actorTop + height * seat.actorHeight * seat.faceY;
      assert.ok(geometry.badgeY - 26 >= face + height * seat.actorHeight * .1 - .1, 'Badge clears the face');
      assert.ok(geometry.badgeY + 26 <= geometry.actorY + 1, 'Badge stays over the torso');
    }
  }
});
