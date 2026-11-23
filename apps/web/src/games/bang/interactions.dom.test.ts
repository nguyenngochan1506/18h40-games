import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement, useCallback, useRef, useState } from 'react';
import type { Action, DecisionKind, GameAction, ServerMessage } from '../../generated/protocol.ts';
import type { FxBatch } from './fx/fx.ts';
import type { useCardDrag as DragHook } from './drag/useCardDrag.tsx';
import type GameBoardComponent from './Board.tsx';
import { emptyDraft, type ActionDraft } from './actions.ts';
import type { GameClient } from '../types.ts';
import type { BangSnapshot } from './types.ts';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import { consumeFrames, initialGameState, receiveGameState } from '../../shared/gameSync.ts';
import { createRequestTracker } from '../../shared/lib/request.ts';
import { demoGame, demoRoom } from './demo/demo.ts';

const dom = new Window({ url: 'http://localhost/', width: 375, height: 812, settings: { enableImageFileLoading: false, enableCSSFileLoading: false, disableJavaScriptFileLoading: true } });
// Drive Motion's JS animation path with the test clock instead of Happy DOM's separate WAAPI clock.
Reflect.deleteProperty(dom.Element.prototype, 'animate');
const globals = { window: dom, innerWidth: dom.innerWidth, innerHeight: dom.innerHeight, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLImageElement: dom.HTMLImageElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, Image: dom.Image, Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent, getComputedStyle: dom.getComputedStyle.bind(dom), matchMedia: dom.matchMedia.bind(dom), requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16), cancelAnimationFrame: (id: number) => clearTimeout(id), IS_REACT_ACT_ENVIRONMENT: true };
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../..', import.meta.url)), configFile: false, plugins: [{
  name: 'observe-real-drag-hook', enforce: 'pre',
  transform(source, id) {
    if (!id.endsWith('/drag/useCardDrag.tsx')) return;
    // Observe real Client/Board/hook wiring without replacing any production behavior.
    return source.replace('return { dragging, over, flight, props, overlay };', 'globalThis.__bangDragProbe?.({ controller: { dragging, over, flight, props, overlay }, game, requestVersion, locked }); return { dragging, over, flight, props, overlay };');
  },
}], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
let useCardDrag: typeof DragHook, GameBoard: typeof GameBoardComponent, ClientBoard: GameClient['Board'];
try {
  useCardDrag = (await vite.ssrLoadModule('/src/games/bang/drag/useCardDrag.tsx')).useCardDrag;
  await vite.ssrLoadModule('/src/games/bang/StorePool.tsx');
  GameBoard = (await vite.ssrLoadModule('/src/games/bang/Board.tsx')).default;
  ClientBoard = (await vite.ssrLoadModule('/src/games/bang/Client.tsx')).client.Board;
  await vite.waitForRequestsIdle();
} catch (error) { await vite.close(); throw error; }
after(async () => {
  await vite.close();
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

async function host(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  t.mock.method(window, 'setTimeout', (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => setTimeout(callback, delay, ...args) as unknown as number);
  t.mock.method(window, 'clearTimeout', (id: number | undefined) => clearTimeout(id));
  t.mock.method(dom.HTMLImageElement.prototype, 'decode', async () => {});
  const errors = t.mock.method(console, 'error'), warnings = t.mock.method(console, 'warn');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); assert.equal(errors.mock.callCount(), 0, errors.mock.calls.map(call => String(call.arguments)).join('\n')); assert.equal(warnings.mock.callCount(), 0, warnings.mock.calls.map(call => String(call.arguments)).join('\n')); });
  return { container, root, async settle() { for (let i = 0; i < 25; i++) await act(async () => { t.mock.timers.tick(20); await Promise.resolve(); }); } };
}

