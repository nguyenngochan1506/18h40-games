import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement, useRef, useState } from 'react';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import type { ClientMessage } from '../../generated/protocol.ts';
import type LobbyComponent from './Lobby.tsx';
import type RoomComponent from '../rooms/Room.tsx';
import type { GameClient } from '../../games/types.ts';
import type { RoomView } from '../../generated/protocol.ts';
import { initialGameState, receiveGameState, consumeFrames } from '../../shared/gameSync.ts';
import { demoGame, demoRoom } from '../../testFixtures.ts';

const dom = new Window({ url: 'http://localhost/', width: 1280, height: 720, settings: { enableImageFileLoading: false, enableCSSFileLoading: false, disableJavaScriptFileLoading: true } });
Reflect.deleteProperty(dom.Element.prototype, 'animate');
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, Image: dom.Image, Event: dom.Event, MouseEvent: dom.MouseEvent, getComputedStyle: dom.getComputedStyle.bind(dom), matchMedia: dom.matchMedia.bind(dom), requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16), cancelAnimationFrame: (id: number) => clearTimeout(id), IS_REACT_ACT_ENVIRONMENT: true };
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
let Lobby: typeof LobbyComponent, ShellRoom: typeof RoomComponent, WaitingSettings: GameClient['Settings'];
try {
  const { registry } = await vite.ssrLoadModule('/src/games/registry.ts');
  WaitingSettings = (await registry.bang.load()).Settings;
  Lobby = (await vite.ssrLoadModule('/src/features/lobby/Lobby.tsx')).default;
  ShellRoom = (await vite.ssrLoadModule('/src/features/rooms/Room.tsx')).default;
} catch (error) { await vite.close(); throw error; }
after(async () => {
  await vite.close(); await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

// Drive the shell with authoritative snapshots while keeping DOM scenarios readable.
type RoomProps = { room: RoomView; game: typeof demoGame | null; disabled: boolean; fxEnabled: boolean; viewer: number; log: unknown[]; fxBatch: null; soundBatch: null; send: (message: ClientMessage) => void };
function Room(props: RoomProps) {
  const snapshot = () => receiveGameState(initialGameState, { v: PROTOCOL_VERSION, type: 'joined', voice_enabled: false, room_code: props.room.code, token: 'test', room: props.room, game: props.game ? { ...props.game, view: { game: 'bang', payload: props.game.view } } : null });
  const [sync, setSync] = useState(snapshot);
  const previous = useRef({ game: props.game, phase: props.room.phase });
  if (previous.current.game !== props.game || previous.current.phase !== props.room.phase) {
    previous.current = { game: props.game, phase: props.room.phase };
    setSync({ ...snapshot(), generation: sync.generation + 1 });
  }
  return createElement(ShellRoom, { room: props.room, sync, consume: through => setSync(current => consumeFrames(current, through)), disabled: props.disabled, fxEnabled: props.fxEnabled, send: props.send });
}

async function mount(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  t.mock.method(dom.HTMLImageElement.prototype, 'decode', async () => {});
  const errors = t.mock.method(console, 'error'), warnings = t.mock.method(console, 'warn');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); assert.equal(errors.mock.callCount(), 0, errors.mock.calls.map(call => String(call.arguments)).join('\n')); assert.equal(warnings.mock.callCount(), 0, warnings.mock.calls.map(call => String(call.arguments)).join('\n')); });
  const sent: ClientMessage[] = [];
  const render = async (disabled = false) => { await act(async () => root.render(createElement(Lobby, { disabled, send: message => sent.push(message) }))); };
  const fill = async (selector: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  return { container, root, sent, render, fill };
}

test('lobby requires an explicit available game and never submits upcoming games', async t => {
  const { container, sent, render, fill } = await mount(t); await render();
  const create = container.querySelector<HTMLButtonElement>('.create-poster button[type="submit"]')!;
  const bang = container.querySelector<HTMLButtonElement>('[data-game-id="bang"]')!;
  await fill('#nickname', 'Hân');
  assert.equal(create.disabled, true);
  for (const id of ['uno', 'werewolf']) {
    const button = container.querySelector<HTMLButtonElement>(`[data-game-id="${id}"]`)!;
    assert.equal(button.disabled, true); assert.equal(button.getAttribute('aria-disabled'), 'true');
    assert.match(button.textContent!, /Sắp có/); await act(() => button.click());
  }
  assert.equal(bang.getAttribute('aria-pressed'), 'false');
  assert.equal(sent.length, 0);
  await act(() => bang.click());
  assert.equal(bang.getAttribute('aria-pressed'), 'true'); assert.equal(create.disabled, false);
  await act(() => create.click());
  assert.deepEqual([...sent], [{ v: PROTOCOL_VERSION, type: 'create_room', nickname: 'Hân', game: 'bang' }]);
  await render(true);
  assert.equal(bang.disabled, true); assert.equal(create.disabled, true);
});

