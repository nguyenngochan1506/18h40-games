import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_BASE_URL, ASSET_COMMIT, assetFiles } from '../apps/web/src/features/game/assetMap.ts';

function validWebp(bytes) {
  return bytes.length >= 32 && bytes.length <= 2 * 1024 * 1024
    && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    && bytes.readUInt32LE(4) + 8 === bytes.length;
}

if (assetFiles.length !== 44 || new Set(assetFiles).size !== 44) throw new Error('Expected exactly 44 base-game assets');
let downloaded = 0;
for (const file of assetFiles) {
  if (!/^(main_deck|character|role|backface)\/[a-z0-9_]+\.webp$/.test(file)) throw new Error(`Invalid asset path: ${file}`);
  const destination = fileURLToPath(new URL(`../assets/bang/${file}`, import.meta.url));
  try { if (validWebp(await readFile(destination))) continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(`${ASSET_BASE_URL}${file}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed: ${file} (HTTP ${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!validWebp(bytes)) throw new Error(`Invalid or truncated WebP: ${file}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
  downloaded += 1;
  process.stdout.write(`Fetched ${downloaded}: ${file}\n`);
}
process.stdout.write(`BANG! ${ASSET_COMMIT}: 44 valid files; downloaded ${downloaded}, reused ${44 - downloaded}.\n`);
