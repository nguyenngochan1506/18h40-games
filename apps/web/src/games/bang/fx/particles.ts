import type { Winner } from '../../../generated/protocol.ts';
import type { FxKind } from './fx.ts';

export const PARTICLE_LIMIT = 600;
export const AMBIENT_LIMIT = 24;
export type ParticleKind = 'spark' | 'smoke' | 'chip' | 'fire' | 'foam' | 'dust' | 'ash' | 'confetti' | 'ambient';
type Burst = { kind: ParticleKind; count: number; origin?: boolean; delay?: number };
const bursts: Partial<Record<FxKind, readonly Burst[]>> = {
  shot: [{ kind: 'spark', count: 14, origin: true }, { kind: 'smoke', count: 5, origin: true }, { kind: 'spark', count: 12, delay: .6 }, { kind: 'dust', count: 6, delay: .6 }],
  damage: [{ kind: 'chip', count: 12 }, { kind: 'dust', count: 10 }],
  explosion: [{ kind: 'smoke', count: 22 }, { kind: 'fire', count: 26 }, { kind: 'spark', count: 70 }, { kind: 'chip', count: 26 }],
  heal: [{ kind: 'foam', count: 18 }, { kind: 'spark', count: 5 }],
  deflect: [{ kind: 'dust', count: 15 }, { kind: 'spark', count: 8 }],
  jail: [{ kind: 'dust', count: 18 }],
  escape: [{ kind: 'dust', count: 12 }],
  extinguish: [{ kind: 'smoke', count: 8, origin: true }],
  eliminate: [{ kind: 'smoke', count: 16 }, { kind: 'ash', count: 24 }],
  win: [{ kind: 'confetti', count: 150 }],
};
export function particleBursts(kind: FxKind): readonly Burst[] { return bursts[kind] ?? []; }

const gold = [0xefc466, 0xffe5b0, 0xb88948];
const outlaw = [0xd35f38, 0xf1bc68, 0xe8d6ac];
const renegade = [0x7fbbb5, 0xc5e4d5, 0xd7b579];
export function winnerColors(winner?: Winner | null): readonly number[] {
  return winner === 'outlaws' ? outlaw : winner && typeof winner === 'object' ? renegade : gold;
}

export type Particle = {
  kind: ParticleKind; life: number; age: number; x: number; y: number; startX: number; startY: number;
  vx: number; vy: number; gravity: number; size: number; growth: number; rotation: number; spin: number; alpha: number; color: number;
};

// Fixed slots are reused by both the simulation and sprites; no frame allocates particles.
export class ParticlePool {
  readonly slots: Particle[] = Array.from({ length: PARTICLE_LIMIT }, () => ({ kind: 'dust', life: 0, age: 0, x: 0, y: 0, startX: 0, startY: 0, vx: 0, vy: 0, gravity: 0, size: 0, growth: 0, rotation: 0, spin: 0, alpha: 0, color: 0 }));
  count = 0;
  ambient = 0;
  destroyed = false;
  private cursor = 0;

  spawn(kind: ParticleKind, count: number, x: number, y: number, scale = 1, delay = 0, colors: readonly number[] = gold) {
    if (this.destroyed) return;
    const available = Math.min(count, PARTICLE_LIMIT - this.count, kind === 'ambient' ? AMBIENT_LIMIT - this.ambient : PARTICLE_LIMIT);
    for (let i = 0; i < available; i++) {
      while (this.slots[this.cursor].life) this.cursor = (this.cursor + 1) % PARTICLE_LIMIT;
      const p = this.slots[this.cursor];
      const angle = Math.random() * Math.PI * 2, speed = (25 + Math.random() * 130) * scale;
      p.kind = kind; p.age = -delay; p.life = 650 + Math.random() * 400;
      p.x = p.startX = x; p.y = p.startY = y;
      p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.gravity = 140 * scale; p.size = (2 + Math.random() * 3) * scale; p.growth = 0;
      p.rotation = angle; p.spin = (Math.random() - .5) * 7; p.alpha = .9; p.color = 0xffc878;
      if (kind === 'smoke' || kind === 'dust') {
        p.life = kind === 'smoke' ? 1100 : 750;
        p.vx *= .32; p.vy = (-18 - Math.random() * 35) * scale; p.gravity = 0;
        p.size = (kind === 'smoke' ? 28 + Math.random() * 24 : 6 + Math.random() * 10) * scale;
        p.growth = (kind === 'smoke' ? 45 : 16) * scale;
        p.alpha = kind === 'smoke' ? .22 : .28; p.color = kind === 'smoke' ? 0xaaa195 : 0xd2b991;
      } else if (kind === 'fire') {
        p.life = 480 + Math.random() * 240; p.size = (22 + Math.random() * 30) * scale;
        p.vx *= .55; p.vy *= .55; p.gravity = -40 * scale; p.growth = 30 * scale;
        p.alpha = .75; p.color = i % 3 ? 0xe66e19 : 0xffd785;
      } else if (kind === 'spark') {
        p.life = 380 + Math.random() * 320; p.size = (3 + Math.random() * 4) * scale;
        p.color = i % 3 ? 0xffc35c : 0xffeed0; p.rotation = angle; p.spin = 0;
      } else if (kind === 'chip') {
        p.color = i % 2 ? 0x845534 : 0xd5a36b; p.size *= 1.25;
      } else if (kind === 'foam') {
        p.life = 800; p.vx *= .3; p.vy = (-25 - Math.random() * 45) * scale; p.gravity = 0;
        p.size = (3 + Math.random() * 4) * scale; p.color = i % 3 ? 0xffe9b8 : 0xe2b15e; p.alpha = .65;
      } else if (kind === 'ash') {
        p.life = 1100; p.vx *= .3; p.vy = (-20 - Math.random() * 50) * scale; p.gravity = 0;
        p.color = i % 4 ? 0xa8aaa1 : 0xe8b879; p.alpha = .6;
      } else if (kind === 'confetti') {
        p.life = 1100; p.vx *= 1.8; p.vy = (-100 - Math.random() * 140) * scale;
        p.gravity = 410 * scale; p.size = (4 + Math.random() * 4) * scale; p.color = colors[i % colors.length];
      } else if (kind === 'ambient') {
        p.life = 6500 + Math.random() * 3000; p.vx = (Math.random() - .5) * 7 * scale;
        p.vy = (-3 - Math.random() * 5) * scale; p.gravity = 0; p.size = (1 + Math.random() * 1.5) * scale;
        p.alpha = .16; p.color = Math.random() > .2 ? 0xe4c698 : 0xf2a754; p.spin = 0; this.ambient++;
      }
      this.count++;
      this.cursor = (this.cursor + 1) % PARTICLE_LIMIT;
    }
  }

  step(ms: number) {
    const dt = Math.min(ms, 50) / 1000;
    for (let i = 0; i < this.slots.length; i++) {
      const p = this.slots[i];
      if (!p.life) continue;
      p.age += ms;
      if (p.age >= p.life) {
        if (p.kind === 'ambient') { p.age %= p.life; p.x = p.startX; p.y = p.startY; }
        else { p.life = 0; this.count--; continue; }
      }
      if (p.age < 0) continue;
      p.vx *= 1 - dt * .7; p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rotation += p.spin * dt;
    }
  }

  clear(only: 'ambient' | 'transient' | 'all' = 'all') {
    for (const p of this.slots) if (p.life && (only === 'all' || (p.kind === 'ambient') === (only === 'ambient'))) { p.life = 0; this.count--; if (p.kind === 'ambient') this.ambient--; }
  }
  destroy() { this.clear(); this.slots.length = 0; this.destroyed = true; }
}