test('joining by code works without selecting a game', async t => {
  const { container, sent, render, fill } = await mount(t); await render();
  await fill('#join-nickname', 'Mai'); await fill('#room-code', 'abcde');
  await act(() => container.querySelector<HTMLButtonElement>('.join-poster button[type="submit"]')!.click());
  assert.deepEqual([...sent], [{ v: PROTOCOL_VERSION, type: 'join_room', nickname: 'Mai', room_code: 'ABCDE' }]);
});

test('a BANG room renders its mapped board and catalog name in the waiting room', async t => {
  const { container, root } = await mount(t);
  const props = { room: demoRoom, game: demoGame, log: [], fxBatch: null, soundBatch: null, fxEnabled: false, viewer: 0, disabled: false, send() {} };
  await act(async () => root.render(createElement(Room, props)));
  assert.ok(container.querySelector('.bang-board'));
  assert.match(container.querySelector('.bang-board')!.getAttribute('aria-label')!, /BANG!/);
  await act(async () => root.render(createElement(Room, { ...props, room: { ...demoRoom, phase: 'waiting' }, game: null })));
  assert.ok(container.querySelector('.saloon-waiting'));
  assert.match(container.querySelector('.waiting-table-note')!.textContent!, /BANG!.*4–7/s);
});

test('returning to the lobby from the result explicitly leaves the room', async t => {
  const { container, root, sent } = await mount(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective === 'player') game.view.view.table.winner = 'outlaws';
  await act(async () => root.render(createElement(Room, { room: { ...demoRoom, phase: 'playing' }, game, log: [], fxBatch: null, soundBatch: null, fxEnabled: false, viewer: 0, disabled: false, send: message => sent.push(message) })));
  // Module BANG! tải lazy: đợi tối đa 10 giây theo đồng hồ thật (Date/setTimeout đang bị mock; runner CI chậm hơn máy dev).
  for (const start = process.hrtime.bigint(); process.hrtime.bigint() - start < 10_000_000_000n && !container.querySelector('.game-result');) await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  const leave = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Về sảnh');
  assert.ok(leave); await act(() => leave.click());
  assert.deepEqual(sent, [{ v: PROTOCOL_VERSION, type: 'leave_room' }]);
});

test('room settings edit a draft, validate totals and send the selected mode with custom roles', async t => {
  const { container, root, sent, fill } = await mount(t);
  const settings = { mode: 'classic' as const, roles: { deputy: 0, outlaw: 2, renegade: 1 }, expansions: [] };
  await act(async () => root.render(createElement(WaitingSettings, { settings: { game: 'bang', payload: settings }, players: 4, editable: true, onChange: settings => sent.push({ v: PROTOCOL_VERSION, type: 'update_settings', settings }) })));
  const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label)!;
  await act(() => button('Tăng Phó cảnh sát').click());
  await act(() => button('Áp dụng cài đặt').click());
  assert.equal(sent.length, 0);
  assert.match(container.querySelector('[role="alert"]')!.textContent!, /Điều chỉnh tổng số vai/);
  await act(() => button('Giảm Tội phạm').click());
  assert.equal(container.querySelector('[role="alert"]'), null);
  await act(() => container.querySelector<HTMLInputElement>('input[value="club"]')!.click());
  await act(() => button('Áp dụng cài đặt').click());
  assert.deepEqual([...sent], [{ v: PROTOCOL_VERSION, type: 'update_settings', settings: { game: 'bang', payload: { mode: 'club', roles: { deputy: 1, outlaw: 1, renegade: 1 }, expansions: [] } } }]);
  await act(() => button('Về mặc định').click());
  assert.equal(container.querySelector<HTMLInputElement>('#role-deputy')!.value, '0');
  assert.equal(container.querySelector<HTMLInputElement>('input[value="club"]')!.checked, true);
  await act(() => button('Áp dụng cài đặt').click());
  assert.deepEqual(sent.at(-1), { v: PROTOCOL_VERSION, type: 'update_settings', settings: { game: 'bang', payload: { mode: 'club', roles: settings.roles, expansions: [] } } });
  await fill('#role-deputy', '');
  await act(() => button('Áp dụng cài đặt').click());
  assert.match(container.querySelector('[role="alert"]')!.textContent!, /0 đến 6/);
  await act(() => button('Tăng Phó cảnh sát').click());
  assert.equal(container.querySelector<HTMLInputElement>('#role-deputy')!.value, '1');
  assert.equal(container.querySelector('[role="alert"]'), null);
});

