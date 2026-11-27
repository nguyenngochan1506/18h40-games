import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement } from 'react';
import type { RouteObject } from 'react-router';
import type { ClientMessage, ServerMessage } from '../generated/protocol.ts';
import { PROTOCOL_VERSION } from '../generated/protocol.ts';
import type { GameSettingsProps } from '../games/types.ts';
import { demoGame, demoRoom } from '../testFixtures.ts';
import type { VoiceMedia } from '../features/rooms/voice.ts';
import { saveSession } from '../shared/lib/session.ts';
import type { Session } from '../shared/lib/session.ts';

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: ClientMessage[] = [];
  constructor() { TestSocket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 } as CloseEvent); }
  receive(message: ServerMessage) { this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>); }
  ack() { const ping = [...this.sent].reverse().find(message => message.type === 'ping'); assert.ok(ping?.type === 'ping'); this.receive({ v: PROTOCOL_VERSION, type: 'pong', nonce: ping.nonce }); }
  commands() { return this.sent.filter(message => message.type !== 'ping'); }
}

const dom = new Window({ url: 'http://localhost/', width: 1280, height: 720, settings: { enableImageFileLoading: false, enableCSSFileLoading: false, disableJavaScriptFileLoading: true } });
Reflect.deleteProperty(dom.Element.prototype, 'animate');
const voiceMedia = { opened: 0, closed: 0 };
const fakeVoice = (): VoiceMedia => ({
  async connect() { voiceMedia.opened++; }, close() { voiceMedia.closed++; },
  async publish(track) { track.enabled = true; }, unpublish() {}, async startAudio() {},
});
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, Image: dom.Image, Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent, WebSocket: TestSocket, getComputedStyle: dom.getComputedStyle.bind(dom), matchMedia: dom.matchMedia.bind(dom), requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16), cancelAnimationFrame: (id: number) => clearTimeout(id), IS_REACT_ACT_ENVIRONMENT: true, fakeVoice };
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
document.execCommand = () => false;
const { createRoot } = await import('react-dom/client');
const { createMemoryRouter } = await import('react-router');
const { RouterProvider } = await import('react-router/dom');
const vite = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  plugins: [{
    name: 'test-voice-media',
    enforce: 'pre',
    load: id => id.endsWith('/features/rooms/livekitVoice.ts') ? 'export const createLiveKitVoice = globalThis.fakeVoice;' : undefined,
  }],
});
let appRoutes: RouteObject[];
try {
  await vite.ssrLoadModule('/src/features/lobby/Lobby.tsx');
  // Vite crawl timers must finish before tests replace the global clock.
  const { registry } = await vite.ssrLoadModule('/src/games/registry.ts');
  await registry.bang.load();
  await vite.waitForRequestsIdle();
  appRoutes = (await vite.ssrLoadModule('/src/app/router.tsx')).appRoutes;
} catch (error) { await vite.close(); throw error; }
after(async () => {
  await vite.close(); await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

const saved = { roomCode: 'ABCDE', token: 'ab'.repeat(16) };
const joined = (code = 'ABCDE'): ServerMessage => ({ v: PROTOCOL_VERSION, type: 'joined', voice_enabled: false, room_code: code, token: 'cd'.repeat(16), room: { ...demoRoom, code, phase: 'waiting' }, game: null });
async function mount(t: TestContext, path: string | string[] = '/', session?: Session) {
  TestSocket.instances = []; window.localStorage.clear(); if (session) saveSession(session);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  t.mock.method(dom.HTMLImageElement.prototype, 'decode', async () => {});
  const errors = t.mock.method(console, 'error'), warnings = t.mock.method(console, 'warn');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const router = createMemoryRouter(appRoutes, { initialEntries: Array.isArray(path) ? path : [path] });
  await act(async () => root.render(createElement(RouterProvider, { router })));
  const tick = async (ms = 200) => { await act(async () => t.mock.timers.tick(ms)); };
  await tick();
  const connection = TestSocket.instances[0]!; assert.ok(connection);
  await act(() => connection.open()); await tick();
  const click = async (selector: string) => { const node = container.querySelector<HTMLButtonElement>(selector); assert.ok(node, selector); await act(async () => node.click()); await tick(); };
  const fill = async (selector: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(selector)!; assert.ok(input, selector);
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const receive = async (message: ServerMessage, ack = true) => { await act(async () => { connection.receive(message); if (ack) connection.ack(); }); await tick(); };
  t.after(async () => {
    await act(() => root.unmount()); router.dispose(); container.remove();
    assert.equal(connection.onmessage, null); assert.equal(connection.onclose, null); assert.equal(connection.readyState, 3);
    assert.equal(router.state.blockers.size, 0);
    assert.equal(errors.mock.callCount(), 0, errors.mock.calls.map(call => String(call.arguments)).join('\n'));
    assert.equal(warnings.mock.callCount(), 0, warnings.mock.calls.map(call => String(call.arguments)).join('\n'));
  });
  return { container, router, connection, tick, click, fill, receive };
}

test('an invite normalizes the URL, prefills its code, focuses the name and never joins without a name', async t => {
  const fx = await mount(t, '/r/a%20bcde/?from=friend#join');
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE');
  assert.equal(fx.router.state.location.search, '?from=friend'); assert.equal(fx.router.state.location.hash, '#join');
  assert.equal(fx.container.querySelector<HTMLInputElement>('#room-code')!.value, 'ABCDE');
  assert.equal(document.activeElement, fx.container.querySelector('#join-nickname'));
  assert.match(fx.container.textContent!, /Bạn được mời vào phòng ABCDE/);
  assert.equal(fx.connection.commands().length, 0);
  await fx.click('.join-poster button[type="submit"]'); assert.equal(fx.connection.commands().length, 0); assert.match(fx.container.textContent!, /Nhập tên từ 1 đến 20 ký tự/);
  await fx.fill('#join-nickname', 'Mai'); await fx.click('.join-poster button[type="submit"]');
  assert.deepEqual(fx.connection.commands(), [{ v: PROTOCOL_VERSION, type: 'join_room', room_code: 'ABCDE', nickname: 'Mai' }]);
  await fx.receive(joined()); assert.equal(fx.router.state.historyAction, 'REPLACE');
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE'); assert.equal(document.title, '18h40 — Phòng ABCDE');
  assert.equal(TestSocket.instances.length, 1);
});

test('creating pushes a room URL and leaving replaces it with the lobby', async t => {
  const fx = await mount(t); await fx.fill('#nickname', 'Mai'); await fx.click('[data-game-id="bang"]'); await fx.click('.create-poster button[type="submit"]');
  await fx.receive(joined()); assert.equal(fx.router.state.location.pathname, '/r/ABCDE'); assert.equal(fx.router.state.historyAction, 'PUSH');
  await fx.click('.waiting-actions button'); assert.equal(fx.connection.commands().at(-1)?.type, 'leave_room');
  await fx.receive({ v: PROTOCOL_VERSION, type: 'left' });
  assert.equal(fx.router.state.location.pathname, '/'); assert.equal(window.localStorage.getItem('18h40.session'), null);
  assert.equal(document.title, '18h40 — Phòng chơi cùng hội'); assert.equal(TestSocket.instances.length, 1);
});

test('only a waiting host can request a new game and the room follows the server snapshot', async t => {
  const { registry } = await vite.ssrLoadModule('/src/games/registry.ts');
  const prevCatsEnabled = registry.cats.enabled;
  registry.cats.enabled = false;
  t.after(() => { registry.cats.enabled = prevCatsEnabled; });
  const fx = await mount(t, '/r/ABCDE', saved);
  const session = joined();
  assert.equal(session.type, 'joined');
  await fx.receive(session);
  const picker = '.waiting-game-switch';
  assert.equal(fx.container.querySelector(picker), null);

  registry.uno.enabled = true;
  registry.cats.enabled = prevCatsEnabled;
  t.after(() => { registry.uno.enabled = false; });
  t.mock.method(registry.uno, 'load', async () => ({
    Board: () => null,
    Settings: ({ settings, editable, onChange }: GameSettingsProps) => createElement('button', {
      disabled: !editable,
      onClick: () => onChange(settings),
      'aria-label': 'Áp dụng cài đặt UNO',
    }),
  }));
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: { ...session.room, you: '2' } }, false);
  assert.equal(fx.container.querySelector(picker), null);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: { ...session.room, phase: 'playing' } }, false);
  assert.equal(fx.container.querySelector(picker), null);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: session.room }, false);
  const select = fx.container.querySelector<HTMLSelectElement>(`${picker} select`)!;
  const button = fx.container.querySelector<HTMLButtonElement>(`${picker} button`)!;
  assert.equal(button.disabled, true);
  assert.deepEqual([...select.options].map(option => option.value), ['', 'uno', 'cats']);
  await act(() => { select.value = 'uno'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(button.disabled, false);
  await fx.click(`${picker} button`);
  assert.deepEqual(fx.connection.commands().slice(1), [{ v: PROTOCOL_VERSION, type: 'change_game', game: 'uno' }]);
  assert.ok(select.disabled && button.disabled);
  assert.match(fx.container.querySelector('.waiting-table-note')!.textContent!, /BANG!/);
  const storedSession = window.localStorage.getItem('18h40.session');

  const nextRoom = {
    ...session.room, game: 'uno' as const, settings: { game: 'uno' as const, payload: {} }, min_players: 2, max_players: 10,
    members: session.room.members.map(member => ({ ...member, role: 'spectator' as const })),
  };
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: nextRoom }, false);
  assert.match(fx.container.querySelector('.waiting-table-note')!.textContent!, /UNO.*0 người chơi.*2–10/s);
  const applySettings = '[aria-label="Áp dụng cài đặt UNO"]';
  assert.equal(fx.container.querySelector<HTMLButtonElement>(applySettings)!.disabled, true);
  assert.ok(fx.container.querySelector<HTMLSelectElement>(`${picker} select`)!.disabled);
  await act(() => fx.connection.ack());
  assert.equal(fx.container.querySelector<HTMLSelectElement>(`${picker} select`)!.disabled, false);
  await fx.click(applySettings);
  assert.deepEqual(fx.connection.commands().at(-1), { v: PROTOCOL_VERSION, type: 'update_settings', settings: nextRoom.settings });
  await act(() => fx.connection.ack());
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE');
  assert.equal(window.localStorage.getItem('18h40.session'), storedSession);
  assert.equal(TestSocket.instances.length, 1);
});

