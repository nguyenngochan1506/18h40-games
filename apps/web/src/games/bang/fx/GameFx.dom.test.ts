import { PROTOCOL_VERSION } from '../../../generated/protocol.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement, Fragment } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type GameFxComponent from './GameFx.tsx';
import type { FxBatch } from './fx.ts';
import { demoGame, demoRoom } from '../demo/demo.ts';
import { prepareFlights } from './flightLayout.ts';
import { scheduleFx } from './fx.ts';
import { demoFx } from '../demo/demoFx.ts';
import { initialGameState, receiveGameState, selectGameView } from '../testSupport.ts';

const dom = new Window({ url: 'http://localhost/', settings: { enableImageFileLoading: false, enableCSSFileLoading: false, disableJavaScriptFileLoading: true } });
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Image: dom.Image, Event: dom.Event, EventTarget: dom.EventTarget, getComputedStyle: dom.getComputedStyle.bind(dom), matchMedia: dom.matchMedia.bind(dom), IS_REACT_ACT_ENVIRONMENT: true };
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
Object.defineProperties(HTMLElement.prototype, {
  animate: { configurable: true, writable: true, value() { throw new Error('Install the test animation clock before rendering'); } },
  getAnimations: { configurable: true, writable: true, value: () => [] },
});
const { createRoot } = await import('react-dom/client');
// Vite already knows how to load the component's TSX, CSS and extensionless imports.
const vite = await createServer({ root: fileURLToPath(new URL('../../../..', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, watch: null } });
let GameFx: typeof GameFxComponent;
try { GameFx = (await vite.ssrLoadModule('/src/games/bang/fx/GameFx.tsx')).default; }
finally { await vite.close(); }

after(async () => {
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

type Props = ComponentProps<typeof GameFxComponent>;
const ctx = { players: selectGameView(demoGame.view).table.players, seats: demoGame.seats, you: 0 };
const burst = (id: number): FxBatch => ({ id, events: Array.from({ length: 20 }, () => ({ type: 'health_changed' as const, player: 1, source: 0, delta: -1, health: 1 })), waiting: null });

async function mount(t: TestContext, initial: FxBatch | null = null, state = { hidden: false, reduced: false }, scene?: (props: Props) => ReactNode) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const pending = new Set<ReturnType<typeof setTimeout>>(), intervals = new Set<ReturnType<typeof setInterval>>();
  let callbacks = 0, peak = 0, started = 0;
  const animationFrames: (Keyframe[] | PropertyIndexedKeyframes | null)[] = [];
  const timeout = setTimeout, cancelTimeout = clearTimeout, interval = setInterval, cancelInterval = clearInterval;
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const handle = timeout(() => { pending.delete(handle); callbacks++; callback(...args); }, delay);
    pending.add(handle); return handle;
  });
  t.mock.method(globalThis, 'clearTimeout', (handle: Parameters<typeof clearTimeout>[0]) => { pending.delete(handle as ReturnType<typeof setTimeout>); cancelTimeout(handle); });
  t.mock.method(globalThis, 'setInterval', (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const handle = interval(() => { callbacks++; callback(...args); }, delay); intervals.add(handle); return handle;
  });
  t.mock.method(globalThis, 'clearInterval', (handle: Parameters<typeof clearInterval>[0]) => { intervals.delete(handle as ReturnType<typeof setInterval>); cancelInterval(handle); });
  t.mock.method(window, 'setTimeout', (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => setTimeout(callback, delay, ...args) as unknown as number);
  t.mock.method(window, 'setInterval', (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => setInterval(callback, delay, ...args) as unknown as number);
  t.mock.getter(document, 'hidden', () => state.hidden);
  const media = Object.assign(new EventTarget(), { matches: state.reduced, media: '(prefers-reduced-motion: reduce)' });
  t.mock.method(globalThis, 'matchMedia', () => media as unknown as MediaQueryList);
  t.mock.method(dom.HTMLCanvasElement.prototype, 'getContext', () => null);
  t.mock.method(HTMLElement.prototype, 'getAnimations', () => []);
  t.mock.method(HTMLElement.prototype, 'animate', (_frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) => {
    animationFrames.push(_frames);
    const timing = typeof options === 'number' ? { duration: options } : options;
    const animation = { onfinish: null as Animation['onfinish'], cancel: () => clearTimeout(handle), pause() {}, currentTime: 0 };
    const handle = setTimeout(() => animation.onfinish?.call(animation as unknown as Animation, new Event('finish') as AnimationPlaybackEvent), Number(timing?.duration ?? 0) + Number(timing?.delay ?? 0));
    return animation as unknown as Animation;
  });
  const addDocument = t.mock.method(document, 'addEventListener'), removeDocument = t.mock.method(document, 'removeEventListener');
  const addMedia = t.mock.method(media, 'addEventListener'), removeMedia = t.mock.method(media, 'removeEventListener');
  const errors = t.mock.method(console, 'error');
  const stage = document.createElement('div'); stage.className = 'game-bang'; document.body.append(stage);
  const root = createRoot(stage);
  let mounted = true;
  let props: Props = { batch: initial, ctx, enabled: true, width: 1280, height: 720, ambientEnabled: false };
  const render = async (next: Partial<Props>) => { props = { ...props, ...next }; await act(() => root.render(createElement(Fragment, null, scene?.(props), createElement(GameFx, props)))); };
  await render({});
  const layer = stage.querySelector<HTMLElement>('.fx-layer')!;
  const append = layer.append;
  t.mock.method(layer, 'append', (...nodes: (Node | string)[]) => { append.apply(layer, nodes); started++; peak = Math.max(peak, layer.children.length); });
  const tick = async (ms: number) => { await act(() => t.mock.timers.tick(ms)); };
  const visibility = async (hidden: boolean) => { await act(() => { state.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); }); };
  const reduced = async (value: boolean) => { await act(() => { media.matches = value; media.dispatchEvent(new Event('change')); }); };
  const unmount = async () => { if (mounted) { await act(() => root.unmount()); mounted = false; } };
  t.after(async () => { await unmount(); stage.remove(); assert.equal(errors.mock.callCount(), 0, 'No React state/update errors'); });
  return { stage, layer, render, tick, animationFrames, visibility, reduced, unmount, pending, intervals, counts: () => ({ callbacks, peak, started }), listenersRemoved() {
    for (const call of addDocument.mock.calls.filter(call => call.arguments[0] === 'visibilitychange')) assert.ok(removeDocument.mock.calls.some(removed => removed.arguments[0] === call.arguments[0] && removed.arguments[1] === call.arguments[1]));
    for (const call of addMedia.mock.calls) assert.ok(removeMedia.mock.calls.some(removed => removed.arguments[0] === call.arguments[0] && removed.arguments[1] === call.arguments[1]));
  } };
}

test('GameFx unmount cancels queued cues, animation timers and state listeners before they can run again', async t => {
  const fx = await mount(t);
  await fx.render({ batch: burst(1) });
  await fx.tick(0);
  assert.equal(fx.layer.children.length, 6);
  assert.ok(fx.pending.size > 0); assert.equal(fx.intervals.size, 1);
  await fx.unmount();
  assert.equal(fx.pending.size, 0, 'Unmount must cancel pending timeouts, including delayed cues and the batch deadline');
  assert.equal(fx.intervals.size, 0, 'Unmount must cancel the atmosphere interval');
  fx.listenersRemoved();
  const before = fx.counts();
  await fx.visibility(true); await fx.reduced(true); await fx.tick(10_000);
  assert.deepEqual(fx.counts(), before, 'No timer or state-source callback may execute after unmount');
  assert.equal(fx.layer.children.length, 0, 'Detached FX root must stay empty');
});

test('GameFx changing the view cancels pending cues without replaying the same batch', async t => {
  const fx = await mount(t);
  await fx.render({ batch: burst(1) });
  await fx.tick(0);
  const started = fx.counts().started;
  await fx.render({ width: 1920, height: 1080 });
  assert.equal(fx.pending.size, 0, 'A view change must cancel every old timeout');
  await fx.tick(10_000);
  assert.equal(fx.counts().started, started);
  assert.equal(fx.layer.children.length, 0);
});

test('GameFx snapshots and remounts never replay events from joined/rejoin', async t => {
  const joined = receiveGameState(initialGameState, { v: PROTOCOL_VERSION, type: 'joined', voice_enabled: false, room_code: demoRoom.code, token: 'snapshot', room: demoRoom, game: demoGame });
  const fx = await mount(t, { id: demoGame.seq, events: demoFx.shot.events, waiting: null });
  await fx.tick(3000);
  assert.equal(fx.counts().started, 0, 'An initial batch is a snapshot marker');
  await fx.render({ batch: burst(demoGame.seq + 1) });
  await fx.tick(0);
  assert.ok(fx.counts().started > 0);
  await fx.render({ batch: joined.fxBatch });
  const started = fx.counts().started;
  await fx.tick(3000);
  assert.equal(fx.counts().started, started);
  assert.equal(fx.layer.children.length, 0);
});

for (const mode of ['hidden', 'reduced'] as const) test(`GameFx skips ${mode} batches, cancels queued effects and does not replay on resume`, async t => {
  const fx = await mount(t);
  const toggle = mode === 'hidden' ? fx.visibility : fx.reduced;
  await fx.render({ batch: burst(1) }); await fx.tick(0);
  await toggle(true);
  assert.equal(fx.pending.size, 0);
  assert.equal(fx.layer.children.length, 0);
  await fx.render({ batch: burst(2) }); await fx.tick(3000);
  const started = fx.counts().started;
  await toggle(false); await fx.tick(3000);
  assert.equal(fx.counts().started, started, 'A skipped batch must be marked seen');
  assert.equal(fx.layer.children.length, 0);
});

test('GameFx caps live DOM effects at six and removes the batch within its 2400ms budget', async t => {
  const fx = await mount(t);
  await fx.render({ batch: burst(1) });
  for (let time = 0; time <= 2400; time += 50) { await fx.tick(time ? 50 : 0); assert.ok(fx.layer.children.length <= 6); }
  assert.equal(fx.counts().peak, 6, 'The test must actually saturate the FX lanes');
  assert.equal(fx.layer.children.length, 0);
  await fx.tick(50);
  assert.equal(fx.pending.size, 0);
});

test('GameFx rapid seq/events changes replace delayed work and duplicate batches do not double emit', async t => {
  const fx = await mount(t);
  await fx.render({ batch: burst(1) });
  await fx.render({ batch: { id: 2, events: demoFx.shot.events, waiting: null } });
  await fx.tick(0);
  assert.ok(fx.layer.children.length > 0);
  assert.ok([...fx.layer.children].every(node => (node as HTMLElement).dataset.batch === '2'));
  const started = fx.counts().started;
  await fx.render({ batch: { id: 2, events: demoFx.explosion.events, waiting: null } });
  await fx.tick(3000);
  assert.equal(fx.counts().started, started, 'A duplicate seq with a fresh events object must not replay');
  assert.equal(fx.pending.size, 0); assert.equal(fx.layer.children.length, 0);
});


test('card flights end at measured anchor centers independently of card size', async t => {
  const fx = await mount(t);
  for (const [region, rect] of [['draw', { x: 200, y: 100, width: 64, height: 100 }], ['hand', { x: 600, y: 600, width: 400, height: 100 }], ['table', { x: 400, y: 300, width: 200, height: 120 }]] as const) {
    const anchor = document.createElement('div'); anchor.dataset.animationRegion = region; fx.stage.append(anchor);
    t.mock.method(anchor, 'getBoundingClientRect', () => rect as DOMRect);
  }
  await fx.render({ batch: { id: 1, events: [{ type: 'cards_drawn', player: 0, count: 1 }], waiting: null } });
  await fx.tick(0);
  const flight = fx.animationFrames.find(frames => Array.isArray(frames) && frames.length === 3 && String(frames[2].transform).includes('translate(568px,500px)')) as Keyframe[];
  assert.ok(flight);
  assert.ok(String(flight[1].transform).includes('translate(312.40000000000003px,200px)'));
  assert.ok(String(flight[2].transform).includes('translate(568px,500px) translate(-50%,-50%)'));
});

test('equipment arrivals use the actual public face rect inside the moved rack', async t => {
  const fx = await mount(t);
  const hand = document.createElement('div'); hand.dataset.animationRegion = 'hand'; fx.stage.append(hand);
  t.mock.method(hand, 'getBoundingClientRect', () => ({ x: 400, y: 500, width: 200, height: 100 }) as DOMRect);
  const rack = document.createElement('div'); rack.dataset.animationRegion = 'equipment-1'; fx.stage.append(rack);
  t.mock.method(rack, 'getBoundingClientRect', () => ({ x: 100, y: 100, width: 180, height: 80 }) as DOMRect);
  const target = document.createElement('button'); target.dataset.cardId = '66'; rack.append(target);
  const face = document.createElement('span'); face.className = 'game-art'; target.append(face);
  t.mock.method(face, 'getBoundingClientRect', () => ({ x: 120, y: 160, width: 40, height: 60 }) as DOMRect);
  await fx.render({ batch: { id: 1, events: [{ type: 'card_played', player: 0, card: 66, target: 1 }, { type: 'card_equipped', player: 1, card: 66 }], waiting: null } });
  await fx.tick(0);
  const flight = fx.animationFrames.find(frames => Array.isArray(frames) && frames.length === 3 && String(frames[2].transform).includes('translate(-360px,-360px)')) as Keyframe[];
  assert.ok(flight, 'The flight lands at the actual equipment face, not the rack center');
});

test('blind store flights start at the measured claimed fan card without a face', async t => {
  const fx = await mount(t);
  const slot = document.createElement('button'); slot.dataset.animationRegion = 'store-1'; fx.stage.append(slot);
  t.mock.method(slot, 'getBoundingClientRect', () => ({ x: 350, y: 250, width: 64, height: 100 }) as DOMRect);
  await fx.render({ batch: { id: 1, events: [{ type: 'store_card_claimed', player: 1, slot: 2 }], waiting: null } });
  await fx.tick(0);
  const flight = fx.layer.querySelector<HTMLElement>('.fx-cue-card')!;
  assert.equal(flight.style.left, '382px');
  assert.equal(flight.style.top, '300px');
  assert.ok(flight.querySelector('img')!.src.includes('/back'));
});

test('own Jail stays in the portrait while other players keep their actor cages', async t => {
  const fx = await mount(t);
  const players = structuredClone(ctx.players);
  for (const player of players) { player.alive = true; player.in_play = player.id < 2 ? [66] : []; }
  const own = document.createElement('span'); own.dataset.animationAnchor = '0'; fx.stage.append(own);
  const other = document.createElement('span'); other.dataset.animationAnchor = '1'; fx.stage.append(other);
  t.mock.method(own, 'getBoundingClientRect', () => ({ x: 100, y: 600, width: 1, height: 1 }) as DOMRect);
  t.mock.method(other, 'getBoundingClientRect', () => ({ x: 200, y: 200, width: 1, height: 1 }) as DOMRect);
  await fx.render({ ctx: { ...ctx, players } });
  const cages = fx.stage.querySelectorAll<HTMLElement>('.fx-persistent-jail');
  assert.equal(cages.length, 1, 'The own cage belongs to the portrait, never the full-table overlay');
  assert.equal(cages[0].style.left, '200.5px');
  assert.equal(cages[0].style.top, '200.5px');
  await fx.render({ ctx: { ...ctx, players, you: null } });
  assert.equal(fx.stage.querySelectorAll('.fx-persistent-jail').length, 2, 'Spectators still see every jailed actor');
});

test('manual flip pauses after its flight, uses two faces and cancels every animation on interruption', async t => {
  const fx = await mount(t);
  await fx.render({ batch: { id: 1, events: demoFx.barrel_good.events, waiting: demoFx.barrel_good.waiting } }); await fx.tick(0);
  assert.equal(fx.layer.querySelectorAll('.fx-check-back[data-face="back"]').length, 1);
  assert.equal(fx.layer.querySelectorAll('.fx-check-front[data-face="public"]').length, 1);
  assert.equal(fx.layer.querySelector('[data-result="good"] .fx-label')!.textContent, 'ĐỠ ĐƯỢC!');
  const flip = fx.animationFrames.find(frames => Array.isArray(frames) && frames[0].transform === 'rotateY(0deg)') as Keyframe[];
  assert.equal(flip[1].offset, 650 / 1400);
  assert.ok(Math.abs(Number(flip[2].offset) - 850 / 1400) < 1e-12);
  await fx.tick(400);
  await fx.render({ batch: { id: 2, events: demoFx.dynamite_end.events, waiting: null } }); await fx.tick(0);
  assert.equal(fx.layer.querySelector('.fx-cue-check'), null);
  assert.ok(fx.layer.querySelector('.fx-cue-extinguish .fx-smokeA'));
  await fx.unmount(); assert.equal(fx.pending.size, 0); assert.equal(fx.intervals.size, 0);
});

test('Lucky pairs stagger 250ms, highlight the selected face, and discard private history on a viewer change', async t => {
  const fx = await mount(t);
  await fx.render({ batch: { id: 1, events: demoFx.lucky_offer.events, waiting: demoFx.lucky_offer.waiting } }); await fx.tick(0);
  assert.equal(fx.layer.querySelectorAll('.fx-check-front[data-face="public"]').length, 2);
  const flips = fx.animationFrames.filter(frames => Array.isArray(frames) && frames[0].transform === 'rotateY(0deg)') as Keyframe[][];
  assert.ok(Math.abs((Number(flips[1][1].offset) - Number(flips[0][1].offset)) * 1400 - 250) < .01);
  await fx.tick(1500);
  await fx.render({ batch: { id: 2, events: demoFx.lucky_chosen.events, waiting: demoFx.lucky_chosen.waiting } }); await fx.tick(0);
  assert.ok(fx.layer.querySelector('.is-chosen .fx-check-front[data-face="public"]'));
  assert.ok(fx.layer.querySelector('.is-rejected .fx-check-front[data-face="public"]'));
  await fx.render({ ctx: { ...ctx, you: null } });
  assert.equal(fx.layer.children.length, 0);
  await fx.render({ batch: { id: 3, events: demoFx.lucky_offer.events, waiting: demoFx.lucky_offer.waiting } }); await fx.tick(0);
  assert.equal(fx.layer.querySelectorAll('[data-face="public"]').length, 0);
  await fx.render({ batch: { id: 4, events: demoFx.lucky_chosen.events, waiting: demoFx.lucky_chosen.waiting } }); await fx.tick(0);
  assert.equal(fx.layer.querySelectorAll('[data-face="public"]').length, 1);
});

test('Jail held shakes the existing cage, while expiry, theft and death clear persistent cages', async t => {
  const fx = await mount(t);
  const players = structuredClone(ctx.players);
  for (const player of players) { player.alive = true; player.in_play = player.id === 1 ? [66] : []; }
  await fx.render({ ctx: { ...ctx, players }, batch: { id: 1, events: demoFx.jail_held.events, waiting: null } }); await fx.tick(0);
  assert.equal(fx.stage.querySelectorAll('.fx-persistent-jail').length, 1);
  await fx.tick(850);
  assert.ok(fx.animationFrames.some(frames => Array.isArray(frames) && frames.some(frame => String(frame.transform).includes('translateX(8px)'))));
  for (const [index, events] of [demoFx.jail_expired.events, [{ type: 'in_play_card_affected' as const, source: 0, target: 1, card: 66, kind: 'panic' as const }], [{ type: 'player_eliminated' as const, player: 1, role: 'outlaw' as const }]].entries()) {
    await fx.render({ ctx: { ...ctx, players: structuredClone(players) } });
    const removed = structuredClone(players); removed[1].in_play = []; removed[1].alive = index !== 2;
    await fx.render({ ctx: { ...ctx, players: removed }, batch: { id: index + 2, events, waiting: null } }); await fx.tick(0);
    assert.equal(fx.stage.querySelectorAll('.fx-persistent-jail').length, 0);
    if (index === 0) assert.ok(fx.layer.querySelector('.fx-cue-escape .fx-jail'));
  }
  await fx.tick(2500); assert.equal(fx.layer.children.length, 0); assert.equal(fx.pending.size, 0);
});

test('reduced motion shows a short static result without faces, particles or WAAPI and never replays it', async t => {
  const fx = await mount(t, null, { hidden: false, reduced: true });
  await fx.render({ batch: { id: 1, events: demoFx.barrel_good.events, waiting: demoFx.barrel_good.waiting } }); await fx.tick(0);
  assert.equal(fx.layer.querySelector('.fx-static[data-result="good"] .fx-label')!.textContent, 'ĐỠ ĐƯỢC!');
  assert.equal(fx.layer.querySelector('img,.fx-check-card,.fx-smokeA'), null);
  assert.equal(fx.animationFrames.length, 0); assert.equal(fx.stage.querySelector('canvas'), null);
  await fx.tick(701); assert.equal(fx.layer.children.length, 0);
  await fx.reduced(false); await fx.tick(3000); assert.equal(fx.layer.children.length, 0);
  await fx.unmount(); assert.equal(fx.pending.size, 0); assert.equal(fx.intervals.size, 0);
});

function rectangle(t: TestContext, node: Element, x: number, y: number, width: number, height: number) {
  t.mock.method(node, 'getBoundingClientRect', () => ({ x, y, width, height }) as DOMRect);
}

test('new hand cards stay hidden until the measured draw flight lands, and snapshot interruption restores them', async t => {
  const fx = await mount(t);
  const draw = document.createElement('div'); draw.dataset.animationRegion = 'draw'; fx.stage.append(draw); rectangle(t, draw, 100, 100, 54, 84);
  const hand = document.createElement('div'); hand.className = 'own-hand'; hand.innerHTML = '<div class="hand-cards" data-animation-region="hand"><button data-card-id="10"><span class="card-visual"></span></button></div>'; fx.stage.append(hand);
  const target = hand.querySelector<HTMLElement>('button')!; rectangle(t, target.querySelector('span')!, 700, 600, 56, 87);
  await fx.render({ batch: { id: 1, events: [{ type: 'cards_drawn', player: 0, count: 1 }, { type: 'cards_received', player: 0, cards: [10] }], waiting: null } });
  assert.equal(target.style.visibility, 'hidden', 'The layout effect hides the destination before paint or a timer callback');
  const flight = fx.layer.querySelector<HTMLElement>('.fx-cue-card')!;
  assert.equal(flight.style.left, '127px'); assert.equal(flight.style.top, '142px');
  assert.ok(fx.animationFrames.some(frames => Array.isArray(frames) && frames.some(frame => String(frame.transform).includes('translate(601px,501.5px)'))));
  await fx.tick(300); assert.equal(target.style.visibility, 'hidden');
  await fx.tick(300); assert.equal(target.style.visibility, ''); assert.equal(fx.layer.querySelector('.fx-cue-card'), null);
  await fx.render({ batch: { id: 2, events: [{ type: 'cards_drawn', player: 0, count: 1 }, { type: 'cards_received', player: 0, cards: [10] }], waiting: null } });
  assert.equal(target.style.visibility, 'hidden');
  await fx.render({ batch: null }); assert.equal(target.style.visibility, ''); assert.equal(fx.layer.children.length, 0);
  await fx.tick(3000); assert.equal(fx.layer.children.length, 0);
});

test('outgoing cards start at the saved hand rect and the discard face changes only on landing', async t => {
  const fx = await mount(t);
  const hand = document.createElement('div'); hand.innerHTML = '<div data-animation-region="hand"><button data-card-id="1"><span class="card-visual"></span></button></div>'; fx.stage.append(hand);
  rectangle(t, hand.querySelector('span')!, 700, 600, 56, 87);
  const pile = document.createElement('div'); pile.className = 'discard-pile'; pile.dataset.animationRegion = 'discard'; pile.innerHTML = '<div class="pile-top"><button class="game-card" data-card-id="37">Old discard</button></div>'; fx.stage.append(pile); rectangle(t, pile.querySelector('button')!, 400, 300, 54, 84);
  await fx.render({ ctx: { ...ctx } });
  hand.replaceChildren(); pile.querySelector('button')!.dataset.cardId = '1'; pile.querySelector('button')!.textContent = 'New discard';
  await fx.render({ batch: { id: 1, events: [{ type: 'card_played', player: 0, card: 1, target: null }], waiting: null } });
  assert.equal(pile.querySelector<HTMLElement>('.pile-top')!.style.visibility, 'hidden');
  assert.equal(fx.stage.querySelector('.fx-discard-hold')!.textContent, 'Old discard');
  const flight = fx.layer.querySelector<HTMLElement>('.fx-cue-card')!;
  assert.equal(flight.style.left, '728px'); assert.equal(flight.style.top, '643.5px');
  await fx.tick(300); assert.ok(fx.stage.querySelector('.fx-discard-hold'));
  await fx.tick(300); assert.equal(pile.querySelector<HTMLElement>('.pile-top')!.style.visibility, ''); assert.equal(fx.stage.querySelector('.fx-discard-hold'), null);
  assert.equal(pile.textContent, 'New discard');
});

test('other players hand counts wait for arrivals, and reduced motion never hides a new card', async t => {
  const fx = await mount(t);
  const badge = document.createElement('span'); badge.dataset.playerId = '1'; badge.innerHTML = '<span class="hand-count" aria-label="5 lá trên tay"></span>'; fx.stage.append(badge);
  const players = structuredClone(ctx.players); players[1].hand_count = 5;
  await fx.render({ ctx: { ...ctx, players }, batch: { id: 1, events: [{ type: 'cards_drawn', player: 1, count: 2 }], waiting: null } });
  assert.equal(badge.querySelector<HTMLElement>('span')!.dataset.flightCount, '3');
  assert.equal(badge.querySelector('span')!.getAttribute('aria-label'), '5 lá trên tay');
  assert.equal(fx.layer.querySelectorAll('[data-face="public"]').length, 0);
  await fx.tick(300); assert.equal(badge.querySelector<HTMLElement>('span')!.dataset.flightCount, '3');
  await fx.tick(400); assert.equal(badge.querySelector('span')!.getAttribute('aria-label'), '5 lá trên tay');
  await fx.reduced(true);
  const hand = document.createElement('div'); hand.className = 'own-hand'; hand.innerHTML = '<div class="hand-cards"><button data-card-id="10"></button></div>'; fx.stage.append(hand);
  await fx.render({ batch: { id: 2, events: [{ type: 'cards_drawn', player: 0, count: 1 }, { type: 'cards_received', player: 0, cards: [10] }], waiting: null } });
  assert.equal(hand.querySelector<HTMLElement>('button')!.style.visibility, ''); assert.equal(fx.layer.children.length, 0);
  await fx.unmount(); assert.equal(fx.pending.size, 0); assert.equal(fx.intervals.size, 0);
});

for (const next of ['batch', 'snapshot'] as const) test(`React owns the final hand count and aria-label after a consecutive ${next}`, async t => {
  const fx = await mount(t, null, { hidden: false, reduced: false }, props => {
    const count = props.ctx.players.find(player => player.id === 1)!.hand_count;
    return createElement('div', { 'data-player-id': 1 }, createElement('span', { className: 'hand-count', 'aria-label': `${count} lá trên tay` }, createElement('span', { className: 'motion-count' }, count)));
  });
  const update = (count: number, batch: FxBatch | null) => fx.render({ ctx: { ...ctx, players: ctx.players.map(player => player.id === 1 ? { ...player, hand_count: count } : player) }, batch });
  const draw = (id: number): FxBatch => ({ id, events: [{ type: 'cards_drawn', player: 1, count: 1 }], waiting: null });
  await update(3, null);
  const badge = fx.stage.querySelector<HTMLElement>('.hand-count')!;
  await update(4, draw(1));
  assert.equal(badge.dataset.flightCount, '3');
  assert.equal(badge.getAttribute('aria-label'), '4 lá trên tay');
  await fx.tick(100);
  await update(5, next === 'batch' ? draw(2) : null);
  assert.equal(badge.getAttribute('aria-label'), '5 lá trên tay');
  await fx.tick(3000);
  assert.equal(fx.stage.querySelector('.hand-count'), badge, 'React updates the same badge node across batches');
  assert.equal(badge.textContent, '5');
  assert.equal(badge.getAttribute('aria-label'), '5 lá trên tay');
  assert.equal(badge.dataset.flightCount, undefined);
  assert.equal(badge.querySelector('.fx-hand-count'), null);
  assert.equal(fx.layer.children.length, 0);
});

test('in-flight hand counts are decorative while the authoritative count stays accessible', async t => {
  const style = document.createElement('style'); style.textContent = await readFile(new URL('./fx.css', import.meta.url), 'utf8'); document.head.append(style); t.after(() => style.remove());
  const fx = await mount(t, null, { hidden: false, reduced: false }, props => {
    const count = props.ctx.players.find(player => player.id === 1)!.hand_count;
    return createElement('div', { 'data-player-id': 1 }, createElement('span', { className: 'hand-count', 'aria-label': `${count} lá trên tay` }, createElement('span', { className: 'motion-count' }, count)));
  });
  const players = ctx.players.map(player => player.id === 1 ? { ...player, hand_count: 5 } : player);
  const draw = (id: number): FxBatch => ({ id, events: [{ type: 'cards_drawn', player: 1, count: 2 }], waiting: null });
  await fx.render({ ctx: { ...ctx, players }, batch: draw(1) });
  const badge = fx.stage.querySelector<HTMLElement>('.hand-count')!;
  const authoritative = badge.querySelector<HTMLElement>('.motion-count')!;
  const display = badge.querySelector<HTMLElement>('.fx-hand-count')!;
  assert.ok(display, 'The temporary number belongs to a separate decorative element');
  assert.equal(display.getAttribute('aria-hidden'), 'true'); assert.equal(display.textContent, '3');
  assert.equal(badge.getAttribute('aria-label'), '5 lá trên tay'); assert.equal(authoritative.textContent, '5');
  assert.equal(authoritative.closest('[aria-hidden="true"],[hidden],[inert]'), null);
  assert.ok(!['hidden', 'collapse'].includes(getComputedStyle(authoritative).visibility));
  assert.notEqual(getComputedStyle(authoritative).display, 'none');
  assert.equal(getComputedStyle(authoritative).opacity, '0', 'Only visual opacity hides the authoritative count');
  await fx.tick(400); assert.equal(display.textContent, '4');
  await fx.tick(100);
  assert.equal(badge.querySelector('.fx-hand-count'), null); assert.equal(badge.dataset.flightCount, undefined);
  assert.notEqual(getComputedStyle(authoritative).opacity, '0');
  assert.equal(badge.getAttribute('aria-label'), '5 lá trên tay');
  await fx.reduced(true); await fx.render({ batch: draw(2) });
  assert.equal(badge.querySelector('.fx-hand-count'), null); assert.equal(badge.dataset.flightCount, undefined);
});

test('consecutive public opponent discards hold a static front face between landings', async t => {
  const fx = await mount(t, null, { hidden: false, reduced: false }, props => createElement('div', { className: 'discard-pile', 'data-animation-region': 'discard' }, createElement('div', { className: 'pile-top' }, createElement('span', { className: 'game-card', 'data-card-id': props.batch ? 37 : 1 }, 'Authoritative discard'))));
  await fx.render({ batch: { id: 1, events: [{ type: 'card_discarded', player: 1, card: 26 }, { type: 'card_discarded', player: 1, card: 37 }], waiting: null } });
  const firstImage = fx.layer.querySelector<HTMLImageElement>('.fx-cue-card .fx-flight-front img')!.src;
  await fx.tick(400);
  assert.equal(fx.layer.querySelectorAll('.fx-cue-card').length, 1, 'Only the first flight has landed');
  const hold = fx.stage.querySelector<HTMLElement>('.fx-discard-hold')!;
  const face = hold.firstElementChild as HTMLElement;
  assert.ok(face.classList.contains('fx-card'), 'Hold receives a static card, not an animated two-sided body');
  assert.equal(face.dataset.face, 'public');
  assert.equal(face.querySelector<HTMLImageElement>('img')!.src, firstImage);
  assert.equal(hold.querySelector('.fx-flight-body,.fx-flight-front,.fx-flight-back,[data-face="back"]'), null);
  assert.equal(face.style.transform, '', 'The static face needs no 3D animation to face the viewer');
  await fx.tick(100);
  assert.equal(fx.stage.querySelector('.fx-discard-hold'), null);
  assert.equal(fx.stage.querySelector<HTMLElement>('.pile-top')!.style.visibility, '');
  await fx.render({ batch: { id: 2, events: Array.from({ length: 2 }, () => ({ type: 'hand_affected' as const, source: 0, target: 1, kind: 'cat_balou' as const, count: 1 })), waiting: null } });
  await fx.tick(400);
  assert.equal(fx.stage.querySelector('.fx-discard-hold > .fx-card')?.getAttribute('data-face'), 'back', 'A flight without a public card stays face down');
  assert.equal(fx.stage.querySelector('.fx-discard-hold [data-face="public"]'), null);
  await fx.tick(100);
  assert.equal(fx.stage.querySelector('.fx-discard-hold'), null);
});

test('flight capture only reads drag cards from the portal owned by its stage', t => {
  const owner = document.createElement('div'); owner.dataset.bangRoot = 'active-portal';
  const stage = document.createElement('div'); owner.append(stage); document.body.append(owner);
  const active = document.createElement('div'); active.id = 'active-portal'; active.className = 'game-bang';
  const stale = document.createElement('div'); stale.id = 'stale-portal'; stale.className = 'game-bang';
  for (const portal of [stale, active]) { portal.innerHTML = '<div class="drag-flight" data-flight-card="1"></div>'; document.body.append(portal); }
  t.after(() => { owner.remove(); active.remove(); stale.remove(); });
  const wrong = stale.firstElementChild as HTMLElement, own = active.firstElementChild as HTMLElement;
  t.mock.method(own, 'getBoundingClientRect', () => ({ x: 50, y: 60, width: 40, height: 60 }));
  const jobs = scheduleFx([{ kind: 'card', from: 'hand', to: 'discard', card: 1 }]);
  const flights = prepareFlights(stage, jobs, undefined, ctx);
  assert.equal(own.style.visibility, 'hidden');
  assert.equal(wrong.style.visibility, '');
  flights.clear();
  assert.equal(own.style.visibility, '');
});
