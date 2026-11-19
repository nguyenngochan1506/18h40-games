import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement } from 'react';
import type { ComponentProps } from 'react';
import type GameFxComponent from './GameFx.tsx';
import type { FxBatch } from './fx.ts';
import { demoGame, demoRoom } from './demo.ts';
import { demoFx } from './demoFx.ts';
import { initialGameState, receiveGameState, selectGameView } from './state.ts';

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
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, watch: null } });
let GameFx: typeof GameFxComponent;
try { GameFx = (await vite.ssrLoadModule('/src/features/game/GameFx.tsx')).default; }
finally { await vite.close(); }

after(async () => {
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else Reflect.deleteProperty(globalThis, name); }
});

type Props = ComponentProps<typeof GameFxComponent>;
const ctx = { players: selectGameView(demoGame.view).table.players, seats: demoGame.seats, you: 0 };
const burst = (id: number): FxBatch => ({ id, events: Array.from({ length: 20 }, () => ({ type: 'health_changed' as const, player: 1, source: 0, delta: -1, health: 1 })), waiting: null });

async function mount(t: TestContext, initial: FxBatch | null = null, state = { hidden: false, reduced: false }) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  t.mock.method(performance, 'now', () => Date.now());
  const pending = new Set<ReturnType<typeof setTimeout>>(), intervals = new Set<ReturnType<typeof setInterval>>();
  let callbacks = 0, peak = 0, started = 0;
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
    const timing = typeof options === 'number' ? { duration: options } : options;
    const animation = { onfinish: null as Animation['onfinish'], cancel: () => clearTimeout(handle), pause() {}, currentTime: 0 };
    const handle = setTimeout(() => animation.onfinish?.call(animation as unknown as Animation, new Event('finish') as AnimationPlaybackEvent), Number(timing?.duration ?? 0) + Number(timing?.delay ?? 0));
    return animation as unknown as Animation;
  });
  const addDocument = t.mock.method(document, 'addEventListener'), removeDocument = t.mock.method(document, 'removeEventListener');
  const addMedia = t.mock.method(media, 'addEventListener'), removeMedia = t.mock.method(media, 'removeEventListener');
  const errors = t.mock.method(console, 'error');
  const stage = document.createElement('div'); document.body.append(stage);
  const root = createRoot(stage);
  let mounted = true;
  let props: Props = { batch: initial, ctx, enabled: true, width: 1280, height: 720, ambientEnabled: false };
  const render = async (next: Partial<Props>) => { props = { ...props, ...next }; await act(() => root.render(createElement(GameFx, props))); };
  await render({});
  const layer = stage.querySelector<HTMLElement>('.fx-layer')!;
  const append = layer.append;
  t.mock.method(layer, 'append', (...nodes: (Node | string)[]) => { append.apply(layer, nodes); started++; peak = Math.max(peak, layer.children.length); });
  const tick = async (ms: number) => { await act(() => t.mock.timers.tick(ms)); };
  const visibility = async (hidden: boolean) => { await act(() => { state.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); }); };
  const reduced = async (value: boolean) => { await act(() => { media.matches = value; media.dispatchEvent(new Event('change')); }); };
  const unmount = async () => { if (mounted) { await act(() => root.unmount()); mounted = false; } };
  t.after(async () => { await unmount(); stage.remove(); assert.equal(errors.mock.callCount(), 0, 'No React state/update errors'); });
  return { stage, layer, render, tick, visibility, reduced, unmount, pending, intervals, counts: () => ({ callbacks, peak, started }), listenersRemoved() {
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
  const joined = receiveGameState(initialGameState, { v: PROTOCOL_VERSION, type: 'joined', room_code: demoRoom.code, token: 'snapshot', room: demoRoom, game: demoGame });
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