test('a waiting host can switch back when the new game fails to load', async t => {
  const { registry } = await vite.ssrLoadModule('/src/games/registry.ts');
  registry.werewolf.enabled = true;
  t.after(() => { registry.werewolf.enabled = false; });
  const loader = t.mock.method(registry.werewolf, 'load', async () => { throw new Error('Import failed'); });
  const fx = await mount(t, '/r/ABCDE', saved);
  const session = joined();
  assert.equal(session.type, 'joined');
  await fx.receive(session);
  const changeGame = async (kind: 'werewolf' | 'bang') => {
    const select = fx.container.querySelector<HTMLSelectElement>('.waiting-game-switch select')!;
    await act(() => { select.value = kind; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await fx.click('.waiting-game-switch button');
    assert.deepEqual(fx.connection.commands().at(-1), { v: PROTOCOL_VERSION, type: 'change_game', game: kind });
  };
  await changeGame('werewolf');
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: {
    ...session.room, game: 'werewolf', settings: { game: 'werewolf', payload: {} }, max_players: 16,
  } });
  assert.match(fx.container.querySelector('.waiting-load-error [role="alert"]')!.textContent!, /Không tải được/);
  assert.equal(fx.container.querySelector<HTMLButtonElement>('.waiting-primary button')!.disabled, true);
  const attempts = loader.mock.callCount();
  await fx.click('.waiting-load-error button');
  assert.equal(loader.mock.callCount(), attempts + 1);
  await changeGame('bang');
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: session.room });
  assert.equal(fx.container.querySelector('.waiting-load-error'), null);
  assert.match(fx.container.querySelector('.waiting-table-note')!.textContent!, /BANG!/);
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE');
  assert.equal(TestSocket.instances.length, 1);
});

