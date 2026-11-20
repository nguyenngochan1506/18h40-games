import { Container, Graphics, Sprite, Ticker, WebGLRenderer } from 'pixi.js';
import 'pixi.js/graphics';
import type { FxCue } from './fx';
import type { Winner } from '../../../generated/protocol';
import { AMBIENT_LIMIT, ParticlePool, particleBursts, winnerColors } from './particles';

type Point = { x: number; y: number };
export type ParticleRenderer = Awaited<ReturnType<typeof createParticleRenderer>>;

export async function createParticleRenderer(host: HTMLElement, canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
  const renderer = new WebGLRenderer();
  const stage = new Container();
  const ticker = new Ticker();
  ticker.maxFPS = 60;
  const pool = new ParticlePool();
  const textures: ReturnType<WebGLRenderer['generateTexture']>[] = [];
  let destroyed = false, ambient = false;
  let width = host.clientWidth, height = host.clientHeight;
  const sprites: Sprite[] = [];
  const renderOptions = { container: stage };
  const render = () => renderer.render(renderOptions);
  const stats = () => {
    if (import.meta.env.DEV) {
      canvas.dataset.particles = String(pool.count);
      canvas.dataset.ambient = String(pool.ambient);
      canvas.dataset.ticking = String(ticker.started);
    }
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; ticker.destroy(); pool.destroy();
    renderer.scheduler?.destroy();
    canvas.remove(); stage.destroy({ children: true });
    for (const texture of textures) texture.destroy(true);
    sprites.length = 0; textures.length = 0;
    // A partially initialized renderer can throw during destroy; always release its context.
    try { renderer.destroy({ removeView: true }); }
    finally { context.getExtension('WEBGL_lose_context')?.loseContext(); }
  };
  try {
    await renderer.init({ canvas, context, width, height, resolution: Math.min(devicePixelRatio || 1, 2), backgroundAlpha: 0, antialias: false, hello: false, skipExtensionImports: true, gcActive: false });
    // Pixi's scheduler otherwise wakes Ticker.system even when our own ticker is stopped.
    renderer.scheduler.destroy();
    stage.eventMode = 'none'; stage.interactiveChildren = false;
    const soft = new Graphics();
    for (let r = 32; r >= 2; r -= 2) soft.circle(32, 32, r).fill({ color: 0xffffff, alpha: .035 });
    const spark = new Graphics().poly([0, 3, 17, 0, 23, 3, 17, 6]).fill(0xffffff);
    const chip = new Graphics().poly([0, 1, 7, 0, 10, 5, 3, 8]).fill(0xffffff);
    const foam = new Graphics().circle(8, 8, 6).stroke({ color: 0xffffff, width: 1.5 }).circle(6, 6, 1.4).fill({ color: 0xffffff, alpha: .8 });
    for (const graphic of [soft, spark, chip, foam]) { textures.push(renderer.generateTexture({ target: graphic, resolution: 1 })); graphic.destroy(true); }
    for (let i = 0; i < pool.slots.length; i++) {
      const sprite = new Sprite(textures[0]); sprite.anchor.set(.5); sprite.position.set(-1000, -1000); sprites.push(sprite); stage.addChild(sprite);
    }
    stage.scale.set(width / 1280, height / 720);
    canvas.className = 'particle-canvas'; canvas.setAttribute('aria-hidden', 'true');
    // Warm all fixed slots offscreen so the first bursts do not allocate Pixi batch objects.
    render();
    for (const sprite of sprites) sprite.visible = false;
    render(); host.append(canvas); stats();
  } catch (error) { destroy(); throw error; }

  const tick = () => {
    pool.step(ticker.elapsedMS);
    for (let i = 0; i < pool.slots.length; i++) {
      const p = pool.slots[i], sprite = sprites[i];
      sprite.visible = p.life > 0 && p.age >= 0;
      if (!sprite.visible) continue;
      const t = p.age / p.life;
      const soft = p.kind === 'smoke' || p.kind === 'dust' || p.kind === 'fire' || p.kind === 'ambient';
      sprite.texture = textures[soft ? 0 : p.kind === 'spark' ? 1 : p.kind === 'foam' ? 3 : 2];
      sprite.blendMode = p.kind === 'spark' || p.kind === 'fire' || p.kind === 'ambient' ? 'add' : 'normal';
      sprite.position.set(p.x, p.y); sprite.rotation = p.rotation;
      const size = p.size + p.growth * t;
      sprite.width = size * (p.kind === 'spark' ? 2.5 : 1);
      sprite.height = size * (p.kind === 'confetti' ? .45 + Math.abs(Math.cos(t * 15)) * .55 : 1);
      sprite.tint = p.color;
      sprite.alpha = p.alpha * Math.min(1, t * 15) * (1 - t) * (p.kind === 'ambient' ? Math.sin(t * Math.PI) : 1);
    }
    render();
    if (!pool.count) ticker.stop();
    else if (pool.count === pool.ambient) ticker.maxFPS = 24;
    stats();
  };
  ticker.add(tick);
  const wake = () => {
    if (!destroyed && pool.count && !document.hidden) { ticker.maxFPS = pool.count === pool.ambient ? 24 : 60; ticker.start(); stats(); }
  };
  const clear = () => {
    if (destroyed) return;
    pool.clear('transient');
    for (let i = 0; i < sprites.length; i++) sprites[i].visible = pool.slots[i].life > 0 && pool.slots[i].age >= 0;
    if (!pool.count) ticker.stop();
    render(); stats();
  };
  const setAmbient = (enabled: boolean) => {
    if (destroyed) return;
    ambient = enabled;
    pool.clear('ambient');
    if (enabled && !document.hidden) for (let i = 0; i < AMBIENT_LIMIT; i++) pool.spawn('ambient', 1, 180 + Math.random() * 920, 100 + Math.random() * 370, .9, Math.random() * 3000);
    if (pool.count) wake(); else clear();
  };
  return {
    emit(cue: FxCue, from: Point, to: Point, sourceDepth: number, targetDepth: number, duration: number, winner?: Winner | null) {
      if (destroyed || document.hidden) return;
      const colors = winnerColors(winner);
      for (const burst of particleBursts(cue.kind)) {
        const p = burst.origin ? from : to;
        if (cue.kind === 'win') {
          pool.spawn('confetti', burst.count / 2, 200, 290, 1, 0, colors);
          pool.spawn('confetti', burst.count / 2, 1080, 290, 1, 0, colors);
        } else pool.spawn(burst.kind, burst.count, p.x * 1280 / width, p.y * 720 / height, burst.origin ? sourceDepth : targetDepth, (burst.delay ?? 0) * duration, colors);
      }
      wake();
    },
    setAmbient,
    clear,
    suspend() { pool.clear(); clear(); },
    resume() { setAmbient(ambient); },
    resize(w: number, h: number) {
      if (destroyed) return;
      width = w; height = h; renderer.resize(w, h, Math.min(devicePixelRatio || 1, 2)); stage.scale.set(w / 1280, h / 720); render();
    },
    destroy,
  };
}
