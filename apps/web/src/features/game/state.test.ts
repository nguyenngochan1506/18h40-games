import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerMessage } from '../../generated/protocol.ts';
import { demoGame, demoRoom } from './demo.ts';
import { receiveGame, selectGameView } from './state.ts';

const started: ServerMessage = { v: 1, type: 'game_started', seq: 0, seats: demoGame.seats, view: demoGame.view };
const initial = receiveGame(null, started)!;
const update = (seq: number): Extract<ServerMessage, { type: 'game_update' }> => ({ v: 1, type: 'game_update', seq, events: [], view: demoGame.view });

test('view selection exposes hand/choices only for the living player perspective', () => {
  const own = selectGameView(demoGame.view);
  assert.equal(own.you, 0);
  assert.equal(own.hand.length, 5);
  const spectator = selectGameView({ perspective: 'spectator', view: own.table });
  assert.equal(spectator.you, null);
  assert.deepEqual(spectator.hand, []);
  assert.deepEqual(spectator.choices, []);
  const dead = structuredClone(demoGame.view);
  assert.equal(dead.perspective, 'player');
  if (dead.perspective === 'player') { dead.view.table.players[0].alive = false; dead.view.choices = [2, 3]; }
  const eliminated = selectGameView(dead);
  assert.equal(eliminated.you, null);
  assert.deepEqual(eliminated.hand, []);
  assert.deepEqual(eliminated.choices, []);
});

test('seq accepts the next snapshot and ignores duplicate setup, stale, backwards and skipped steps', () => {
  assert.equal(initial.seq, 0);
  assert.equal(receiveGame(initial, update(0)), initial);
  assert.equal(receiveGame(initial, update(2)), initial);
  assert.equal(receiveGame(null, update(1)), null);
  const next = receiveGame(initial, update(1))!;
  assert.equal(next.seq, 1);
  assert.equal(next.seats, initial.seats);
  assert.equal(receiveGame(next, update(0)), next);
  assert.equal(receiveGame(next, update(1)), next);
  assert.equal(receiveGame(next, started), next);
  assert.equal(receiveGame(next, update(3)), next);
  const over = receiveGame(next, { ...update(2), type: 'game_over' });
  assert.equal(over?.seq, 2);
});

test('authoritative joined snapshots resync any seq; waiting/left clear the board', () => {
  const joined: ServerMessage = { v: 1, type: 'joined', room_code: 'ABCDE', room: demoRoom, token: 'secret', game: demoGame };
  assert.equal(receiveGame(initial, joined), demoGame);
  assert.equal(receiveGame(demoGame, { v: 1, type: 'room_state', room: demoRoom }), demoGame);
  assert.equal(receiveGame(demoGame, { v: 1, type: 'room_state', room: { ...demoRoom, phase: 'waiting' } }), null);
  assert.equal(receiveGame(demoGame, { ...joined, game: null }), null);
  assert.equal(receiveGame(demoGame, { v: 1, type: 'left' }), null);
});