const cases: { name: string; card: number; kind: DecisionKind; calamity?: boolean }[] = [
  { name: 'BANG! answering Duel', card: 1, kind: { type: 'duel' } },
  { name: 'BANG! answering Indians', card: 1, kind: { type: 'attack_response', kind: 'indians', remaining: 1, checks_left: 0 } },
  { name: 'Calamity Missed! answering Duel', card: 26, kind: { type: 'duel' }, calamity: true },
  { name: 'Calamity Missed! answering Indians', card: 26, kind: { type: 'attack_response', kind: 'indians', remaining: 1, checks_left: 0 }, calamity: true },
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

for (const kind of ['panic', 'cat_balou'] as const) test(`blind ${kind} tray hides faces, confirms a slot, resets on nonce change and stays read-only for observers`, async t => {
  const { container, root, settle } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  const table = game.view.view.table;
  table.waiting = { player: 0, pending_id: 120, kind: { type: 'pick_hand_slot', target: 1, kind, count: 4 } };
  const sent: Action[] = [];
  const render = async (disabled = false) => { await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom, disabled, sendAction: action => sent.push(action) }))); await settle(); };
  await render();
  const pool = container.querySelector('.hand-pool')!;
  assert.match(pool.textContent!, /Chọn 1 lá úp trên tay Minh/);
  assert.equal(pool.querySelectorAll('button[data-hand-slot]').length, 4);
  assert.equal(pool.querySelectorAll('[data-card-id], [data-store-slot], [data-tip], .card-face, .card-name').length, 0);
  assert.ok([...pool.querySelectorAll('img')].every(img => img.alt === '' && img.getAttribute('src')?.includes('/back')));
  await act(() => pool.querySelector<HTMLButtonElement>('[data-hand-slot="2"]')!.click());
  assert.equal(sent.length, 0);
  assert.equal(pool.querySelector('[aria-pressed="true"]')?.getAttribute('data-hand-slot'), '2');
  const second = pool.querySelector<HTMLButtonElement>('[data-hand-slot="1"]')!;
  await act(() => {
    second.focus();
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  assert.equal(document.activeElement?.getAttribute('data-hand-slot'), '2');
  assert.equal(sent.length, 0, 'Arrow focus never sends an action');
  const confirm = () => container.querySelector<HTMLButtonElement>('.game-controls [data-primary-action]')!;
  assert.equal(confirm().disabled, false);
  await act(() => confirm().click());
  assert.deepEqual([...sent], [{ type: 'choose_hand_slot', pending_id: 120, slot: 2 }]);
  table.waiting.pending_id = 121; game.seq += 1;
  await render();
  assert.equal(container.querySelector('.hand-pool [aria-pressed="true"]'), null);
  assert.equal(confirm().disabled, true);
  await render(true);
  assert.ok([...container.querySelectorAll<HTMLButtonElement>('[data-hand-slot]')].every(button => button.disabled));
  table.waiting.player = 1;
  await render();
  assert.match(container.querySelector('.hand-pool')!.textContent!, /Minh đang chọn lá từ tay Minh/);
  assert.ok([...container.querySelectorAll<HTMLButtonElement>('[data-hand-slot]')].every(button => button.disabled));
  game.view = { perspective: 'spectator', view: table };
  await render();
  assert.ok([...container.querySelectorAll<HTMLButtonElement>('[data-hand-slot]')].every(button => button.disabled));
  assert.equal(sent.length, 1);
});

