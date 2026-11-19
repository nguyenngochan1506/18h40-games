import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerMessage } from '../../generated/protocol.ts';
import { demoGame, demoRoom } from './demo.ts';
import { initialGameState, receiveGame, selectGameView, inputLocked } from './state.ts';

const started: ServerMessage = { v: PROTOCOL_VERSION, type: 'game_started', seq: 0, seats: demoGame.seats, view: demoGame.view };
const initial = receiveGame(null, started)!;
const update = (seq: number): Extract<ServerMessage, { type: 'game_update' }> => ({ v: PROTOCOL_VERSION, type: 'game_update', seq, events: [], view: demoGame.view });

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
  const joined: ServerMessage = { v: PROTOCOL_VERSION, type: 'joined', room_code: 'ABCDE', room: demoRoom, token: 'secret', game: demoGame };
  assert.equal(receiveGame(initial, joined), demoGame);
  assert.equal(receiveGame(demoGame, { v: PROTOCOL_VERSION, type: 'room_state', room: demoRoom }), demoGame);
  assert.equal(receiveGame(demoGame, { v: PROTOCOL_VERSION, type: 'room_state', room: { ...demoRoom, phase: 'waiting' } }), null);
  assert.equal(receiveGame(demoGame, { ...joined, game: null }), null);
  assert.equal(receiveGame(demoGame, { v: PROTOCOL_VERSION, type: 'left' }), null);
});

test('seq gaps lock the board until an authoritative snapshot, while stale packets do not desync', async () => {
  const { receiveGameState, inputLocked } = await import('./state.ts');
  const state = { ...initialGameState, game: initial };
  assert.equal(receiveGameState(state, update(0)).desynced, false);
  const gap = receiveGameState(state, update(2));
  assert.equal(gap.game, initial);
  assert.equal(gap.desynced, true);
  assert.equal(inputLocked({ connected: true, pending: false, restoring: false, desynced: gap.desynced }), true);
  assert.equal(receiveGameState(gap, update(1)), gap);
  const restored = receiveGameState(gap, { v: PROTOCOL_VERSION, type: 'joined', room_code: 'ABCDE', room: demoRoom, token: 'secret', game: demoGame });
  assert.equal(restored.game, demoGame);
  assert.equal(restored.desynced, false);
});

test('input locks while disconnected, awaiting a barrier, restoring or desynced', () => {
  const ready = { connected: true, pending: false, restoring: false, desynced: false };
  assert.equal(inputLocked(ready), false);
  for (const change of [{ connected: false }, { pending: true }, { restoring: true }, { desynced: true }]) assert.equal(inputLocked({ ...ready, ...change }), true);
});

test('setup events seq0 are logged once, valid updates and game_over append, stale packets do not', async () => {
  const { receiveGameState } = await import('./state.ts');
  let state = receiveGameState(initialGameState, started);
  assert.equal(state.log.length, 0);
  const setup = { ...update(0), events: [{ type: 'game_started', sheriff: 0 }] } satisfies ServerMessage;
  state = receiveGameState(state, setup);
  assert.equal(state.log.length, 1);
  assert.equal(receiveGameState(state, setup), state);
  assert.equal(receiveGameState(state, started), state);
  state = receiveGameState(state, { ...update(1), events: [{ type: 'cards_drawn', player: 0, count: 2 }] });
  assert.equal(state.log.length, 2);
  assert.equal(receiveGameState(state, update(0)), state);
  assert.equal(receiveGameState(state, update(1)), state);
  state = receiveGameState(state, { ...update(2), type: 'game_over', events: [{ type: 'game_ended', winner: 'outlaws', roles: [] }] });
  assert.equal(state.log.at(-1)?.text, 'Tội phạm thắng.');
});

test('rejoin starts a bounded history without replay, preserves own nickname after elimination and clears on waiting/left', async () => {
  const { receiveGameState } = await import('./state.ts');
  let state = receiveGameState(initialGameState, started);
  state = receiveGameState(state, { ...update(1), events: Array.from({ length: 400 }, () => ({ type: 'cards_drawn' as const, player: 0, count: 1 })) });
  assert.equal(state.log.length, 300);
  assert.equal(state.log[0].id, 100);
  const gap = receiveGameState(state, update(3));
  assert.equal(gap.log, state.log);
  assert.equal(gap.desynced, true);
  const table = structuredClone(selectGameView(demoGame.view).table);
  table.players[0].alive = false;
  const deadGame = { ...demoGame, view: { perspective: 'spectator' as const, view: table } };
  const joined = { v: PROTOCOL_VERSION, type: 'joined', room_code: 'ABCDE', room: demoRoom, token: 'secret', game: deadGame } satisfies ServerMessage;
  state = receiveGameState(gap, joined);
  assert.equal(state.log.length, 1);
  assert.match(state.log[0].text, /Lịch sử trước đó không có/);
  assert.equal(state.viewer, 0);
  const joinedZero = receiveGameState(initialGameState, { ...joined, game: { ...deadGame, seq: 0 } });
  assert.equal(receiveGameState(joinedZero, { ...update(0), events: [{ type: 'game_started', sheriff: 0 }] }), joinedZero);
  state = receiveGameState(state, { ...update(18), view: deadGame.view, events: [{ type: 'health_changed', player: 0, source: null, delta: 1, health: 1 }] });
  assert.match(state.log.at(-1)!.text, /Hân \(bạn\)/);
  assert.equal(receiveGameState(state, { ...update(0), events: [{ type: 'cards_drawn', player: 0, count: 9 }] }).log.length, 2);
  assert.equal(receiveGameState(state, { v: PROTOCOL_VERSION, type: 'left' }).log.length, 0);
  assert.equal(receiveGameState(state, { v: PROTOCOL_VERSION, type: 'room_state', room: { ...demoRoom, phase: 'waiting' } }).log.length, 0);
});

test('blind store snapshots retain only slot counts and rejoin never replays a private reveal', async () => {
  const { receiveGameState } = await import('./state.ts');
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.table.store_slots = 3;
  game.view.view.table.waiting = { player: 0, pending_id: 104, kind: { type: 'general_store' } };
  game.view.view.choices = [];
  const joined = { v: PROTOCOL_VERSION, type: 'joined', room_code: 'ABCDE', room: demoRoom, token: 'secret', game } satisfies ServerMessage;
  const state = receiveGameState(initialGameState, joined);
  assert.equal(selectGameView(state.game!.view).table.store_slots, 3);
  assert.deepEqual(selectGameView(state.game!.view).choices, []);
  assert.equal(state.fxBatch, null); assert.equal(state.soundBatch, null);
  const own = receiveGameState(state, { v: PROTOCOL_VERSION, type: 'game_update', seq: game.seq + 1, view: game.view, events: [{ type: 'store_card_claimed', player: 0, slot: 1 }, { type: 'store_card_received', card: 37 }] });
  assert.ok(own.log.some(entry => entry.text.includes('Beer')));
  const other = receiveGameState(state, { v: PROTOCOL_VERSION, type: 'game_update', seq: game.seq + 1, view: game.view, events: [{ type: 'store_card_claimed', player: 1, slot: 1 }] });
  assert.ok(other.log.some(entry => entry.text === 'Minh chọn một lá General Store.'));
  assert.ok(other.log.every(entry => !entry.text.includes('Beer')));
  assert.equal(receiveGameState(own, joined).fxBatch, null);
});