test('room settings are read-only to guests and reset a host draft on a seat-count snapshot', async t => {
  const { container, root, sent } = await mount(t);
  const room = { ...demoRoom, phase: 'waiting' as const, members: demoRoom.members.slice(0, 4), settings: { game: 'bang' as const, payload: { mode: 'classic' as const, roles: { deputy: 0, outlaw: 2, renegade: 1 }, expansions: [] } } };
  const props = { room, game: null, log: [], fxBatch: null, soundBatch: null, fxEnabled: false, viewer: 0, disabled: false, send: (message: ClientMessage) => sent.push(message) };
  await act(async () => root.render(createElement(Room, props)));
  await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Tăng Phó cảnh sát"]')!.click());
  assert.equal(container.querySelector<HTMLInputElement>('#role-deputy')!.value, '1');
  await act(async () => root.render(createElement(Room, { ...props, room: { ...room, members: demoRoom.members, settings: demoRoom.settings } })));
  assert.equal(container.querySelector<HTMLInputElement>('#role-outlaw')!.value, '2');
  assert.match(container.querySelector('#role-total')!.textContent!, /5\/5 người · Hợp lệ/);
  await act(async () => root.render(createElement(Room, { ...props, room: { ...room, you: '2' } })));
  assert.equal(container.querySelectorAll('.room-settings fieldset:disabled').length, 2);
  assert.equal(container.querySelector('.room-settings button[type="submit"]'), null);
  assert.equal(sent.length, 0);
});


test('BANG HUD lists stacked weapons and displays the server-supplied maximum range', async t => {
  const { container, root } = await mount(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Expected player view');
  game.view.view.table.players[0].in_play = [72, 79];
  game.view.view.table.players[0].weapon_range = 5;
  await act(async () => root.render(createElement(Room, { room: { ...demoRoom, settings: { game: 'bang', payload: { ...((demoRoom.settings.game === 'bang') ? demoRoom.settings.payload : { mode: 'classic', roles: { deputy: 1, outlaw: 2, renegade: 1 }, expansions: [] }), mode: 'club' } } }, game, log: [], fxBatch: null, soundBatch: null, fxEnabled: false, viewer: 0, disabled: false, send() {} })));
  assert.match(container.querySelector('.hud-gun')!.textContent!, /Volcanic \+ Winchester/);
  assert.match(container.querySelector('.hud-gun')!.textContent!, /Tầm bắn: 5/);
});

test('manual check controls expose Enter, lock pending input and retain Barrel alternatives', async t => {
  const { container, root, sent } = await mount(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Expected player view');
  const table = game.view.view.table;
  table.waiting = { player: 0, pending_id: 44, kind: { type: 'check', reason: 'dynamite' } };
  const props = { room: demoRoom, game, log: [], fxBatch: null, soundBatch: null, fxEnabled: false, viewer: 0, disabled: false, send: (message: ClientMessage) => sent.push(message) };
  await act(async () => root.render(createElement(Room, props)));
  assert.match(container.querySelector('.game-controls')!.textContent!, /Dynamite: lật 1 lá/);
  const initialFlip = container.querySelector<HTMLButtonElement>('[aria-label="Lật kiểm tra"] button')!;
  assert.equal(initialFlip.getAttribute('aria-keyshortcuts'), 'Enter');
  assert.equal(initialFlip.getAttribute('data-primary-action'), 'true');
  await act(() => initialFlip.click());
  assert.deepEqual([...sent], [{ v: PROTOCOL_VERSION, type: 'game_action', action: { game: 'bang', payload: { type: 'flip_check', pending_id: 44 } } }]);
  await act(async () => root.render(createElement(Room, { ...props, disabled: true })));
  const flip = container.querySelector<HTMLButtonElement>('[aria-label="Lật kiểm tra"] button')!;
  assert.equal(flip.disabled, true);
  await act(() => flip.click()); assert.equal(sent.length, 1);
  table.waiting = { player: 0, pending_id: 45, kind: { type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 2 } };
  table.players[0].character = 'jourdonnais';
  await act(async () => root.render(createElement(Room, { ...props, game: { ...game, seq: game.seq + 1 } })));
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('.game-controls button')];
  assert.ok(buttons.some(button => button.textContent!.includes('Lật Barrel (2 lần còn lại)')));
  assert.ok(buttons.some(button => button.textContent!.includes('Chịu đòn')));
  await act(() => buttons.find(button => button.textContent!.includes('Lật Barrel'))!.click());
  assert.deepEqual(sent.at(-1), { v: PROTOCOL_VERSION, type: 'game_action', action: { game: 'bang', payload: { type: 'flip_barrel', pending_id: 45 } } });
  table.waiting = { player: 0, pending_id: 46, kind: { type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 1 } };
  await act(async () => root.render(createElement(Room, { ...props, game: { ...game, seq: game.seq + 2 } })));
  const current = [...container.querySelectorAll<HTMLElement>('.game-controls')].find(control => !control.closest('[inert]'))!;
  assert.match(current.textContent!, /Lật Jourdonnais/);
});