test('claimed store fan cards retain public recipients while available buttons use compact server indices', async t => {
  const { container, root, settle } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  const table = game.view.view.table;
  table.store_slots = 4;
  table.waiting = { player: 0, pending_id: 130, kind: { type: 'general_store' } };
  const sent: Action[] = [];
  const render = async (fxBatch: FxBatch) => { await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom, fxBatch, fxEnabled: false, sendAction: action => sent.push(action) }))); await settle(); };
  await render({ id: 1, events: [{ type: 'store_opened', count: 4 }], waiting: table.waiting });
  table.store_slots = 3; game.seq++; table.waiting.pending_id = 131;
  const batch: FxBatch = { id: 2, events: [{ type: 'store_card_claimed', player: 1, slot: 1 }], waiting: table.waiting };
  await render(batch);
  const pool = container.querySelector('.store-pool')!;
  assert.equal(pool.querySelectorAll('.store-slot').length, 4);
  assert.equal(pool.querySelectorAll('[data-store-slot]').length, 3);
  const claimed = pool.querySelector<HTMLButtonElement>('.is-claimed')!;
  assert.ok(claimed.disabled);
  assert.match(claimed.getAttribute('aria-label')!, /Minh/);
  assert.equal(claimed.dataset.animationRegion, 'store-1');
  assert.equal(pool.querySelectorAll('[data-card-id],[data-tip],.card-face,.card-name').length, 0);
  await act(() => pool.querySelector<HTMLButtonElement>('[data-store-slot="1"]')!.click());
  await render(batch);
  assert.equal(pool.querySelectorAll('.is-claimed').length, 1, 'A repeated render never replays a claim');
  assert.equal(sent.length, 0);
  await act(() => container.querySelector<HTMLButtonElement>('.game-controls [data-primary-action]')!.click());
  assert.deepEqual(sent, [{ type: 'choose_store_slot', pending_id: 131, slot: 1 }]);
  table.store_slots = 2; game.seq++; table.waiting.pending_id = 132;
  await render({ id: 3, events: [{ type: 'store_card_claimed', player: 1, slot: 1 }], waiting: table.waiting });
  assert.equal(pool.querySelectorAll('.is-claimed').length, 2);
  assert.equal(pool.querySelectorAll('[data-animation-region="store-1"]').length, 1, 'Repeated demo recipients keep a unique latest flight origin');
});

for (const kind of [{ type: 'pick_hand_slot', target: 1, kind: 'panic', count: 3 }, { type: 'general_store' }] as const) test(`Sid keyboard healing takes priority over ${kind.type} slots and Escape restores the tray`, async t => {
  const width = Object.getOwnPropertyDescriptor(window, 'innerWidth'), height = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
  t.after(() => { if (width) Object.defineProperty(window, 'innerWidth', width); else Reflect.deleteProperty(window, 'innerWidth'); if (height) Object.defineProperty(window, 'innerHeight', height); else Reflect.deleteProperty(window, 'innerHeight'); });
  const { container, root, settle } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.hand = [1, 26, 37];
  const table = game.view.view.table;
  table.players[0].character = 'sid_ketchum'; table.players[0].health = 2; table.players[0].hand_count = 3;
  table.store_slots = kind.type === 'general_store' ? 4 : 0;
  table.waiting = { player: 0, pending_id: 501, kind };
  const sent: Action[] = [];
  await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom, sendAction: action => sent.push(action) })));
  await settle();
  const board = container.querySelector<HTMLElement>('.bang-board')!;
  const key = async (key: string) => { await act(() => { board.focus(); board.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await settle(); };
  const heal = () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Bỏ 2 lá để hồi máu')!;
  await act(() => heal().click()); await settle();
  assert.equal(container.querySelectorAll('.store-slot:not(:disabled)').length, 0);
  await key('1'); await key('2');
  assert.deepEqual([...container.querySelectorAll<HTMLElement>('.own-hand .hand-cards [aria-pressed="true"]')].map(e => Number(e.dataset.cardId)), [1, 26]);
  assert.equal(container.querySelector('.store-slot.is-picked'), null);
  assert.deepEqual(sent, []);
  await key('Escape');
  assert.equal(container.querySelectorAll('.own-hand .hand-cards [aria-pressed="true"]').length, 0);
  assert.ok(container.querySelector('.store-slot:not(:disabled)'));
  await key('1');
  assert.ok(container.querySelector('.store-slot.is-picked'));
  assert.deepEqual(sent, []);
  await act(() => heal().click()); await settle();
  await key('1'); await key('2'); await key('Enter');
  assert.deepEqual(sent, [{ type: 'sid_heal', pending_id: null, discard: [1, 26] }]);
});

for (const reason of ['dynamite', 'jail'] as const) for (const lucky of [false, true]) test(`${reason} instructions describe ${lucky ? 'Lucky Duke choosing from two draws' : 'one draw'}`, async t => {
  const { container, root, settle } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.table.players[0].character = lucky ? 'lucky_duke' : 'sid_ketchum';
  game.view.view.table.waiting = { player: 0, pending_id: 502, kind: { type: 'check', reason } };
  await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom })));
  await settle();
  assert.ok(container.querySelector('.check-controls [role="status"]')!.textContent!.includes(lucky ? 'lật 2 lá, chọn 1 lá' : 'lật 1 lá'));
});

