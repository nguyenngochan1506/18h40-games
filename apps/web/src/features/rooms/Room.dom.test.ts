import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { act, createElement, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { createServer } from 'vite';
import type { GameClient, GameBoardProps } from '../../games/types.ts';
import type { RoomView, ServerMessage } from '../../generated/protocol.ts';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import { consumeFrames, initialGameState, receiveGameState } from '../../shared/gameSync.ts';
import type RoomComponent from './Room.tsx';

const dom = new Window({ url: 'http://localhost/' });
const previous = Object.getOwnPropertyDescriptors(globalThis);
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { registry } = await vite.ssrLoadModule('/src/games/registry.ts');
const Room: typeof RoomComponent = (await vite.ssrLoadModule('/src/features/rooms/Room.tsx')).default;
after(async () => {
  await vite.close(); await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});
const room: RoomView = { code: 'ABCDE', game: 'uno', settings: { game: 'uno', payload: {} }, phase: 'playing', host: 'a', you: 'a', min_players: 2, max_players: 10, members: [] };
const seats = [{ player_id: 0, member_id: 'a', nickname: 'A' }];
const start: ServerMessage = { v: PROTOCOL_VERSION, type: 'game_started', seq: 0, seats, view: { game: 'uno', payload: {} } };
const step = (seq: number): ServerMessage => ({ v: PROTOCOL_VERSION, type: 'game_update', seq, update: { game: 'uno', events: {}, view: {} } });
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); };

test('failed lazy load can retry and drains early start/setup/update frames exactly once in order', async t => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });
  const errors = t.mock.method(console, 'error');
  t.after(() => assert.equal(errors.mock.callCount(), 0, errors.mock.calls.map(call => String(call.arguments)).join('\n')));
  const oldEnabled = registry.uno.enabled; registry.uno.enabled = true; t.after(() => { registry.uno.enabled = oldEnabled; });
  const batches: [number, string | null, boolean][] = [];
  const Board: ComponentType<GameBoardProps> = props => {
    useEffect(() => {
      for (const frame of props.sync.frames) batches.push([frame.game.seq, frame.reset, frame.setup]);
      const last = props.sync.frames.at(-1); if (last) props.consume(last.id);
    }, [props.sync.frames]);
    return createElement('div', { 'data-test-board': '' }, `seq ${props.sync.game?.seq}`);
  };
  let resolveLoad!: (client: GameClient) => void;
  let calls = 0;
  t.mock.method(registry.uno, 'load', () => ++calls === 1 ? Promise.reject(new Error('Network')) : new Promise<GameClient>(resolve => { resolveLoad = resolve; }));
  let receive!: (message: ServerMessage) => void;
  let left = 0;
  function Harness() {
    const [sync, setSync] = useState(initialGameState);
    receive = message => setSync(current => receiveGameState(current, message));
    return createElement(Room, { room, sync, consume: through => setSync(current => consumeFrames(current, through)), disabled: false, fxEnabled: false, send: message => { if (message.type === 'leave_room') left++; } });
  }
  await act(async () => root.render(createElement(Harness))); await flush();
  assert.match(container.textContent!, /Không tải được/);
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Thử tải lại')!.click());
  await act(() => { receive(start); receive(step(0)); receive(step(1)); });
  assert.equal(container.querySelector('[data-test-board]'), null);
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Rời phòng')!.click());
  assert.equal(left, 1);
  await act(async () => resolveLoad({ Board, Settings: () => null })); await flush();
  assert.deepEqual(batches, [[0, 'started', false], [0, null, true], [1, null, false]]);
  assert.equal(container.querySelector('[data-test-board]')!.textContent, 'seq 1');
});

test('a late loader cannot mount a game after switching to an unsupported room', async t => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });
  const oldEnabled = registry.werewolf.enabled; registry.werewolf.enabled = true; t.after(() => { registry.werewolf.enabled = oldEnabled; });
  let resolveLoad!: (client: GameClient) => void;
  t.mock.method(registry.werewolf, 'load', () => new Promise<GameClient>(resolve => { resolveLoad = resolve; }));
  const props = { sync: initialGameState, consume() {}, disabled: false, fxEnabled: false, send() {} };
  await act(async () => root.render(createElement(Room, { ...props, room: { ...room, game: 'werewolf' } })));
  await act(async () => root.render(createElement(Room, { ...props, room: { ...room, code: 'FGHJK' } })));
  await act(async () => resolveLoad({ Board: () => createElement('div', { 'data-obsolete-board': '' }), Settings: () => null }));
  assert.equal(container.querySelector('[data-obsolete-board]'), null);
  assert.match(container.textContent!, /chưa được hỗ trợ/);
  assert.ok([...container.querySelectorAll('button')].some(button => button.textContent === 'Rời phòng'));
});
