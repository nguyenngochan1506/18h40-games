import type { CSSProperties } from 'react';
import { Component, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { assetUrl, availableSceneFiles, backFiles, cardFiles, seatActorFile, fxFiles, optionalSceneFiles } from './assetMap';
import type { SeatView } from './assetMap';
import { cardFace } from './cardCatalog';
import { eventsToFx, FX_BUDGET, FX_CONCURRENT, scheduleFx, shouldPlayFx, shotOrigin, particlePolicy } from './fx';
import type { FxAnchor, FxBatch, FxContext } from './fx';
import type { ParticleRenderer } from './ParticleRenderer';
import { captureFlightLayout, prepareFlights } from './flightLayout';
import type { FlightLayout } from './flightLayout';
import './fx.css';

type Point = { x: number; y: number };
const spriteFiles = { ...fxFiles, dynamite: optionalSceneFiles.dynamite };
type Sprite = keyof typeof spriteFiles;
const spriteImages = new Map<Sprite, HTMLImageElement>();
function preloadArt() {
  if (spriteImages.size) return;
  const start = performance.now();
  const jobs = (Object.entries(spriteFiles) as [Sprite, string][]).filter(([, url]) => availableSceneFiles.includes(url)).map(([kind, url]) => {
    const image = new Image(); image.decoding = 'async'; image.fetchPriority = 'low'; image.src = url;
    spriteImages.set(kind, image);
    return image.decode().catch(() => undefined);
  });
  void Promise.all(jobs).then(() => performance.measure('bang-fx-preload', { start, end: performance.now() }));
}
function element(className: string, text?: string) {
  const node = document.createElement('span');
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
function sprite(kind: Sprite) {
  const node = element(`fx-sprite fx-${kind}`);
  node.append(element('fx-fallback', kind === 'sparkle' ? '✦' : undefined));
  if (availableSceneFiles.includes(spriteFiles[kind])) {
    const art = spriteImages.get(kind)?.cloneNode(false) as HTMLImageElement | undefined ?? document.createElement('img');
    art.src = spriteFiles[kind]; art.alt = ''; art.decoding = 'async';
    art.onerror = () => { art.remove(); node.classList.remove('has-art'); };
    node.classList.add('has-art'); node.append(art);
  }
  return node;
}
function point(stage: HTMLElement, anchor: FxAnchor, cardId?: number): Point {
  const selector = typeof anchor === 'number' ? `[data-animation-anchor="${anchor}"]` : `[data-animation-region="${anchor}"]`;
  let target = typeof anchor === 'string' && anchor.startsWith('equipment-') && cardId !== undefined ? stage.querySelector<HTMLElement>(`${selector} [data-card-id="${cardId}"] .game-art`) : null;
  target ??= stage.querySelector<HTMLElement>(selector);
  if (typeof anchor === 'string' && /^(equipment|health)-/.test(anchor) && !target?.getClientRects().length) target = stage.querySelector<HTMLElement>(`[data-animation-anchor="${anchor.split('-')[1]}"]`);
  target ??= stage.querySelector<HTMLElement>('[data-animation-region="table"]') ?? stage;
  const s = stage.getBoundingClientRect(), r = target.getBoundingClientRect();
  return { x: r.x + r.width / 2 - s.x, y: r.y + r.height / 2 - s.y };
}
function card(cardId?: number) {
  const node = element('fx-card');
  const face = cardId === undefined ? undefined : cardFace(cardId);
  const art = document.createElement('img');
  art.src = assetUrl(face ? cardFiles[face.kind] : backFiles.card); art.alt = '';
  node.dataset.face = face ? 'public' : 'back';
  if (face) node.append(element('fx-card-rank', `${face.rank}${face.suit}`));
  node.append(art);
  return node;
}

// Read departing cards before React removes or reflows their DOM.
class FlightSnapshot extends Component<{ capture: () => void }> {
  getSnapshotBeforeUpdate(previous: Readonly<{ capture: () => void }>) { previous.capture(); return null; }
  componentDidUpdate() {}
  render() { return null; }
}

export default function GameFx({ batch, ctx, enabled, width, height, ambientEnabled = true }: { batch: FxBatch | null; ctx: FxContext; enabled: boolean; width: number; height: number; ambientEnabled?: boolean }) {
  const particleHost = useRef<HTMLDivElement>(null);
  const particles = useRef<ParticleRenderer | null>(null);
  const ambientRequested = useRef(ambientEnabled);
  ambientRequested.current = ambientEnabled;
  const layer = useRef<HTMLDivElement>(null);
  const persistent = useRef<HTMLDivElement>(null);
  const atmosphere = useRef<HTMLDivElement>(null);
  const atmosphereStart = useRef(performance.now());
  const seen = useRef<number | null>(batch?.id ?? null);
  const lastTime = useRef(-Infinity);
  const lucky = useRef<FxContext['lucky']>(undefined);
  const viewer = useRef(ctx.you);
  const previousLayout = useRef<FlightLayout | undefined>(undefined);
  const captured = useRef(false);
  const [activity, setActivity] = useState(() => ({ hidden: document.hidden, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }));
  const active = enabled && !activity.hidden && !activity.reduced;
  useEffect(() => { if (active) preloadArt(); }, [active]);
  useEffect(() => {
    if (!enabled || activity.reduced) return;
    const host = particleHost.current!;
    const start = performance.now();
    const canvas = document.createElement('canvas');
    let context: WebGL2RenderingContext | null = null;
    try { context = canvas.getContext('webgl2', { alpha: true, antialias: false, stencil: true }); } catch { /* DOM FX remain available. */ }
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const policy = particlePolicy({ width: window.innerWidth, reduced: activity.reduced, webgl: !!context, cores: device.hardwareConcurrency, memory: device.deviceMemory, saveData: device.connection?.saveData });
    if (!policy.enabled || !context) return;
    let cancelled = false;
    void import('./ParticleRenderer').then(module => {
      if (cancelled) return null;
      return module.createParticleRenderer(host, canvas, context!);
    }).then(renderer => {
      if (!renderer) return;
      if (cancelled) { renderer.destroy(); return; }
      particles.current = renderer;
      renderer.resize(host.clientWidth, host.clientHeight);
      host.dataset.ambientAllowed = String(policy.ambient);
      renderer.setAmbient(policy.ambient && ambientRequested.current);
      performance.measure('bang-particles-init', { start, end: performance.now() });
    }).catch(() => {
      // Optional WebGL decoration must never interrupt the table.
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    return () => {
      cancelled = true; particles.current?.destroy(); particles.current = null;
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [enabled, activity.reduced]);
  useEffect(() => {
    if (activity.hidden) particles.current?.suspend(); else particles.current?.resume();
  }, [activity.hidden]);
  useEffect(() => { particles.current?.resize(width, height); }, [width, height]);
  useEffect(() => { particles.current?.setAmbient(ambientEnabled && particleHost.current?.dataset.ambientAllowed === 'true'); }, [ambientEnabled]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setActivity({ hidden: document.hidden, reduced: media.matches });
    document.addEventListener('visibilitychange', update); media.addEventListener('change', update);
    return () => { document.removeEventListener('visibilitychange', update); media.removeEventListener('change', update); };
  }, []);

  useLayoutEffect(() => {
    const root = layer.current!, stage = root.parentElement!;
    if (viewer.current !== ctx.you) { lucky.current = undefined; previousLayout.current = undefined; viewer.current = ctx.you; }
    const play = shouldPlayFx(batch, seen.current, { enabled, hidden: activity.hidden, reduced: false });
    seen.current = batch?.id ?? null;
    particles.current?.clear();
    if (!batch || !enabled || activity.hidden) lucky.current = undefined;
    if (!play || !batch) return;
    const now = performance.now();
    const cues = eventsToFx(batch.events, { ...ctx, waiting: batch.waiting, lucky: lucky.current });
    const offered = cues.find(cue => cue.kind === 'check' && cue.card === undefined && cue.cards);
    if (offered) lucky.current = { player: offered.player!, cards: offered.cards!, waiting: batch.waiting };
    else if (batch.events.some(event => event.type === 'draw_revealed') || ctx.waiting?.kind.type !== 'choose_draw_result') lucky.current = undefined;
    const jobs = scheduleFx(activity.reduced ? cues.filter(cue => ['check', 'jail-held', 'escape', 'extinguish'].includes(cue.kind)) : cues, now - lastTime.current < 400);
    const presentation = activity.reduced ? undefined : prepareFlights(stage, jobs, previousLayout.current, ctx);
    if (presentation) { previousLayout.current = presentation.current; captured.current = true; }
    lastTime.current = now;
    const timers: number[] = [], animations: Animation[] = [], nodes = new Set<HTMLElement>();
    const running = new Set<HTMLElement>(), landings = new Map<HTMLElement, () => void>();
    const admit = (node: HTMLElement) => {
      if (running.size >= FX_CONCURRENT) {
        const oldest = running.values().next().value!;
        landings.get(oldest)?.(); landings.delete(oldest); oldest.remove(); running.delete(oldest); nodes.delete(oldest);
      }
      node.dataset.running = 'true'; running.add(node);
    };
    const animate = (node: Element, frames: Keyframe[], duration: number, delay = 0, easing = 'ease-out') => {
      const animation = node.animate(frames, { duration, delay, fill: 'both', easing });
      animations.push(animation); return animation;
    };
    const shake = (target: Element | null, amount = 3) => {
      if (!target) return;
      const base = getComputedStyle(target).transform;
      const prefix = base === 'none' ? '' : base;
      animate(target, [0, -amount, amount, -amount / 2, 0].map(x => ({ transform: `${prefix} translateX(${x}px)` })), 300);
    };
    for (const job of jobs) {
      const run = () => {
      if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches !== activity.reduced) return;
      const flight = presentation?.plans.get(job);
      const moving = job.kind === 'card' || job.kind === 'extinguish';
      let from = moving && flight ? flight.from : point(stage, job.from, job.card);
      const to = moving && flight ? flight.to : point(stage, job.to, job.card), stageBox = stage.getBoundingClientRect();
      const sourceElement = typeof job.from === 'number' ? stage.querySelector<HTMLElement>(`[data-scene-player="${job.from}"]`) : null;
      const sourceActor = sourceElement?.getBoundingClientRect();
      if (job.kind === 'shot') from = shotOrigin(from, to, sourceActor ? { x: sourceActor.x - stageBox.x, y: sourceActor.y - stageBox.y, width: sourceActor.width, height: sourceActor.height, handX: Number(sourceElement!.dataset.handX), handY: Number(sourceElement!.dataset.handY) } : undefined);
      const dx = to.x - from.x, dy = to.y - from.y, angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const node = element(`fx-cue fx-cue-${job.kind}`);
      const depth = (anchor: FxAnchor) => typeof anchor === 'number' ? parseFloat(stage.querySelector<HTMLElement>(`[data-player-id="${anchor}"]`)?.style.getPropertyValue('--depth') ?? '') || 1 : 1;
      node.style.setProperty('--fx-source-scale', `${height / 720 * depth(job.from)}`);
      node.style.setProperty('--fx-target-scale', `${height / 720 * depth(job.to)}`);
      const winner = batch.events.find(event => event.type === 'game_ended');
      if (!activity.reduced) particles.current?.emit(job, from, to, depth(job.from), depth(job.to), job.duration, winner?.type === 'game_ended' ? winner.winner : null);
      const actorBox = typeof job.to === 'number' ? stage.querySelector(`[data-scene-player="${job.to}"]`)?.getBoundingClientRect() : undefined;
      const jailBox = actorBox ?? stage.querySelector(`[data-animation-anchor="${job.to}"]`)?.closest('.own-character-tip')?.getBoundingClientRect() ?? stage.querySelector(`[data-player-id="${job.to}"] .seat-person`)?.getBoundingClientRect();
      if (jailBox) node.style.setProperty('--fx-jail-height', `${jailBox.height}px`);
      node.dataset.fx = job.kind; node.dataset.batch = String(batch.id); node.dataset.start = String(job.start);
      if (job.result) node.dataset.result = job.result;
      node.style.left = `${from.x}px`; node.style.top = `${from.y}px`;
      const target = typeof job.to === 'number' ? stage.querySelector(`[data-scene-player="${job.to}"] .cowboy`) ?? stage.querySelector(`[data-player-id="${job.to}"] .seat-person`) : null;
      const atTarget = () => { node.style.left = `${to.x}px`; node.style.top = `${to.y}px`; };
      if (activity.reduced) {
        atTarget(); node.classList.add('fx-static'); node.append(element('fx-label', job.label)); admit(node); root.append(node); nodes.add(node);
        timers.push(window.setTimeout(() => { node.remove(); nodes.delete(node); running.delete(node); }, 700));
        return;
      }
      if (job.kind === 'card') {
        const size = flight?.width ?? 60, scale = (flight?.targetWidth ?? size) / size;
        const duration = Math.min(job.duration, Math.round(Math.min(520, Math.max(380, 380 + Math.hypot(dx, dy) * .12))));
        node.style.width = `${size}px`;
        const body = element('fx-flight-body'); node.append(body);
        const flip = job.card !== undefined && (job.from === 'draw' || job.from === 'discard' || job.to === 'hand' && job.from !== 'hand' || typeof job.from === 'number');
        if (flip) {
          const back = card(), front = card(job.card); back.classList.add('fx-flight-back'); front.classList.add('fx-flight-front'); body.append(back, front);
          animate(body, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)', offset: .55 }, { transform: 'rotateY(180deg)', offset: .9 }, { transform: 'rotateY(180deg)' }], duration, job.start);
        } else body.append(card(job.card));
        if (job.fuse) node.append(element('fx-fuse'));
        root.append(node); nodes.add(node);
        const land = () => flight?.land(job.to === 'discard' ? card(job.card) : undefined);
        landings.set(node, land);
        if (job.start) timers.push(window.setTimeout(() => admit(node), job.start)); else admit(node);
        const arc = Math.min(75, Math.max(20, Math.hypot(dx, dy) * .12));
        const life = animate(node, [
          { transform: 'translate(-50%,-50%) rotate(-5deg) scale(1)', opacity: 1 },
          { transform: `translate(${dx * .55}px,${dy * .55 - arc}px) translate(-50%,-50%) rotate(3deg) scale(${(1 + scale) / 2})`, opacity: 1, offset: .55 },
          { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) rotate(0deg) scale(${scale})`, opacity: 1 },
        ], duration, job.start);
        life.onfinish = () => { land(); node.remove(); nodes.delete(node); running.delete(node); landings.delete(node); };
        return;
      } else if (job.kind === 'check') {
        const pile = stage.querySelector('.discard-pile .game-art')?.getBoundingClientRect();
        node.style.setProperty('--check-card-w', `${Math.min(130, Math.max(64, (pile?.width || width * .0414) * 1.3))}px`);
        const cards = job.cards ?? [job.card];
        const spread = element('fx-check-spread'); node.append(spread);
        for (const [index, id] of cards.entries()) {
          const flip = element('fx-check-card');
          const back = card(), front = card(id);
          back.classList.add('fx-check-back'); front.classList.add('fx-check-front');
          if (job.selected !== undefined) flip.classList.add(job.selected === index ? 'is-chosen' : 'is-rejected');
          flip.append(back, front); spread.append(flip);
          const opacity = job.selected !== undefined && job.selected !== index ? .3 : 1;
          animate(front, [{ opacity }, { opacity, offset: .9 }, { opacity: 0 }], job.duration, 0, 'linear');
          if (job.selected !== undefined) flip.style.transform = 'rotateY(180deg)';
          else {
            const start = (650 + index * 250) / 1400;
            animate(flip, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)', offset: start, easing: 'ease-in-out' }, { transform: 'rotateY(180deg)', offset: start + 200 / 1400 }, { transform: 'rotateY(180deg)' }], job.duration, 0, 'linear');
          }
        }
        if (job.selected !== undefined) atTarget();
        else animate(node, [{ transform: 'translate(0,0) scale(.65)', easing: 'ease-out' }, { transform: `translate(${dx}px,${dy}px) scale(1)`, offset: 150 / 1400 }, { transform: `translate(${dx}px,${dy}px) scale(1)` }], job.duration, 0, 'linear');
        if (job.label) {
          const label = element('fx-label', job.label); node.append(label);
          const reveal = cards.length === 2 ? 1100 : 850;
          if (job.selected === undefined) animate(label, [{ opacity: 0 }, { opacity: 0, offset: reveal / 1400 }, { opacity: 1, offset: (reveal + 50) / 1400 }, { opacity: 1, offset: .9 }, { opacity: 0 }], job.duration, 0, 'linear');
        }
      } else if (job.kind === 'extinguish') {
        if (flight) node.style.setProperty('--flight-card-w', `${flight.width}px`);
        node.append(card(job.card));
        const smoke = sprite('smokeA'); node.append(smoke);
        animate(smoke, [{ opacity: 0, transform: 'translate(-50%,-35%) scale(.25)' }, { opacity: .5, offset: .25 }, { opacity: 0, transform: 'translate(-50%,-120%) scale(.75)' }], job.duration);
        animate(node.querySelector('.fx-card')!, [{ opacity: 1, transform: 'translate(-50%,-50%)' }, { opacity: .35, transform: 'translate(-50%,-50%)', offset: .4 }, { opacity: 0, transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(.45)` }], job.duration);
        node.append(element('fx-label', job.label));
      } else if (job.kind === 'shot') {
        const muzzle = sprite('muzzle'); muzzle.style.rotate = `${angle}deg`; node.append(muzzle);
        animate(muzzle, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)', offset: .12 }, { opacity: 1, transform: 'scale(1.05)', offset: .6 }, { opacity: 0, transform: 'scale(.8)' }], 250);
        const smoke = sprite('smokeA'); node.append(smoke);
        animate(smoke, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.3)' }, { opacity: .32, offset: .25 }, { opacity: 0, transform: 'translate(-40%, -90%) scale(1.3)' }], job.duration);
        const trail = element('fx-trail'); trail.style.width = `${Math.hypot(dx, dy)}px`; trail.style.rotate = `${angle}deg`; trail.append(sprite('smokeB')); node.append(trail);
        animate(trail, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: .8, transform: 'scaleX(.7)', offset: .4 }, { opacity: 0, transform: 'scaleX(1)' }], job.duration * .9);
        const bullet = element('fx-projectile'); const art = sprite('bullet'); art.style.rotate = `${angle}deg`; bullet.append(art); node.append(bullet);
        animate(bullet, [{ transform: 'translate(0,0)', opacity: 0 }, { opacity: 1, offset: .08 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 1, offset: .85 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 0 }], job.duration * .7);
        const impact = sprite('impact'); impact.style.left = `${dx}px`; impact.style.top = `${dy}px`; node.append(impact);
        animate(impact, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.3)' }, { opacity: 1, offset: .2 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.3)' }], job.duration * .35, job.duration * .6);
      } else if (job.kind === 'reveal') {
        node.append(card(job.card));
        if (job.fuse) node.append(element('fx-fuse'));
        const mid = point(stage, 'table');
        if (job.kind === 'reveal' && job.from === 'hand' && job.to === 'hand') animate(node, [
          { transform: 'translate(-50%, -50%) rotateY(90deg)', opacity: 0 },
          { transform: 'translate(-50%, -80%) rotateY(0deg)', opacity: 1, offset: .25 },
          { transform: 'translate(-50%, -50%) rotateY(0deg)', opacity: 0 },
        ], job.duration);
        else animate(node, [
          { transform: 'translate(-50%,-50%) rotate(-12deg) scale(.7)', opacity: 0 },
          { transform: `translate(${job.kind === 'reveal' ? dx : mid.x - from.x}px,${job.kind === 'reveal' ? dy : mid.y - from.y}px) translate(-50%,-80%) rotate(8deg) scale(1.1)`, opacity: 1, offset: .5 },
          { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) rotate(-6deg) scale(.7)`, opacity: 0 },
        ], job.duration);
      } else {
        atTarget();
        if (job.kind === 'explosion') {
          node.append(sprite('explosion'), sprite('smokeA'));
          const flash = element('fx-scene-flash');
          Object.assign(flash.style, { left: `${-to.x}px`, top: `${-to.y}px`, width: `${width}px`, height: `${height}px` }); node.append(flash);
          animate(flash, [{ opacity: 0 }, { opacity: .16, offset: .25 }, { opacity: 0 }], 200);
          shake(stage, 4);
        } else if (job.kind === 'jail' || job.kind === 'escape') node.append(sprite('jail'));
        else if (job.kind === 'jail-held') shake(job.to === ctx.you ? stage.querySelector('.own-jail-cage') : stage.querySelector(`.fx-persistent-jail[data-player="${job.to}"] .fx-jail`), 8);
        else if (job.kind === 'heal') {
          for (let i = 0; i < 3; i++) { const star = sprite('sparkle'); star.style.setProperty('--i', `${i}`); node.append(star); }
          for (const row of stage.querySelectorAll(`[data-animation-region="health-${job.to}"]`)) Array.from(row.querySelectorAll('.bullet-icons i:not(.spent)')).forEach((bullet, i) => animate(bullet, [{ opacity: .4, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1.2)', offset: .4 }, { opacity: 1, transform: 'scale(1)' }], 300, i * 60));
          const health = point(stage, typeof job.to === 'number' ? `health-${job.to}` : job.to);
          const glow = element('fx-health-glow'); glow.style.left = `${health.x - to.x}px`; glow.style.top = `${health.y - to.y}px`; node.append(glow);
        } else if (job.kind === 'damage') {
          node.append(element('fx-red-flash'));
          const health = point(stage, typeof job.to === 'number' ? `health-${job.to}` : job.to);
          for (let i = 0; i < 2; i++) { const drop = element('fx-lost-bullet'); drop.style.left = `${health.x - to.x + i * 9}px`; drop.style.top = `${health.y - to.y}px`; drop.style.setProperty('--i', `${i}`); node.append(drop); }
          shake(target);
        } else if (job.kind === 'deflect') { node.append(sprite('impact'), sprite('bullet')); }
        else if (job.kind === 'eliminate') {
          const actorElement = stage.querySelector<HTMLElement>(`[data-scene-player="${job.to}"]`);
          const actor = actorElement?.getBoundingClientRect();
          if (actor) { node.style.setProperty('--fx-actor-width', `${actor.width}px`); node.style.setProperty('--fx-actor-height', `${actor.height}px`); }
          const view = actorElement?.dataset.seatView as SeatView | undefined;
          if (actor) { node.style.left = `${actor.x + actor.width / 2 - stageBox.x}px`; node.style.top = `${actor.y + actor.height * .35 - stageBox.y}px`; }
          node.style.setProperty('--fx-actor-flip', actorElement?.dataset.seatFlip === 'true' ? '-1' : '1');
          for (const ghost of [false, true]) {
            const art = document.createElement('img'); art.src = seatActorFile(Number(job.to), view ?? 'front', ghost); art.alt = ''; art.decoding = 'async'; art.className = ghost ? 'fx-rising-ghost' : 'fx-fading-cowboy'; node.append(art);
          }
          const role = stage.querySelector(`[data-player-id="${job.to}"] .role-tile`);
          if (role) animate(role, [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0)' }], 300);
        } else if (job.kind === 'turn') {
          const ring = element('fx-turn-ring'); node.append(ring);
          animate(ring, [{ opacity: 0, transform: `translate(${-dx - 50}px,${-dy - 50}px) scale(.4)` }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .6 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }], job.duration);
        }
        else if (job.kind === 'win') {
          for (let i = 0; i < 18; i++) { const bit = element('fx-confetti'); bit.style.setProperty('--i', `${i}`); node.append(bit); }
        } else if (job.kind === 'equip') shake(stage.querySelector(`[data-animation-region="equipment-${job.to}"]`));
        if (job.label) node.append(element('fx-label', job.label));
      }
      admit(node); root.append(node); nodes.add(node);
      const life = animate(node, job.kind === 'check' ? [{ opacity: 1 }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: .7 }, { opacity: 0 }], job.duration);
      life.onfinish = () => { flight?.land(); node.remove(); nodes.delete(node); running.delete(node); };
      };
      if (job.kind === 'card') run(); else timers.push(window.setTimeout(run, job.start));
    }
    const clear = () => {
      timers.forEach(clearTimeout); timers.length = 0;
      animations.forEach(a => a.cancel()); animations.length = 0;
      nodes.forEach(n => n.remove()); nodes.clear();
      running.clear(); landings.clear();
      particles.current?.clear();
      presentation?.clear();
    };
    timers.push(window.setTimeout(clear, FX_BUDGET + 50));
    return clear;
  }, [batch, enabled, activity, width, height, ctx.you]);

  useLayoutEffect(() => {
    if (!active) previousLayout.current = undefined;
    else if (!captured.current) previousLayout.current = captureFlightLayout(layer.current!.parentElement!, ctx);
    captured.current = false;
  });
  useEffect(() => {
    if (!active) return;
    const stage = layer.current!.parentElement!;
    const capture = () => { previousLayout.current = captureFlightLayout(stage, ctx); };
    stage.addEventListener('pointerdown', capture, true); stage.addEventListener('keydown', capture, true);
    return () => { stage.removeEventListener('pointerdown', capture, true); stage.removeEventListener('keydown', capture, true); };
  }, [ctx, active]);

  useEffect(() => {
    const root = persistent.current!, stage = root.parentElement!;
    root.replaceChildren();
    if (!active) return;
    for (const player of ctx.players) {
      // The own cage is clipped to the portrait inside GameBoard, below the hand tray.
      if (!player.alive || player.id === ctx.you) continue;
      for (const kind of ['jail'] as const) {  // Dynamite chỉ hiện bằng lá bài trước mặt, không dựng thêm hình quả bom
        if (!player.in_play.some(id => cardFace(id)?.kind === kind)) continue;
        const anchor = point(stage, player.id);
        const node = element(`fx-persistent fx-persistent-${kind}`);
        node.dataset.player = String(player.id);
        node.style.left = `${anchor.x}px`; node.style.top = `${anchor.y}px`;
        const depth = parseFloat(stage.querySelector<HTMLElement>(`[data-player-id="${player.id}"]`)?.style.getPropertyValue('--depth') ?? '') || 1;
        node.style.setProperty('--fx-target-scale', `${height / 720 * depth}`);
        const actor = stage.querySelector(`[data-scene-player="${player.id}"]`) ?? stage.querySelector(`[data-player-id="${player.id}"] .seat-person`);
        if (actor) node.style.setProperty('--fx-jail-height', `${actor.getBoundingClientRect().height}px`);
        node.append(sprite(kind)); root.append(node);
      }
    }
    return () => root.replaceChildren();
  }, [ctx.players, ctx.you, active, width, height]);

  useEffect(() => {
    const animations = [...atmosphere.current!.getAnimations({ subtree: true }), ...persistent.current!.getAnimations({ subtree: true })];
    animations.forEach(a => a.pause());
    if (!active) return;
    // Paused timelines sampled at 2Hz avoid continuously waking the compositor for idle scenery.
    const tick = () => {
      if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const time = performance.now() - atmosphereStart.current;
      animations.forEach(a => { a.currentTime = time; });
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [ctx.players, ctx.you, active, width, height]);

  return <>
    <FlightSnapshot capture={() => {
      if (!active) return;
      const snapshot = captureFlightLayout(layer.current!.parentElement!, ctx);
      const previous = previousLayout.current;
      if (previous?.you === ctx.you) {
        snapshot.cards = new Map([...previous.cards, ...snapshot.cards]);
        snapshot.storeSlots = new Map([...previous.storeSlots, ...snapshot.storeSlots]);
        snapshot.discard = previous.discard;
      }
      previousLayout.current = snapshot;
    }} />
    <div ref={particleHost} className="particle-layer" aria-hidden="true" />
    <div ref={atmosphere} className="scene-atmosphere" aria-hidden="true" data-running={active}><span className="fx-lantern-light" /><span className="fx-haze" /><span className="fx-table-glint" />{Array.from({ length: 8 }, (_, i) => <i className="fx-dust" key={i} style={{ '--i': i } as CSSProperties} />)}</div>
    <div ref={persistent} className="fx-persistent-layer" aria-hidden="true" />
    <div ref={layer} className="fx-layer" aria-hidden="true" data-running={enabled && !activity.hidden} />
  </>;
}