test('tidy equipment keeps grouped DOM order, authoritative chips, equal risk sizes and direct face selection', async t => {
  const width = Object.getOwnPropertyDescriptor(window, 'innerWidth'), height = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
  t.after(() => { if (width) Object.defineProperty(window, 'innerWidth', width); else Reflect.deleteProperty(window, 'innerWidth'); if (height) Object.defineProperty(window, 'innerHeight', height); else Reflect.deleteProperty(window, 'innerHeight'); });
  const { container, root, settle } = await host(t);
  const { orderedEquipment } = await import('./equipment.ts');
  const { cardCatalog } = await import('./cardCatalog.ts');
  const id = (kind: string) => cardCatalog.findIndex(card => card.kind === kind);
  const equipped = ['jail', 'scope', 'volcanic', 'dynamite', 'winchester', 'barrel', 'mustang', 'schofield'].map(id);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  const table = game.view.view.table;
  game.view.view.hand = [43, 1, 26];
  table.turn.player = 0; table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } };
  table.players[0].in_play = [...equipped]; table.players[0].weapon_range = 5; table.players[0].jail_turns_left = 0;
  table.players[1].in_play = [...equipped]; table.players[1].weapon_range = 4; table.players[1].jail_turns_left = 0;
  const sent: Action[] = [];
  await act(async () => root.render(createElement(GameBoard, { game, room: demoRoom, sendAction: action => sent.push(action) })));
  await settle();
  const own = container.querySelector('.own-hand .own-equipment')!;
  assert.ok(own);
  assert.equal(container.querySelector('.hud-jail')?.textContent, 'Bị Jail · 0 lượt');
  assert.match(container.querySelector('.hud-jail')!.getAttribute('aria-label')!, /đã chờ đủ 3 lượt/);
  assert.ok(container.querySelector('.own-character-tip.is-jailed .own-jail-cage'));
  assert.ok(container.querySelector('.own-character-tip [data-animation-anchor="0"]'));
  assert.equal(container.querySelector('.own-hand [data-animation-anchor="0"]'), null);
  assert.ok(container.querySelector('.own-hand > .quiet-controls'), 'Quiet controls share the equipment stack');
  assert.equal(own.querySelector('.equipment-heading')?.textContent, 'Trước mặt bạn · Tầm bắn 5');
  const opponent = container.querySelector('[data-player-id="1"] .equipment-rack')!;
  assert.equal(opponent.querySelector('.equipment-range')?.textContent, 'Tầm 4');
  assert.equal(opponent.querySelector<HTMLElement>('.equipment-card')!.style.width, '44px', 'Keep the E equipment minimum size');
  for (const rack of [own, opponent]) {
    assert.deepEqual([...rack.querySelectorAll<HTMLElement>('.equipment-card')].map(card => Number(card.dataset.cardId)), orderedEquipment(equipped));
    const sizes = [...rack.querySelectorAll<HTMLElement>('.equipment-card')].map(card => card.style.width);
    assert.ok(sizes.every(size => size === sizes[0]), 'Dynamite/Jail use the same width as ordinary equipment');
    assert.equal(rack.querySelector('.equipment-edges'), null, 'Risk borders stay inside their own cards');
    assert.deepEqual([...rack.querySelectorAll<HTMLElement>('.equipment-card')].map(card => card.style.zIndex), equipped.map((_, index) => String(index + 1)), 'Risk cards follow the same stacking order as every card');
  }
  assert.equal(opponent.querySelector('.jail-turns')?.textContent, '0');
  assert.match(opponent.querySelector('.equipment-jail')!.getAttribute('aria-description')!, /đã chờ đủ 3 lượt/);
  assert.ok([...container.querySelectorAll('.game-card img')].every(img => img.getAttribute('loading') === 'eager'));
  const barrel = opponent.querySelector<HTMLButtonElement>(`[data-card-id="${id('barrel')}"]`)!;
  const jail = opponent.querySelector<HTMLButtonElement>('.equipment-jail')!;
  await act(async () => { barrel.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); t.mock.timers.tick(100); });
  assert.equal(document.querySelector('.card-preview'), null, 'Preview waits 120ms');
  await act(async () => { jail.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); t.mock.timers.tick(100); });
  assert.equal(document.querySelector('.card-preview'), null, 'Moving quickly restarts the preview delay');
  await act(async () => { jail.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })); t.mock.timers.tick(200); });
  assert.equal(document.querySelector('.card-preview'), null, 'Leaving cancels the pending preview');
  await act(() => barrel.focus()); await settle();
  assert.equal(document.activeElement, barrel);
  const preview = document.querySelector('.card-preview')!;
  assert.ok(preview?.querySelector('img')?.getAttribute('src')?.includes('barile'));
  assert.equal(preview.querySelector('strong')?.textContent, 'Barrel');
  assert.equal(barrel.getAttribute('aria-describedby'), preview.id);
  await act(() => opponent.querySelector('.equipment-jail')!.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
  assert.ok(document.querySelector('.card-preview'), 'A late leave event from another card must not hide the focused preview');
  await act(() => container.querySelector('.board-scene')!.dispatchEvent(new Event('scroll', { bubbles: true })));
  assert.equal(barrel.getAttribute('aria-describedby'), preview.id, 'Focus scroll repositions the preview without removing its description');
  await act(() => container.querySelector('.bang-board')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('.card-preview'), null, 'Escape also dismisses previews from the outer board shortcut target');
  await act(() => { barrel.blur(); barrel.focus(); }); await settle();
  assert.ok(document.querySelector('.card-preview'));
  await act(() => { const board = container.querySelector<HTMLElement>('.bang-board')!; board.focus(); board.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); });
  assert.equal(container.querySelector('.own-hand .hand-cards [data-card-id="43"]')?.getAttribute('aria-pressed'), 'true', '1 selects the first hand card, not the equipment above it');
  assert.equal(document.querySelector('.card-preview'), null, 'Choosing a card dismisses its preview immediately');
  assert.match(barrel.getAttribute('aria-label')!, /^Chọn Barrel/);
  await act(() => barrel.click());
  assert.equal(barrel.getAttribute('aria-pressed'), 'true');
  await settle();
  const confirm = [...container.querySelectorAll<HTMLButtonElement>('.game-controls [data-primary-action="true"]:not(:disabled)')].find(button => !button.closest('[inert]'))!;
  assert.match(confirm.textContent!, /^Chơi/);
  await act(() => confirm.click());
  assert.deepEqual([...sent], [{ type: 'affect_card', card: 43, target: 1, selection: { in_play: id('barrel') } }]);
});

