import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkBoundaries } from './check-game-boundaries.mjs';

test('AST boundary checks imports, exports, import types and dynamic imports with resolved paths', t => {
  const root = mkdtempSync(join(tmpdir(), 'game-boundaries-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    'games/a/index.ts': 'export const a = 1;', 'games/b/index.ts': 'export const b = 2;',
    'app/index.ts': 'export const app = 1;',
    'games/types.ts': 'export type Client = {};',
    'games/registry.ts': "export const load = () => import('./a');",
    'shared/ok.ts': "import type { Client } from '../games/types'; export { load } from '../games/registry';",
  };
  for (const [file, source] of Object.entries(files)) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), source); }
  assert.deepEqual(checkBoundaries(root), []);
  writeFileSync(join(root, 'games/a/bad.ts'), "import '../b'; export { b } from '../b/index'; type B = import('../b').B; const load = () => import('../b'); import '../../shared/ok'; import '../../app';");
  writeFileSync(join(root, 'shared/bad.ts'), "import '../games/a'; const other = '../games/b'; import(other);");
  const errors = checkBoundaries(root);
  assert.equal(errors.filter(error => error.includes('cross-game')).length, 4);
  assert.ok(errors.some(error => error.includes('shell importing game implementation')));
  assert.ok(errors.some(error => error.includes('game importing shell')));
  assert.ok(errors.some(error => error.includes('dynamic import must')));
  writeFileSync(join(root, 'games/a/unresolved.ts'), "import('./missing'); import('missing-package-for-game-boundary-test');");
  const unresolved = checkBoundaries(root);
  assert.ok(unresolved.some(error => error.includes('cannot resolve ./missing')));
  assert.ok(unresolved.some(error => error.includes('cannot resolve missing-package-for-game-boundary-test')));
});

test('UNO cannot import the Werewolf implementation', t => {
  const root = mkdtempSync(join(tmpdir(), 'game-boundaries-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, source] of Object.entries({
    'games/uno/index.ts': "import '../werewolf';",
    'games/werewolf/index.ts': 'export const client = {};',
  })) {
    mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), source);
  }
  assert.deepEqual(checkBoundaries(root), ['games/uno/index.ts:1: cross-game import: ../werewolf']);
});
