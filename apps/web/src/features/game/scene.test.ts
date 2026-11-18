import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sceneFiles, landscapeScenes } from './assetMap.ts';

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

test('desktop scenes map each player count to its bundled WebP', async () => {
  assert.deepEqual(landscapeScenes, { 4: '/scene/scene4-landscape.webp', 5: '/scene/scene5-landscape.webp', 6: '/scene/scene6-landscape.webp', 7: '/scene/scene-landscape.webp' });
  assert.equal(new Set(Object.values(landscapeScenes)).size, 4);
  for (const url of Object.values(landscapeScenes)) {
    const data = await readFile(new URL(`../../../../../assets${url}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    assert.ok(data.length > 1024);
  }
});
