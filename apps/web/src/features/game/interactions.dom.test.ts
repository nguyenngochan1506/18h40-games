import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement, useRef } from 'react';
import type { Action, DecisionKind } from '../../generated/protocol.ts';
import type { useCardDrag as DragHook } from './useCardDrag.tsx';
import type GameBoardComponent from './GameBoard.tsx';
import { emptyDraft } from './actions.ts';
import { demoGame, demoRoom } from './demo.ts';

const dom = new Window({ url: 'http://localhost/', width: 375, height: 812, settings: { enableImageFileLoading: false, enableCSSFileLoading: false, disableJavaScriptFileLoading: true } });
// Drive Motion's JS animation path with the test clock instead of Happy DOM's separate WAAPI clock.
Reflect.deleteProperty(dom.Element.prototype, 'animate');
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLImageElement: dom.HTMLImageElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, Image: dom.Image, Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent, getComputedStyle: dom.getComputedStyle.bind(dom), matchMedia: dom.matchMedia.bind(dom), requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16), cancelAnimationFrame: (id: number) => clearTimeout(id), IS_REACT_ACT_ENVIRONMENT: true };
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
let useCardDrag: typeof DragHook, GameBoard: typeof GameBoardComponent;
try {
  useCardDrag = (await vite.ssrLoadModule('/src/features/game/useCardDrag.tsx')).useCardDrag;
  await vite.ssrLoadModule('/src/features/game/StorePool.tsx');
  GameBoard = (await vite.ssrLoadModule('/src/features/game/GameBoard.tsx')).default;
} catch (error) { await vite.close(); throw error; }
after(async () => {
  await vite.close();
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

async function host(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  t.mock.method(dom.HTMLImageElement.prototype, 'decode', async () => {});
  const errors = t.mock.method(console, 'error'), warnings = t.mock.method(console, 'warn');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); assert.equal(errors.mock.callCount(), 0); assert.equal(warnings.mock.callCount(), 0); });
  return { container, root, async settle() { for (let i = 0; i < 25; i++) await act(() => t.mock.timers.tick(20)); } };
}

const cases: { name: string; card: number; kind: DecisionKind; calamity?: boolean }[] = [
  { name: 'BANG! answering Duel', card: 1, kind: { type: 'duel' } },
  { name: 'BANG! answering Indians', card: 1, kind: { type: 'attack_response', kind: 'indians', remaining: 1 } },
  { name: 'Calamity Missed! answering Duel', card: 26, kind: { type: 'duel' }, calamity: true },
  { name: 'Calamity Missed! answering Indians', card: 26, kind: { type: 'attack_response', kind: 'indians', remaining: 1 }, calamity: true },
];
for (const [index, scenario] of cases.entries()) test(`useCardDrag sends ${scenario.name} once from the table zone with the current pending_id`, async t => {
  const { container, root } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.hand = [scenario.card];
  game.view.view.table.waiting = { player: 0, pending_id: 40 + index, kind: scenario.kind };
  if (scenario.calamity) game.view.view.table.players[0].character = 'calamity_janet';
  let drag: ReturnType<typeof DragHook>;
  const sent: Action[] = [];
  function Harness() {
    const stage = useRef<HTMLDivElement>(null);
    drag = useCardDrag({ root: stage, game, draft: emptyDraft, locked: false, ready: true, desktop: true, requestVersion: 0, error: null, setDraft() {}, clearDetail() {}, send: action => sent.push(action) });
    return createElement('div', { ref: stage }, createElement('div', { className: 'table-center' }), createElement('button', { 'data-scene-player': 1 }));
  }
  await act(async () => root.render(createElement(Harness)));
  t.mock.method(container.querySelector('.table-center')!, 'getBoundingClientRect', () => ({ x: 400, y: 250, width: 200, height: 150 }));
  t.mock.method(container.querySelector('[data-scene-player]')!, 'getBoundingClientRect', () => ({ x: 100, y: 100, width: 100, height: 150 }));
  const home = { x: 600, y: 600, width: 64, height: 100 };
  await act(() => drag.props(scenario.card).start(home));
  assert.equal(drag!.dragging, scenario.card);
  await act(() => drag.props(scenario.card).move({ x: 150, y: 150 }));
  assert.equal(drag!.over, null, 'Response must not expose player drop zones');
  await act(() => drag.props(scenario.card).move({ x: 500, y: 300 }));
  assert.equal(drag!.over, 'table');
  let accepted = false;
  await act(() => { accepted = drag.props(scenario.card).end({ x: 500, y: 300 }, home); });
  assert.equal(accepted, true);
  assert.deepEqual(sent, [{ type: 'respond', pending_id: 40 + index, card: scenario.card }]);
  await act(() => { assert.equal(drag.props(scenario.card).end({ x: 500, y: 300 }, home), false); });
  assert.equal(sent.length, 1, 'Duplicate drag-end must not send a second action');
});

