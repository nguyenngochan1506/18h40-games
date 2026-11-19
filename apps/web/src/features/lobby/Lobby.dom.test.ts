import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement } from 'react';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import type { ClientMessage } from '../../generated/protocol.ts';
import type LobbyComponent from './Lobby.tsx';
import type RoomComponent from '../rooms/Room.tsx';
import { demoGame, demoRoom } from '../game/demo.ts';

const dom = new Window({ url: 'http://localhost/', width: 1280, height: 720, settings: { enableImageFileLoading: false, enableCSSFileLoading: false, disableJavaScriptFileLoading: true } });
Reflect.deleteProperty(dom.Element.prototype, 'animate');
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, Image: dom.Image, Event: dom.Event, MouseEvent: dom.MouseEvent, getComputedStyle: dom.getComputedStyle.bind(dom), matchMedia: dom.matchMedia.bind(dom), requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16), cancelAnimationFrame: (id: number) => clearTimeout(id), IS_REACT_ACT_ENVIRONMENT: true };
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
let Lobby: typeof LobbyComponent, Room: typeof RoomComponent;
try {
  Lobby = (await vite.ssrLoadModule('/src/features/lobby/Lobby.tsx')).default;
  await vite.ssrLoadModule('/src/features/game/GameBoard.tsx');
  Room = (await vite.ssrLoadModule('/src/features/rooms/Room.tsx')).default;
} catch (error) { await vite.close(); throw error; }
after(async () => {
  await vite.close(); await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

async function mount(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  t.mock.method(dom.HTMLImageElement.prototype, 'decode', async () => {});
  const errors = t.mock.method(console, 'error'), warnings = t.mock.method(console, 'warn');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); assert.equal(errors.mock.callCount(), 0); assert.equal(warnings.mock.callCount(), 0); });
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
