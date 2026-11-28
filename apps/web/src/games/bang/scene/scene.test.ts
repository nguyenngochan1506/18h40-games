import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sceneFiles, landscapeScenes, seatActorFile, seatActorFiles, seatViews, cowboyVariants } from './assetMap.ts';

test('scene URLs map to the four bundled WebP files', async () => {
  assert.deepEqual(sceneFiles, {
    background: '/platform/saloon-bg.webp', table: '/bang/scene/table.webp',
    cowboy: '/bang/scene/cowboy.webp', ghost: '/bang/scene/ghost.webp',
  });
  for (const url of Object.values(sceneFiles)) {
    const data = await readFile(new URL(`../../../../../../assets${url}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', url);
    assert.ok(data.length > 1024, url);
  }
});

test('desktop scenes map each player count to its bundled WebP', async () => {
  assert.deepEqual(landscapeScenes, { 4: '/bang/scene/scene4-landscape.webp', 5: '/bang/scene/scene5-landscape.webp', 6: '/bang/scene/scene6-landscape.webp', 7: '/platform/waiting-table.webp', 8: '/platform/waiting-table.webp' });
  assert.equal(new Set(Object.values(landscapeScenes)).size, 4, 'eight seats reuse the seven-seat table art');
  for (const url of Object.values(landscapeScenes)) {
    const data = await readFile(new URL(`../../../../../../assets${url}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    assert.ok(data.length > 1024);
  }
});


test('all 21 required angled actors exist and every style, view and ghost maps correctly', async () => {
  assert.equal(seatActorFiles.length, 21);
  assert.equal(new Set(seatActorFiles).size, 21);
  for (let id = 0; id < 18; id++) {
    assert.equal(seatActorFile(id, 'front', false, cowboyVariants), cowboyVariants[id % 6]);
    assert.equal(seatActorFile(id, 'front', true), sceneFiles.ghost);
    for (const view of seatViews) {
      assert.equal(seatActorFile(id, view), `/platform/seat/cowboy-${'abcdef'[id % 6]}-${view}.webp`);
      assert.equal(seatActorFile(id, view, true), `/platform/seat/ghost-${view}.webp`);
      assert.ok(seatActorFiles.includes(seatActorFile(id, view)));
    }
  }
  for (const url of seatActorFiles) {
    const data = await readFile(new URL(`../../../../../../assets${url}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', url);
    assert.equal(data.toString('ascii', 12, 16), 'VP8X', url);
    assert.ok(data[20] & 16, `Alpha required: ${url}`);
    assert.deepEqual([data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1], [1086, 1448], url);
    assert.ok(data.length > 1024, url);
  }
});
