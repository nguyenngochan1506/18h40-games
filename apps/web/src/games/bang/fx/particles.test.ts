import assert from 'node:assert/strict';
import test from 'node:test';
import { AMBIENT_LIMIT, PARTICLE_LIMIT, ParticlePool, particleBursts, winnerColors } from './particles.ts';
import { eventsToFx, scheduleFx, particlePolicy } from './fx.ts';
import { demoFx } from '../demo/demoFx.ts';
import { demoGame } from '../demo/demo.ts';

test('optional particle renderer requires a desktop viewport, WebGL and normal motion', () => {
  const good = { width: 1280, reduced: false, webgl: true, cores: 8, memory: 8 };
  assert.deepEqual(particlePolicy(good), { enabled: true, ambient: true });
  for (const state of [{ width: 899 }, { reduced: true }, { webgl: false }]) assert.equal(particlePolicy({ ...good, ...state }).enabled, false);
  assert.equal(particlePolicy({ ...good, width: 900 }).enabled, true);
  for (const state of [{ cores: 4 }, { memory: 4 }, { saveData: true }]) assert.deepEqual(particlePolicy({ ...good, ...state }), { enabled: true, ambient: false });
});

test('particles follow existing cues, including the scheduled six shots of a seven-seat Gatling', () => {
  assert.deepEqual(particleBursts('shot').map(b => [b.kind, b.origin ?? false, b.delay ?? 0]), [['spark', true, 0], ['smoke', true, 0], ['spark', false, .6], ['dust', false, .6]]);
  const expected = { damage: ['chip', 'dust'], explosion: ['smoke', 'fire', 'spark', 'chip'], heal: ['foam', 'spark'], deflect: ['dust', 'spark'], jail: ['dust'], escape: ['dust'], eliminate: ['smoke', 'ash'], win: ['confetti'] } as const;
  for (const [kind, kinds] of Object.entries(expected)) assert.deepEqual(particleBursts(kind as keyof typeof expected).map(b => b.kind), kinds);
  for (const kind of ['card', 'equip', 'duel', 'indians', 'reveal', 'turn'] as const) assert.deepEqual(particleBursts(kind), []);
  assert.equal(demoGame.view.perspective, 'player');
  if (demoGame.view.perspective !== 'player') return;
  const first = demoGame.view.view.table.players[0];
  const players = Array.from({ length: 7 }, (_, id) => ({ ...first, id, alive: true }));
  const jobs = scheduleFx(eventsToFx(demoFx.gatling.events, { players, seats: demoGame.seats, you: 0 }));
  assert.equal(jobs.filter(j => j.kind === 'shot').length, 6);
  assert.deepEqual(jobs.filter(j => j.kind === 'shot').map(j => j.to), [1, 2, 3, 4, 5, 6]);
  assert.ok(jobs.reduce((sum, j) => sum + particleBursts(j.kind).reduce((n, b) => n + b.count, 0), 0) < PARTICLE_LIMIT);
});

test('pool has a hard total cap, ambient cap, no slot allocation and no residue across five bursts', () => {
  const pool = new ParticlePool(), slots = pool.slots.slice();
  for (let round = 0; round < 5; round++) {
    pool.spawn('ambient', 100, 0, 0);
    assert.equal(pool.ambient, AMBIENT_LIMIT);
    pool.spawn('chip', 1000, 0, 0);
    assert.equal(pool.count, PARTICLE_LIMIT);
    pool.spawn('fire', 50, 0, 0);
    assert.equal(pool.count, PARTICLE_LIMIT);
    for (let frame = 0; frame < 100; frame++) pool.step(16.67);
    assert.equal(pool.count, AMBIENT_LIMIT);
    pool.clear('ambient');
    assert.equal(pool.count, 0);
    assert.equal(pool.ambient, 0);
    for (let i = 0; i < slots.length; i++) assert.equal(pool.slots[i], slots[i]);
  }
});

test('delayed impacts wait, transient cancellation preserves ambience and destroy prevents resurrection', () => {
  const pool = new ParticlePool();
  pool.spawn('spark', 1, 20, 30, 1, 500);
  const p = pool.slots.find(p => p.life)!;
  pool.step(250); assert.equal(p.x, 20); assert.equal(p.y, 30); assert.equal(p.age, -250);
  pool.step(300); assert.notEqual(p.x, 20);
  pool.spawn('ambient', 4, 20, 30);
  pool.clear('transient'); assert.equal(pool.count, 4); assert.equal(pool.ambient, 4);
  pool.spawn('smoke', 10, 20, 30);
  pool.clear('ambient'); assert.equal(pool.count, 10); assert.equal(pool.ambient, 0);
  pool.destroy(); pool.destroy(); pool.spawn('spark', 10, 20, 30); pool.step(1000);
  assert.equal(pool.count, 0); assert.equal(pool.ambient, 0); assert.equal(pool.slots.length, 0);
});

test('confetti uses the winning faction palette', () => {
  assert.notDeepEqual(winnerColors('outlaws'), winnerColors('sheriff_and_deputies'));
  assert.notDeepEqual(winnerColors({ renegade: { player: 2 } }), winnerColors('outlaws'));
  assert.deepEqual(winnerColors(null), winnerColors('sheriff_and_deputies'));
});