for (const path of ['/', '/r/ABCDE']) test(`the saved room rejoins from ${path} without a second socket`, async t => {
  const fx = await mount(t, path, saved);
  assert.deepEqual(fx.connection.commands(), [{ v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: 'ABCDE', token: saved.token }]);
  await fx.receive(joined()); assert.equal(fx.router.state.location.pathname, '/r/ABCDE'); assert.equal(fx.router.state.historyAction, 'REPLACE');
  assert.equal(TestSocket.instances.length, 1);
});

for (const outcome of ['joined', 'room_not_found', 'invalid_token', 'wrong_phase'] as const) test(`Back during rejoin ignores a late ${outcome} and allows entering the current invite`, async t => {
  const fx = await mount(t, ['/r/FGHJK', '/r/ABCDE'], saved);
  const restorePing = fx.connection.sent.find(message => message.type === 'ping')!;
  assert.equal(fx.connection.commands()[0]?.type, 'rejoin_room');
  await act(() => fx.router.navigate(-1)); await fx.tick();
  const assertInvite = () => {
    assert.equal(fx.router.state.location.pathname, '/r/FGHJK');
    assert.equal(fx.container.querySelector<HTMLInputElement>('#room-code')?.value, 'FGHJK');
    assert.match(fx.container.textContent!, /Bạn được mời vào phòng FGHJK/);
    assert.equal(fx.container.querySelector('.app-scene:not([inert]) .saloon-restoring,.app-scene:not([inert]) .saloon-waiting,dialog,[role="alert"]'), null);
  };
  assertInvite();
  if (outcome === 'joined') {
    await fx.receive(joined(), false);
    assertInvite();
    assert.equal(fx.connection.commands().at(-1)?.type, 'leave_room');
    await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: { ...demoRoom, code: 'ABCDE', phase: 'waiting' } }, false);
    await fx.receive({ v: PROTOCOL_VERSION, type: 'pong', nonce: restorePing.nonce }, false);
    assertInvite();
    assert.equal(fx.container.querySelector<HTMLButtonElement>('.join-poster button[type="submit"]')!.disabled, true, 'Wait for the cleanup barrier before entering another room');
    await fx.receive({ v: PROTOCOL_VERSION, type: 'left' });
  } else {
    await fx.receive({ v: PROTOCOL_VERSION, type: 'error', code: outcome, message: 'Old rejoin rejected' });
  }
  assertInvite();
  if (outcome !== 'wrong_phase') assert.equal(window.localStorage.getItem('18h40.session'), null);
  assert.equal(fx.container.querySelector('.connection-status')!.textContent, 'Đã kết nối');
  assert.equal(fx.container.querySelector<HTMLButtonElement>('.join-poster button[type="submit"]')!.disabled, false);
  await fx.fill('#join-nickname', 'Mai'); await fx.click('.join-poster button[type="submit"]');
  assert.deepEqual(fx.connection.commands().at(-1), { v: PROTOCOL_VERSION, type: 'join_room', room_code: 'FGHJK', nickname: 'Mai' });
  if (outcome === 'wrong_phase') {
    await fx.receive(joined(), false);
    await fx.receive({ v: PROTOCOL_VERSION, type: 'left' }, false);
  }
  await fx.receive(joined('FGHJK'));
  assert.equal(fx.router.state.location.pathname, '/r/FGHJK');
  assert.equal(JSON.parse(window.localStorage.getItem('18h40.session')!).roomCode, 'FGHJK');
  assert.equal(TestSocket.instances.length, 1);
});

