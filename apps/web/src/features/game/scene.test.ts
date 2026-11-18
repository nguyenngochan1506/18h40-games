import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sceneFiles } from './assetMap.ts';

test('scene URLs map to the four bundled WebP files', async () => {
  assert.deepEqual(sceneFiles, {
    background: '/scene/saloon-bg.webp', table: '/scene/table.webp',
    cowboy: '/scene/cowboy.webp', ghost: '/scene/ghost.webp',
  });
  for (const url of Object.values(sceneFiles)) {
    const data = await readFile(new URL(`../../../../../assets${url}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', url);
    assert.ok(data.length > 1024, url);
  }
});
