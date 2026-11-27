import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Member, RoomView } from '../../generated/protocol.ts';
import { waitingSeats } from './waitingSeats.ts';

const player = (id: string, online = true): Member => ({ id, nickname: `Cao bồi ${id}`, role: 'player', online });
const room = (members: Member[]): RoomView => ({ code: 'ABCDE', game: 'bang', settings: { game: 'bang', payload: { mode: 'classic', roles: { deputy: 0, outlaw: 2, renegade: 1 }, expansions: [] } }, phase: 'waiting', host: 'a', you: 'a', min_players: 4, max_players: 7, members });

// Independent fixture from the seven painted chair positions before the module move.
const paintedChairs = [
  { x: 50, y: 85, actorHeight: .30, view: 'q3back', flip: false },
  { x: 19, y: 79, actorHeight: .30, view: 'q3back', flip: false },
  { x: 14, y: 52, actorHeight: .28, view: 'side', flip: false },
  { x: 29, y: 34, actorHeight: .24, view: 'q3front', flip: false },
  { x: 71, y: 34, actorHeight: .24, view: 'q3front', flip: true },
  { x: 86, y: 52, actorHeight: .28, view: 'side', flip: true },
  { x: 81, y: 79, actorHeight: .30, view: 'q3back', flip: true },
];

for (const count of [1, 4, 7]) {
  test(`waiting room with ${count} players uses the seven painted chairs and server player IDs`, () => {
    const members = Array.from({ length: count }, (_, i) => player(String(i)));
    const seats = waitingSeats(room(members));
    assert.equal(seats.length, count);
    assert.deepEqual(seats.map(({ member }) => member), members);
    for (const [index, seat] of seats.entries()) {
      assert.deepEqual(seat.seat, paintedChairs[index]);
      assert.equal(seat.slot, index);
      assert.equal(seat.actor, `/platform/seat/cowboy-${'abcdef'[index % 6]}-${paintedChairs[index].view}.webp`);
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
  assert.equal(afterLeave[1].actor, '/platform/seat/cowboy-b-q3back.webp');
  const takingSeat = waitingSeats(room([a, { ...b, role: 'spectator' }, c]));
  assert.equal(takingSeat.length, 2);
  assert.equal(waitingSeats(room([a, b, c]))[1].member.id, 'b');
  assert.deepEqual(Object.keys(afterLeave[0]).sort(), ['actor', 'member', 'seat', 'slot']);
});

test('the platform waiting skin supports capacities above seven without game geometry', () => {
  const state = { ...room(Array.from({ length: 16 }, (_, i) => player(String(i)))), game: 'werewolf' as const, settings: { game: 'werewolf' as const, payload: {} }, min_players: 5, max_players: 16 };
  const seats = waitingSeats(state);
  assert.equal(seats.length, 16);
  for (const { seat, actor } of seats) {
    assert.ok(Number.isFinite(seat.x) && seat.x >= 0 && seat.x <= 100);
    assert.ok(Number.isFinite(seat.y) && seat.y >= 0 && seat.y <= 100);
    assert.match(actor, /^\/platform\/seat\//);
  }
});

test('an eight-seat expansion room keeps the seven painted chairs and adds the top-centre chair from the server capacity', () => {
  const members = Array.from({ length: 8 }, (_, i) => player(String(i)));
  const seats = waitingSeats({ ...room(members), max_players: 8 });
  assert.equal(seats.length, 8);
  assert.deepEqual(seats.map(({ seat }) => [seat.x, seat.y]), [[50, 85], [19, 79], [14, 52], [26, 35], [50, 27], [74, 35], [86, 52], [81, 79]]);
  assert.equal(new Set(seats.map(({ seat }) => `${seat.x},${seat.y}`)).size, 8);
  // Seven players in an eight-seat room still use their own chairs, so nobody moves when the eighth joins.
  assert.deepEqual(waitingSeats({ ...room(members.slice(0, 7)), max_players: 8 }).map(({ seat }) => seat.x), seats.slice(0, 7).map(({ seat }) => seat.x));
});