test('Forward to the saved route does not revive a cancelled rejoin before cleanup finishes', async t => {
  const fx = await mount(t, ['/r/FGHJK', '/r/ABCDE'], saved);
  await act(() => fx.router.navigate(-1)); await fx.tick();
  await act(() => fx.router.navigate(1)); await fx.tick();
  await fx.receive(joined(), false);
  assert.equal(fx.connection.commands().at(-1)?.type, 'leave_room');
  assert.equal(fx.container.querySelector('.app-scene:not([inert]) .saloon-waiting'), null);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'left' });
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE');
  assert.equal(fx.container.querySelector<HTMLInputElement>('#room-code')!.value, 'ABCDE');
  assert.match(fx.container.textContent!, /Bạn được mời vào phòng ABCDE/);
  assert.equal(fx.connection.commands().filter(message => message.type === 'rejoin_room').length, 1);
  assert.equal(window.localStorage.getItem('18h40.session'), null);
});

test('another room invite does not restore the old membership until the user returns', async t => {
  const fx = await mount(t, '/r/FGHJK', saved);
  assert.equal(fx.connection.commands().length, 0); assert.match(fx.container.textContent!, /Bạn đang ở phòng ABCDE/);
  const back = [...fx.container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Về phòng ABCDE')!;
  await act(async () => back.click()); await fx.tick();
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE'); assert.equal(fx.connection.commands()[0].type, 'rejoin_room');
  await fx.receive(joined());
});

test('joining a new room explicitly leaves the saved membership before entering and keeps one request barrier', async t => {
  const fx = await mount(t, '/r/FGHJK', saved); await fx.fill('#join-nickname', 'Mai'); await fx.click('.join-poster button[type="submit"]');
  assert.deepEqual(fx.connection.commands(), [{ v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: 'ABCDE', token: saved.token }, { v: PROTOCOL_VERSION, type: 'leave_room' }, { v: PROTOCOL_VERSION, type: 'join_room', room_code: 'FGHJK', nickname: 'Mai' }]);
  assert.equal(fx.connection.sent.filter(message => message.type === 'ping').length, 1);
  await fx.receive(joined(), false); assert.equal(fx.container.querySelector('.saloon-waiting'), null);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'left' }, false);
  await fx.receive(joined('FGHJK'));
  assert.equal(fx.router.state.location.pathname, '/r/FGHJK');
  assert.equal(JSON.parse(window.localStorage.getItem('18h40.session')!).roomCode, 'FGHJK'); assert.equal(TestSocket.instances.length, 1);
});