test('GameBoard narrow Escape closes card details and restores focus without enabling desktop shortcuts', async t => {
  const { container, root, settle } = await host(t);
  const sent: Action[] = [];
  await act(async () => root.render(createElement(GameBoard, { game: demoGame, room: demoRoom, sendAction: action => sent.push(action) })));
  await settle();
  assert.equal(container.querySelector('.cinematic'), null, '375px must use the narrow board');
  const trigger = container.querySelector<HTMLButtonElement>('.own-hand [data-card-id="1"]')!;
  await act(async () => { trigger.focus(); trigger.click(); });
  await settle();
  const close = container.querySelector<HTMLButtonElement>('.card-detail:not([inert]) .detail-close')!;
  assert.ok(close, 'Read-only BANG! opens the existing detail panel');
  await act(() => close.focus());
  assert.ok(document.activeElement === close, 'Detail close button receives focus');
  await act(() => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await settle();
  assert.ok(!container.querySelector('.card-detail:not([inert])'), 'Escape closes the detail panel');
  assert.ok(document.activeElement === trigger, 'Escape restores focus to the card that opened the details');
  await act(() => {
    container.querySelector<HTMLElement>('.bang-board')!.focus();
    for (const key of ['2', 'Enter']) document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  assert.equal(sent.length, 0);
  assert.equal(container.querySelector('.own-hand [aria-pressed="true"]'), null);
});

test('blind store renders only backs and clicking a slot confirms the current pending id once', async t => {
  const { container, root, settle } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.table.store_slots = 4;
  game.view.view.table.waiting = { player: 0, pending_id: 110, kind: { type: 'general_store' } };
  const sent: Action[] = [];
  await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom, sendAction: action => sent.push(action) })));
  await settle();
  const pool = container.querySelector('.store-pool')!;
  assert.equal(pool.querySelectorAll('button[data-store-slot]').length, 4);
  assert.equal(pool.querySelectorAll('[data-card-id], [data-tip], .card-face, .card-name').length, 0);
  assert.ok([...pool.querySelectorAll('img')].every(img => img.alt === '' && img.getAttribute('src')?.includes('/back')));
  const slot = pool.querySelector<HTMLButtonElement>('[data-store-slot="2"]')!;
  await act(() => slot.click());
  assert.equal(slot.getAttribute('aria-pressed'), 'true');
  assert.equal(sent.length, 0);
  const confirm = [...container.querySelectorAll<HTMLButtonElement>('.game-controls button')].find(b => b.textContent?.startsWith('Lấy lá đã chọn'))!;
  assert.ok(!confirm.disabled);
  await act(() => confirm.click());
  assert.deepEqual([...sent], [{ type: 'choose_store_slot', pending_id: 110, slot: 2 }]);
  game.view.view.table.waiting.player = 1;
  await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom, sendAction: action => sent.push(action) })));
  assert.ok([...container.querySelectorAll<HTMLButtonElement>('.store-slot')].every(button => button.disabled));
});
