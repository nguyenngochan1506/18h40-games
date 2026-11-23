import assert from 'node:assert/strict';
import test from 'node:test';
import { PROTOCOL_VERSION } from '../generated/protocol.ts';
import type { RoomView, ServerMessage } from '../generated/protocol.ts';
import { consumeFrames, GAME_QUEUE_LIMIT, initialGameState, inputLocked, receiveGameState } from './gameSync.ts';

const room: RoomView = { code: 'ABCDE', game: 'uno', settings: { game: 'uno', payload: {} }, phase: 'playing', host: 'a', you: 'a', min_players: 2, max_players: 10, members: [] };
const start: ServerMessage = { v: PROTOCOL_VERSION, type: 'game_started', seq: 0, seats: [{ player_id: 0, member_id: 'a', nickname: 'A' }], view: { game: 'uno', payload: {} } };
const update = (seq: number): ServerMessage => ({ v: PROTOCOL_VERSION, type: 'game_update', seq, update: { game: 'uno', events: {}, view: {} } });
const joined: ServerMessage = { v: PROTOCOL_VERSION, type: 'joined', voice_enabled: false, room_code: room.code, token: 'test', room, game: null };

test('opaque sync preserves ordered early frames including setup seq0 until the module consumes them', () => {
  let state = receiveGameState(initialGameState, joined);
  state = receiveGameState(state, start);
  state = receiveGameState(state, update(0));
  state = receiveGameState(state, update(1));
  assert.equal(state.viewer, 0);
  assert.deepEqual(state.frames.map(frame => [frame.game.seq, frame.reset, frame.setup]), [[0, 'started', false], [0, null, true], [1, null, false]]);
  assert.equal(receiveGameState(state, update(0)), state);
  assert.equal(receiveGameState(state, update(1)), state);
  assert.equal(receiveGameState(state, start), state);
  const drained = consumeFrames(state, state.frames[1].id);
  assert.deepEqual(drained.frames.map(frame => frame.game.seq), [1]);
  assert.equal(drained.game, state.game);
  const gap = receiveGameState(drained, update(3));
  assert.equal(gap.desynced, true); assert.deepEqual(gap.frames, []);
  assert.equal(receiveGameState(gap, update(2)), gap);
  assert.equal(inputLocked({ connected: true, pending: false, restoring: false, desynced: gap.desynced }), true);
});

test('overflow drops old effects and locks for a fresh authoritative snapshot', () => {
  let state = receiveGameState(initialGameState, start);
  for (let seq = 0; seq < GAME_QUEUE_LIMIT; seq++) state = receiveGameState(state, update(seq));
  assert.equal(state.desynced, true);
  assert.deepEqual(state.frames, []);
  const restored = receiveGameState(state, { ...joined, game: { seq: 55, seats: start.seats, view: start.view } });
  assert.equal(restored.desynced, false); assert.equal(restored.game?.seq, 55);
  assert.equal(restored.frames.length, 1); assert.equal(restored.frames[0].reset, 'joined');
  assert.equal(restored.frames[0].update, null);
  assert.equal(receiveGameState(restored, update(55)), restored);
  assert.equal(receiveGameState(restored, { v: PROTOCOL_VERSION, type: 'left' }).game, null);
  assert.equal(receiveGameState(restored, { v: PROTOCOL_VERSION, type: 'room_state', room: { ...room, phase: 'waiting' } }).frames.length, 0);
});

test('a mismatched delta cannot switch the session game', () => {
  const state = receiveGameState(initialGameState, start);
  const wrong: ServerMessage = { v: PROTOCOL_VERSION, type: 'game_update', seq: 1, update: { game: 'werewolf', events: {}, view: {} } };
  const next = receiveGameState(state, wrong);
  assert.equal(next.game, state.game); assert.equal(next.desynced, true);
});