for (const path of ['/r/abc!', '/r/', '/r/ABCDE//']) test(`invalid room URL ${path} reports an error at the lobby without a network command`, async t => {
  const fx = await mount(t, path);
  assert.equal(fx.router.state.location.pathname, '/'); assert.match(fx.container.textContent!, /Mã phòng không hợp lệ/); assert.equal(fx.connection.commands().length, 0);
});

test('unknown paths redirect to the lobby', async t => {
  const fx = await mount(t, '/foo'); assert.equal(fx.router.state.location.pathname, '/'); assert.ok(fx.container.querySelector('.saloon-lobby'));
});

test('a missing invitation room and invalid rejoin clear the bad session and return to the lobby', async t => {
  const fx = await mount(t, '/r/ABCDE', saved);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'error', code: 'room_not_found', message: 'Room not found' });
  assert.equal(fx.router.state.location.pathname, '/'); assert.match(fx.container.textContent!, /Không tìm thấy phòng ABCDE/); assert.equal(window.localStorage.getItem('18h40.session'), null);
});

test('manual invalid codes show inline feedback without sending and clear on correction', async t => {
  const fx = await mount(t); await fx.fill('#join-nickname', 'Mai'); await fx.fill('#room-code', 'ab!de');
  assert.equal(fx.container.querySelector('#room-code')!.getAttribute('aria-invalid'), null);
  await fx.click('.join-poster button[type="submit"]'); assert.equal(fx.connection.commands().length, 0);
  assert.match(fx.container.querySelector('#room-code-hint')!.textContent!, /Mã phòng không hợp lệ/);
  await fx.fill('#room-code', 'abcde'); assert.equal(fx.container.querySelector('#room-code')!.getAttribute('aria-invalid'), null);
});

for (const code of ['invalid_token', 'nickname_taken', 'wrong_phase'] as const) test(`entry error ${code} returns to the lobby without an automatic retry`, async t => {
  const fx = await mount(t, '/r/ABCDE', code === 'invalid_token' ? saved : undefined);
  if (code !== 'invalid_token') { await fx.fill('#join-nickname', 'Mai'); await fx.click('.join-poster button[type="submit"]'); }
  await fx.receive({ v: PROTOCOL_VERSION, type: 'error', code, message: 'Rejected' });
  assert.equal(fx.router.state.location.pathname, '/'); assert.ok(fx.container.querySelector('[role="alert"]'));
  await fx.tick(1000); assert.equal(fx.connection.commands().length, 1);
  if (code === 'invalid_token') assert.equal(window.localStorage.getItem('18h40.session'), null);
});

test('an expired old membership does not prevent an explicit switch to the invited room', async t => {
  const fx = await mount(t, '/r/FGHJK', saved); await fx.fill('#join-nickname', 'Mai'); await fx.click('.join-poster button[type="submit"]');
  await fx.receive({ v: PROTOCOL_VERSION, type: 'error', code: 'invalid_token', message: 'Expired' }, false);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'error', code: 'not_in_room', message: 'Not in room' }, false);
  await fx.receive(joined('FGHJK')); assert.equal(fx.router.state.location.pathname, '/r/FGHJK'); assert.equal(fx.container.querySelector('[role="alert"]'), null);
});

