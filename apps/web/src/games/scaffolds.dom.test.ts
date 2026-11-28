import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import type { GameClient, GameInfo } from './types.ts';
import type { GameKind, GameSettings, RoomView } from '../generated/protocol.ts';
import { initialGameState } from '../shared/gameSync.ts';

const dom = new Window({ url: 'http://localhost/' });
const previous = Object.getOwnPropertyDescriptors(globalThis);
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const loaded = await vite.ssrLoadModule('/src/games/registry.ts');
const registry: Record<GameKind, GameInfo> = loaded.registry;
const loadGame: (game: GameKind) => Promise<GameClient> = loaded.loadGame;
after(async () => {
  await vite.close(); await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

for (const [id, name] of [['uno', 'UNO']] as const) test(`${name} stays disabled while its direct loader and placeholders are ready for implementation`, async t => {
  const info = registry[id];
  assert.equal(info.enabled, false); assert.equal(info.status, 'soon');
  await assert.rejects(loadGame(id), /chưa được hỗ trợ/);
  const client = await info.load();
  assert.equal(typeof client.Board, 'function'); assert.equal(typeof client.Settings, 'function');
  const entry = await vite.ssrLoadModule(`/src/games/${id}/index.ts`);
  assert.equal(entry.client, client, 'The public entry exports the same GameClient as info.load');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const errors = t.mock.method(console, 'error'), warnings = t.mock.method(console, 'warn');
  t.after(async () => {
    await act(() => root.unmount()); container.remove();
    assert.equal(errors.mock.callCount(), 0, errors.mock.calls.map(call => String(call.arguments)).join('\n'));
    assert.equal(warnings.mock.callCount(), 0, warnings.mock.calls.map(call => String(call.arguments)).join('\n'));
  });
  const settings: GameSettings = { game: 'uno', payload: {} };
  const room: RoomView = { code: 'ABCDE', game: id, settings, phase: 'playing', host: 'a', you: 'a', min_players: info.limits![0], max_players: info.limits![1], members: [] };
  const leaveRoom = t.mock.fn();
  await act(async () => root.render(createElement(client.Board, { room, sync: initialGameState, disabled: false, pending: false, requestVersion: 0, actionError: null, actionErrorCode: null, fxEnabled: false, roomMenu: null, consume() {}, sendAction() {}, endGame() {}, hostSkip() {}, leaveRoom })));
  const board = container.querySelector(`section.game-${id}[aria-label="Bàn ${name}"]`);
  assert.ok(board); assert.match(board.querySelector('[role="status"]')!.textContent!, /Game đang được xây dựng/);
  const leave = board.querySelector<HTMLButtonElement>('button')!;
  assert.equal(leave.type, 'button'); assert.equal(leave.disabled, false); assert.equal(leave.textContent, 'Rời phòng');
  await act(() => leave.click()); assert.equal(leaveRoom.mock.callCount(), 1);
  const onChange = t.mock.fn();
  await act(async () => root.render(createElement(client.Settings, { settings, players: room.min_players, maxPlayers: room.max_players, editable: true, onChange })));
  assert.ok(container.querySelector(`section.game-${id}[aria-label="Cài đặt ${name}"]`));
  assert.match(container.querySelector('[role="status"]')!.textContent!, /Game đang được xây dựng/);
  assert.equal(container.querySelector('[role="alert"]'), null); assert.equal(onChange.mock.callCount(), 0);
  await act(async () => root.render(createElement(client.Settings, { settings: { game: 'bang', payload: { mode: 'classic', roles: { deputy: 0, outlaw: 2, renegade: 1 }, expansions: [] } }, players: room.min_players, maxPlayers: room.max_players, editable: false, onChange })));
  assert.match(container.querySelector('[role="alert"]')!.textContent!, new RegExp(`không thuộc ${name}`));
  await assert.rejects(loadGame(id), /chưa được hỗ trợ/, 'Direct preview must not enable room loading');
});
