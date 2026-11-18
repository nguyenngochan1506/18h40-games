import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoGame } from '../apps/web/src/features/game/demo.ts';

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
  assert.ok(!fixture.test(source), `Demo fixture leaked into production: ${entry.name}`);
  checked += 1;
}
assert.ok(checked > 0, 'Production JavaScript must exist before checking demo exclusion');
console.log(`Production demo exclusion: PASS (${checked} JavaScript files checked)`);