test('Back stays in the room until confirmed; Stay and Escape reset the blocker and restore focus', async t => {
  const fx = await mount(t); await fx.fill('#nickname', 'Mai'); await fx.click('[data-game-id="bang"]'); await fx.click('.create-poster button[type="submit"]'); await fx.receive(joined());
  const trigger = fx.container.querySelector<HTMLButtonElement>('.waiting-actions button')!; trigger.focus();
  await act(() => fx.router.navigate(-1)); await fx.tick();
  let dialog = fx.container.querySelector<HTMLDialogElement>('dialog')!; assert.ok(dialog.open); assert.match(dialog.textContent!, /Rời phòng ABCDE/);
  assert.equal(document.activeElement?.textContent, 'Ở lại'); assert.equal(fx.connection.commands().length, 1);
  await act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })));
  assert.equal(document.activeElement?.textContent, 'Rời phòng');
  await act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  assert.equal(document.activeElement?.textContent, 'Ở lại');
  await act(() => dialog.querySelector<HTMLButtonElement>('button')!.click()); await fx.tick();
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE'); assert.equal(document.activeElement, trigger);
  await act(() => fx.router.navigate(-1)); await fx.tick(); dialog = fx.container.querySelector<HTMLDialogElement>('dialog')!;
  await act(() => dialog.dispatchEvent(new Event('cancel', { cancelable: true }))); await fx.tick(); assert.equal(fx.container.querySelector('dialog'), null);
  await act(() => fx.router.navigate(-1)); await fx.tick();
  await fx.click('.leave-room-confirm'); assert.equal(fx.connection.commands().at(-1)?.type, 'leave_room');
  await act(() => fx.container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })));
  assert.ok(fx.container.querySelector('dialog'), 'A leave request already sent cannot be cancelled locally');
  await fx.receive({ v: PROTOCOL_VERSION, type: 'left' }); assert.equal(fx.router.state.location.pathname, '/');
  await act(() => fx.router.navigate(1)); await fx.tick(); assert.equal(fx.container.querySelector<HTMLInputElement>('#room-code')!.value, 'ABCDE');
});

test('copying an invite uses only the origin and code, announces success and falls back to selection', async t => {
  const write = t.mock.fn(async (_text: string) => {});
  t.mock.getter(navigator, 'clipboard', () => ({ writeText: write }) as unknown as Clipboard);
  const fx = await mount(t, '/r/ABCDE', saved); await fx.receive(joined());
  await fx.click('.copy-invite'); assert.equal(write.mock.calls[0].arguments[0], 'http://localhost/r/ABCDE');
  assert.equal(fx.container.querySelector('.copy-status')!.textContent, 'Đã sao chép link'); assert.equal(fx.container.querySelector('.copy-status')!.getAttribute('aria-live'), 'polite');
  t.mock.getter(navigator, 'clipboard', () => ({ writeText: async () => { throw new Error('Denied'); } }) as unknown as Clipboard);
  const fallback = t.mock.method(document, 'execCommand', (command: string) => { assert.equal(command, 'copy'); assert.equal(document.querySelector('textarea')!.value, 'http://localhost/r/ABCDE'); return true; });
  await fx.click('.copy-invite'); assert.equal(fallback.mock.callCount(), 1); assert.equal(document.querySelector('textarea'), null);
});

test('reconnect restores an existing room even though its layout remains mounted', async t => {
  const fx = await mount(t, '/r/ABCDE', saved); await fx.receive(joined());
  await act(() => fx.connection.close()); await fx.tick(1000);
  const next = TestSocket.instances[1]!; assert.ok(next); await act(() => next.open());
  assert.equal(next.commands()[0]?.type, 'rejoin_room'); await act(() => { next.receive(joined()); next.ack(); }); await fx.tick();
  assert.equal(fx.router.state.location.pathname, '/r/ABCDE');
});

for (const reconnect of [false, true]) test(`a rejected rejoin leaves a usable lobby${reconnect ? ' after disconnect' : ''}`, async t => {
  const fx = await mount(t, '/r/ABCDE', saved);
  let connection = fx.connection;
  if (reconnect) {
    await fx.receive(joined()); await act(async () => connection.close()); await fx.tick(1000);
    connection = TestSocket.instances[1]; await act(async () => connection.open());
  }
  await act(async () => { connection.receive({ v: PROTOCOL_VERSION, type: 'error', code: 'wrong_phase', message: 'Rejected' }); connection.ack(); }); await fx.tick();
  assert.equal(fx.router.state.location.pathname, '/');
  assert.ok(!fx.container.querySelector('.app-scene:not([inert]) .saloon-waiting,dialog'), 'Only the lobby may stay active while the old room fades out');
  assert.equal(fx.container.querySelector('.connection-status')!.textContent, 'Đã kết nối');
  assert.equal(fx.container.querySelector<HTMLButtonElement>('.join-poster button[type="submit"]')!.disabled, false);
  const count = connection.commands().length; await fx.tick(1000); assert.equal(connection.commands().length, count);
});