test('public equipment drops respect covering ribbons and raised faces above later cards', async t => {
  const { container, root } = await host(t);
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.hand = [43];
  game.view.view.table.turn.player = 0;
  game.view.view.table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } };
  game.view.view.table.players[1].in_play = [63, 64];
  let drag: ReturnType<typeof DragHook>;
  const sent: Action[] = [];
  const drafts: ActionDraft[] = [];
  function Harness() {
    const stage = useRef<HTMLDivElement>(null);
    drag = useCardDrag({ root: stage, game, draft: emptyDraft, locked: false, ready: true, desktop: true, requestVersion: 0, error: null, setDraft: draft => drafts.push(draft), clearDetail() {}, send: action => sent.push(action) });
    return createElement('div', { ref: stage }, createElement('div', { 'data-player-id': 1 }, createElement('button', { className: 'seat-person' }), ...[63, 64].map(id => createElement('button', { className: 'equipment-card', 'data-card-id': id, key: id, style: { zIndex: id === 63 ? 40 : 2 } }, createElement('span', { className: 'card-visual' })))));
  }
  await act(async () => root.render(createElement(Harness)));
  for (const face of container.querySelectorAll('.card-visual')) t.mock.method(face, 'getBoundingClientRect', () => ({ x: 100, y: 100, width: 44, height: 70 }));
  t.mock.method(container.querySelector('.seat-person')!, 'getBoundingClientRect', () => ({ x: 100, y: 90, width: 44, height: 30 }));
  const home = { x: 400, y: 500, width: 56, height: 90 };
  await act(() => drag.props(43).start(home));
  await act(() => { assert.equal(drag.props(43).end({ x: 120, y: 110 }, home), true); });
  assert.equal(drafts.at(-1)?.target, 1);
  assert.equal(drafts.at(-1)?.selection, null);
  assert.deepEqual(sent, [], 'The covering ribbon selects its player without guessing a hidden face');
  await act(() => drag.props(43).start(home));
  await act(() => { assert.equal(drag.props(43).end({ x: 120, y: 130 }, home), true); });
  assert.deepEqual(sent, [{ type: 'affect_card', card: 43, target: 1, selection: { in_play: 63 } }]);
});

