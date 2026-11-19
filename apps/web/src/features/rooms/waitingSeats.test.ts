import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Member, RoomView } from '../../generated/protocol.ts';
import { sceneSeats } from '../game/sceneSeats.ts';
import { waitingSeats } from './waitingSeats.ts';

const player = (id: string, online = true): Member => ({ id, nickname: `Cao bồi ${id}`, role: 'player', online });
const room = (members: Member[]): RoomView => ({ code: 'ABCDE', game: 'bang', phase: 'waiting', host: 'a', you: 'a', min_players: 4, max_players: 7, members });

for (const count of [1, 4, 7]) {
  test(`waiting room with ${count} players uses the seven painted chairs and server player IDs`, () => {
    const members = Array.from({ length: count }, (_, i) => player(String(i)));
    const seats = waitingSeats(room(members));
    assert.equal(seats.length, count);
    assert.deepEqual(seats.map(({ member }) => member), members);
    for (const [index, seat] of seats.entries()) {
      assert.deepEqual(seat.seat, sceneSeats[7][index]);
      assert.equal(seat.slot, index);
      assert.equal(seat.actor, `/scene/seat/cowboy-${'abcdef'[index % 6]}-${seat.seat.view}.webp`);
      assert.equal(seat.seat.flip, seat.seat.x > 50);
    }
  });
}

test('spectators never take a chair; offline players keep theirs and all viewers see the same arrangement', () => {
  const members: Member[] = [player('a'), { id: 's', nickname: 'Người xem', role: 'spectator', online: true }, player('b', false), player('c')];
  const state = room(members);
  const seats = waitingSeats(state);
  assert.deepEqual(seats.map(({ member }) => member.id), ['a', 'b', 'c']);
  assert.equal(seats[1].member.online, false);
  assert.equal(seats[1].slot, 1);
  assert.deepEqual(waitingSeats({ ...state, you: 's' }), seats);
  assert.deepEqual(waitingSeats({ ...state, you: 'b' }), seats);
  assert.deepEqual(state.members, members);
  assert.equal(waitingSeats(room([])).length, 0);
});

test('join, leave and take-seat follow the server membership order without exposing game data', () => {
  const a = player('a'), b = player('b'), c = player('c');
  assert.deepEqual(waitingSeats(room([a, b, c])).map(({ slot }) => slot), [0, 1, 2]);
  const afterLeave = waitingSeats(room([a, c]));
  assert.equal(afterLeave[1].member.id, 'c');
  assert.equal(afterLeave[1].actor, '/scene/seat/cowboy-b-q3back.webp');
  const takingSeat = waitingSeats(room([a, { ...b, role: 'spectator' }, c]));
  assert.equal(takingSeat.length, 2);
  assert.equal(waitingSeats(room([a, b, c]))[1].member.id, 'b');
  assert.deepEqual(Object.keys(afterLeave[0]).sort(), ['actor', 'member', 'seat', 'slot']);
});