test('room voice survives game transitions and only a held mic stops on focus loss', async t => {
  const fx = await mount(t, '/r/ABCDE', saved);
  const session = joined();
  assert.equal(session.type, 'joined');
  await fx.receive({ ...session, voice_enabled: true });
  const voice = fx.container.querySelector('.waiting-actions .room-voice');
  assert.ok(voice);
  assert.deepEqual(fx.connection.commands().map(message => message.type), ['rejoin_room', 'voice_token']);
  assert.equal(voiceMedia.opened, 0);

  const request = fx.connection.commands().at(-1);
  assert.equal(request?.type, 'voice_token');
  assert.equal(voice.querySelector('[aria-busy="true"]')?.getAttribute('aria-label'), 'Đang vào thoại');
  await fx.click('.waiting-primary button');
  assert.equal(fx.connection.sent.filter(message => message.type === 'ping').length, 2);
  await vite.ssrLoadModule('/src/features/rooms/livekitVoice.ts');
  const grant = {
    v: PROTOCOL_VERSION, type: 'voice_token_result', nonce: request.nonce,
    result: { status: 'ok', url: 'ws://127.0.0.1:1', token: 'test.header.signature', expires_at: 4_000_000_000 },
  } satisfies ServerMessage;
  await fx.receive(grant, false);
  await act(async () => {
    for (let turn = 0; !voiceMedia.opened && turn < 50; turn++) await delay(20);
  });
  assert.equal(voiceMedia.opened, 1, voice.textContent!);
  assert.equal(voice.querySelector('[data-voice-mic]')?.getAttribute('aria-pressed'), 'false');
  assert.equal(voice.querySelector('.voice-status'), null);
  assert.equal(fx.container.querySelector<HTMLButtonElement>('.waiting-primary button')!.disabled, true);

  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: { ...session.room, phase: 'playing' } }, false);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'game_started', seq: 0, seats: demoGame.seats,
    view: { game: 'bang', payload: demoGame.view } });
  for (let turn = 0; !fx.container.querySelector('.table-tools .room-voice') && turn < 10; turn++) await fx.tick();
  assert.equal(fx.container.querySelector('.table-tools [data-voice-mic]')?.getAttribute('aria-pressed'), 'false');

  assert.ok(demoGame.view.perspective === 'player');
  const table = { ...demoGame.view.view.table, winner: 'outlaws' } as const;
  await fx.receive({ v: PROTOCOL_VERSION, type: 'game_over', seq: 1,
    update: { game: 'bang', events: [], view: { perspective: 'spectator', view: table } } }, false);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: session.room }, false);
  assert.equal(fx.container.querySelector('.waiting-actions [data-voice-mic]')?.getAttribute('aria-pressed'), 'false');
  await fx.receive({ v: PROTOCOL_VERSION, type: 'room_state', room: {
    ...session.room, game: 'uno', settings: { game: 'uno', payload: {} },
  } }, false);
  const currentVoice = fx.container.querySelector('.saloon-restoring .room-voice');
  assert.ok(currentVoice);
  assert.equal(currentVoice.querySelector('[data-voice-mic]')?.getAttribute('aria-pressed'), 'false');
  assert.equal(voiceMedia.closed, 0);

  const createTrack = () => Object.assign(new dom.EventTarget(), {
    enabled: true, readyState: 'live',
    stop() { this.readyState = 'ended'; },
  });
  const tracks: ReturnType<typeof createTrack>[] = [];
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    async getUserMedia() {
      const track = createTrack();
      tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    },
  } });
  t.after(() => { Reflect.deleteProperty(navigator, 'mediaDevices'); });
  assert.equal(tracks.length, 0, 'Listening must not open the microphone');
  const blur = async () => { await act(() => window.dispatchEvent(new Event('blur'))); };
  const hide = async () => {
    const hidden = t.mock.getter(document, 'hidden', () => true);
    try { await act(() => document.dispatchEvent(new Event('visibilitychange'))); }
    finally { hidden.mock.restore(); }
  };
  const toggle = '.saloon-restoring [data-voice-mic]';
  await fx.click(toggle);
  const toggled = tracks.at(-1)!;
  assert.equal(toggled.enabled, true);
  for (const background of [blur, hide]) {
    await background();
    assert.equal(toggled.readyState, 'live');
    assert.equal(toggled.enabled, true);
    assert.equal(currentVoice.querySelector('[data-voice-mic]')?.getAttribute('aria-pressed'), 'true');
  }
  await fx.click(toggle);
  assert.equal(toggled.readyState, 'ended');

  const mode = currentVoice.querySelector<HTMLSelectElement>('select')!;
  await act(() => { mode.value = 'hold'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
  const hold = currentVoice.querySelector<HTMLButtonElement>('.voice-hold')!;
  await act(() => hold.focus());
  const pointer = (type: string) => new dom.PointerEvent(type, { bubbles: true, pointerId: 9, isPrimary: true, pointerType: 'touch' }) as unknown as PointerEvent;
  await act(() => hold.dispatchEvent(pointer('pointerdown')));
  assert.equal(tracks.at(-1)?.enabled, true);
  await act(() => window.dispatchEvent(pointer('pointercancel')));
  assert.equal(tracks.at(-1)?.readyState, 'ended');
  for (const background of [blur, hide]) {
    await act(() => hold.dispatchEvent(pointer('pointerdown')));
    const held = tracks.at(-1)!;
    assert.equal(held.readyState, 'live');
    assert.equal(held.enabled, true);
    await background();
    assert.equal(held.readyState, 'ended');
  }

  const key = (type: string, options?: KeyboardEventInit) => new KeyboardEvent(type, { key: 'v', code: 'KeyV', bubbles: true, ...options });
  const captureCount = tracks.length;
  await act(() => hold.dispatchEvent(key('keydown')));
  assert.equal(tracks.length, captureCount, 'V is disabled by default');
  await fx.click('.voice-options input');
  await act(() => hold.focus());
  await act(() => hold.dispatchEvent(key('keydown', { isComposing: true })));
  assert.equal(tracks.length, captureCount);
  await act(() => hold.dispatchEvent(key('keydown')));
  assert.equal(tracks.length, captureCount + 1);
  assert.equal(tracks.at(-1)?.enabled, true);
  await act(() => hold.dispatchEvent(key('keyup')));
  assert.equal(tracks.at(-1)?.readyState, 'ended');

  await fx.click('.saloon-restoring button');
  assert.deepEqual(fx.connection.commands().map(message => message.type), ['rejoin_room', 'voice_token', 'start_game', 'voice_leave', 'leave_room']);
  assert.equal(voiceMedia.closed, 1);
  await fx.receive(grant, false);
  assert.equal(voiceMedia.opened, 1);
  await fx.receive({ v: PROTOCOL_VERSION, type: 'left' });
  assert.equal(fx.container.querySelector('.room-voice'), null);
  assert.equal(TestSocket.instances.length, 1);
});