test('BANG portals and audio gesture listeners belong to the mounted game and clean up on exit', async t => {
  const fx = await host(t);
  let closed = 0;
  const previousAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class {
    state = 'suspended'; destination = {};
    createGain() { return { gain: { value: 0 }, connect() {} }; }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; closed++; }
  } });
  t.after(() => { if (previousAudio) Object.defineProperty(globalThis, 'AudioContext', previousAudio); else Reflect.deleteProperty(globalThis, 'AudioContext'); });
  const added = t.mock.method(document, 'addEventListener'), removed = t.mock.method(document, 'removeEventListener');
  await act(async () => fx.root.render(createElement(GameBoard, { game: demoGame, room: demoRoom, fxEnabled: false, ambientEnabled: false })));
  const portal = document.querySelector<HTMLElement>('[data-bang-portal]');
  assert.ok(portal);
  assert.ok(portal.classList.contains('game-bang'));
  assert.equal(fx.container.querySelector('[data-bang-root]')!.getAttribute('data-bang-root'), portal.id);
  const gesture = added.mock.calls.find(call => call.arguments[0] === 'touchend')!.arguments[1];
  await act(() => document.dispatchEvent(new Event('touchend', { bubbles: true })));
  await act(async () => fx.root.render(null));
  assert.equal(document.querySelector('[data-bang-portal]'), null);
  assert.equal(closed, 1);
  assert.ok(removed.mock.calls.some(call => call.arguments[0] === 'touchend' && call.arguments[1] === gesture));
});

