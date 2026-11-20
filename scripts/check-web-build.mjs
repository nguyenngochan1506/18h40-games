import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userSoundIds } from '../apps/web/src/games/bang/sound/soundCatalog.ts';
import { seatActorFiles } from '../apps/web/src/games/bang/scene/assetMap.ts';
import { demoGame } from '../apps/web/src/games/bang/demo/demo.ts';

const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Match fixture data, not demo UI text that tree-shaking can remove separately.
const names = demoGame.seats.map((seat) => escape(seat.nickname)).join('|');
const quote = "[\"'`]";
const fixture = new RegExp(`(?:${quote}nickname${quote}|\\bnickname)\\s*:\\s*${quote}(?:${names})${quote}`);
let checked = 0;
for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const source = await readFile(join(entry.parentPath, entry.name), 'utf8');
  assert.ok(!source.includes('data-demo-particles') && !source.includes('demo-particle-controls') && !source.includes('data-demo-drag') && !source.includes('demo-drag-controls') && !source.includes('data-demo-fx') && !source.includes('demo-fx-controls') && !source.includes('data-demo-motion') && !source.includes('demo-motion-controls') && !source.includes('data-demo-sound') && !source.includes('demo-sound-controls'), `Demo FX controls leaked into production: ${entry.name}`);
  assert.ok(!fixture.test(source), `Demo fixture leaked into production: ${entry.name}`);
  checked += 1;
}
assert.ok(checked > 0, 'Production JavaScript must exist before checking demo exclusion');
const manifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8'));
const particleChunk = manifest['src/games/bang/fx/ParticleRenderer.ts'];
assert.ok(particleChunk?.isDynamicEntry, 'Pixi particle renderer must be a lazy production chunk');
const entry = Object.values(manifest).find(chunk => chunk.isEntry);
const bangEntry = manifest['src/games/bang/index.ts'];
assert.ok(bangEntry?.isDynamicEntry, 'BANG must be a lazy production chunk');
const reachable = new Set();
function visit(key) { if (reachable.has(key)) return; reachable.add(key); for (const next of manifest[key]?.imports ?? []) visit(next); }
for (const [key, value] of Object.entries(manifest)) if (value.isEntry) visit(key);
assert.ok(!reachable.has('src/games/bang/index.ts') && !reachable.has('src/games/bang/fx/ParticleRenderer.ts'), 'Shell must not eagerly import BANG or Pixi');
for (const game of ['uno', 'werewolf']) {
  const key = `src/games/${game}/client.ts`;
  assert.ok(manifest[key]?.isDynamicEntry, `${game} scaffold must be a lazy production chunk`);
  assert.ok(!reachable.has(key), `Shell must not eagerly import ${game}`);
}
console.log('Production lazy UNO/Werewolf scaffolds: PASS');
assert.ok(bangEntry.dynamicImports?.includes('src/games/bang/fx/ParticleRenderer.ts'), 'BANG chunk must lazily import the particle renderer');
assert.match(await readFile(join(dist, particleChunk.file), 'utf8'), /WebGL/, 'Lazy particle chunk must contain the Pixi WebGL renderer');
console.log(`Production lazy particle renderer: PASS (${particleChunk.file})`);
console.log(`Production demo exclusion: PASS (${checked} JavaScript files checked)`);

for (const url of seatActorFiles) {
  const source = await readFile(new URL(`../assets${url}`, import.meta.url));
  assert.deepEqual(await readFile(join(dist, url)), source, `Required seat portrait missing from build: ${url}`);
}
console.log(`Required seat portraits: PASS (${seatActorFiles.length} WebP files bundled)`);

for (const id of userSoundIds) {
  const url = `bang/sfx/${id}.mp3`;
  assert.deepEqual(await readFile(join(dist, url)), await readFile(new URL(`../assets/${url}`, import.meta.url)), `Required sound missing from build: ${id}`);
}
console.log(`Required user sounds: PASS (${userSoundIds.length} MP3 files bundled)`);