test('a malformed voice grant leaves the game request pending until its own pong', async t => {
  const fx = await mount(t, '/r/ABCDE', saved);
  const session = joined();
  assert.equal(session.type, 'joined');
  await fx.receive({ ...session, voice_enabled: true });
  const start = fx.container.querySelector<HTMLButtonElement>('.waiting-primary button')!;
  await fx.click('.waiting-primary button');

  for (const v of [PROTOCOL_VERSION, PROTOCOL_VERSION - 1]) {
    const request = fx.connection.commands().filter(message => message.type === 'voice_token').at(-1);
    assert.equal(request?.type, 'voice_token');
    await fx.receive({ v, type: 'voice_token_result', nonce: request.nonce, result: null } as unknown as ServerMessage, false);
    assert.equal(fx.connection.readyState, TestSocket.OPEN);
    assert.equal(TestSocket.instances.length, 1);
    assert.equal(start.disabled, true);
    assert.equal(fx.connection.commands().at(-1)?.type, 'voice_leave');
    assert.match(fx.container.querySelector('.voice-error')?.textContent ?? '', /thoại không hợp lệ/);
    assert.equal(fx.container.querySelector('.connection-alert'), null);
    if (v === PROTOCOL_VERSION) await fx.click('[data-voice-join]');
  }

  await act(() => fx.connection.ack());
  assert.equal(start.disabled, false);
});