for (const success of [true, false]) test(`real Client drag ${success ? 'waits for the queued success snapshot before settling the pong' : 'rolls back a real error without waiting for a snapshot'}`, async t => {
  const { container, root, settle } = await host(t);
  const width = Object.getOwnPropertyDescriptor(window, 'innerWidth'), height = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  t.after(() => { if (width) Object.defineProperty(window, 'innerWidth', width); else Reflect.deleteProperty(window, 'innerWidth'); if (height) Object.defineProperty(window, 'innerHeight', height); else Reflect.deleteProperty(window, 'innerHeight'); });
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw Error('Player fixture required');
  game.view.view.hand = [1];
  game.view.view.table.waiting = { player: 0, pending_id: 404, kind: { type: 'duel' } };
  type Sample = { controller: ReturnType<typeof DragHook>; game: BangSnapshot; requestVersion: number; locked: boolean };
  let sample!: Sample;
  const phases: (string | undefined)[] = [];
  const previousProbe = Object.getOwnPropertyDescriptor(globalThis, '__bangDragProbe');
  Object.defineProperty(globalThis, '__bangDragProbe', { configurable: true, value: (next: Sample) => { sample = next; phases.push(next.controller.flight?.phase); } });
  t.after(() => { if (previousProbe) Object.defineProperty(globalThis, '__bangDragProbe', previousProbe); else Reflect.deleteProperty(globalThis, '__bangDragProbe'); });
  const connection = {};
  const requests = createRequestTracker<typeof connection>(() => assert.fail('The pong must cancel the watchdog'));
  const sent: GameAction[] = [];
  let receive!: (message: ServerMessage) => void;
  let nonce!: number;
  function Harness() {
    const [sync, setSync] = useState(() => receiveGameState(initialGameState, { v: PROTOCOL_VERSION, type: 'joined', voice_enabled: false, room_code: demoRoom.code, token: 'test', room: demoRoom, game: { ...game, view: { game: 'bang', payload: game.view } } }));
    const [pending, setPending] = useState(false), [requestVersion, setRequestVersion] = useState(0), [error, setError] = useState<string | null>(null);
    const consume = useCallback((through: number) => setSync(current => consumeFrames(current, through)), []);
    receive = message => {
      setSync(current => receiveGameState(current, message));
      if (message.type === 'error') setError(message.message);
      if (requests.finish(connection, message)) { setPending(false); setRequestVersion(version => version + 1); }
    };
    return createElement(ClientBoard, { room: demoRoom, sync, consume, pending, disabled: pending, requestVersion, actionError: error, actionErrorCode: error ? 'illegal_action' : null, fxEnabled: true, roomMenu: null,
      sendAction: action => { const started = requests.start(connection); assert.notEqual(started, null); nonce = started!; sent.push(action); setPending(true); }, endGame() {}, leaveRoom() {}, hostSkip() {} });
  }
  await act(async () => root.render(createElement(Harness))); await settle();
  assert.equal(sample.game.seq, 17); assert.equal(sample.requestVersion, 0); assert.equal(sample.locked, false);
  t.mock.method(container.querySelector('.table-center')!, 'getBoundingClientRect', () => ({ x: 400, y: 250, width: 200, height: 150 }));
  const home = { x: 600, y: 600, width: 64, height: 100 };
  await act(() => sample.controller.props(1).start(home));
  await act(() => assert.equal(sample.controller.props(1).end({ x: 500, y: 300 }, home), true));
  assert.deepEqual(sent, [{ game: 'bang', payload: { type: 'respond', pending_id: 404, card: 1 } }]);
  assert.equal(sample.controller.flight?.phase, 'pending');
  if (success) {
    const next = structuredClone(game.view);
    if (next.perspective !== 'player') throw Error('Player fixture required');
    next.view.hand = []; next.view.table.players[0].hand_count = 0;
    await act(() => {
      receive({ v: PROTOCOL_VERSION, type: 'game_update', seq: 18, update: { game: 'bang', events: [], view: next } });
      receive({ v: PROTOCOL_VERSION, type: 'pong', nonce });
    });
    assert.equal(requests.pending, false, 'The matching pong finishes the transport barrier immediately');
    assert.equal(sample.game.seq, 17, 'The rendering queue has not run its timer yet');
    assert.ok(!phases.includes('rollback'), 'Pong must not roll back a card while its success snapshot is queued');
    assert.equal(sample.controller.flight?.phase, 'pending');
    assert.equal(sample.requestVersion, 0, 'Board must not settle a barrier ahead of its queued snapshot');
    assert.equal(sample.locked, true, 'Input stays locked only for the existing queue drain');
    await act(() => t.mock.timers.tick(0));
    assert.equal(sample.game.seq, 18); assert.equal(sample.requestVersion, 1);
    assert.ok(phases.includes('accepted'), 'The drained snapshot accepts the card');
    assert.ok(!phases.includes('rollback'), 'A successful card must never fly back to the hand');
  } else {
    await act(() => receive({ v: PROTOCOL_VERSION, type: 'error', code: 'illegal_action', message: 'Hành động bị từ chối' }));
    assert.ok(phases.includes('rollback'), 'A real error rolls back even before its pong');
    assert.equal(requests.pending, true, 'An error cannot finish the transport barrier');
    await act(() => receive({ v: PROTOCOL_VERSION, type: 'pong', nonce }));
    assert.equal(requests.pending, false);
    assert.equal(sample.game.seq, 17); assert.equal(sample.requestVersion, 1);
    assert.ok(!phases.includes('accepted'), 'An error cannot accept the card');
  }
  assert.equal(sample.locked, false, 'Neither path adds an extra timer to unlock input');
});
