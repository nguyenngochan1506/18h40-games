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

const { SOUND_COMMIT, bangSoundIds } = await import('../apps/web/src/features/game/soundCatalog.ts');
function validMp3(bytes) {
  return bytes.length >= 128 && bytes.length <= 2 * 1024 * 1024
    && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}
if (bangSoundIds.length !== 12 || new Set(bangSoundIds).size !== 12) throw new Error('Expected exactly 12 optional sounds');
let soundsDownloaded = 0, soundsReused = 0, soundsMissing = 0;
for (const id of bangSoundIds) {
  if (!/^[a-z]+$/.test(id)) throw new Error(`Invalid sound id: ${id}`);
  const destination = fileURLToPath(new URL(`../assets/bang/sounds/${id}.mp3`, import.meta.url));
  try { if (validMp3(await readFile(destination))) { soundsReused++; continue; } } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${destination}.tmp`;
  try {
    const response = await fetch(`https://raw.githubusercontent.com/bangsalvoserver/bangweb/${SOUND_COMMIT}/public/sounds/${id}.mp3`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!validMp3(bytes)) throw new Error('Invalid or oversized MP3');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(temporary, bytes); await rename(temporary, destination); soundsDownloaded++;
    process.stdout.write(`Fetched sound: ${id}\n`);
  } catch (error) { soundsMissing++; process.stderr.write(`Optional sound ${id}: ${error.message}; synthesized fallback remains available.\n`); }
  finally { await rm(temporary, { force: true }); }
}
process.stdout.write(`BANG sounds ${SOUND_COMMIT}: downloaded ${soundsDownloaded}, reused ${soundsReused}, unavailable ${soundsMissing}.\n`);
