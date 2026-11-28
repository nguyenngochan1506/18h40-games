import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { ASSET_COMMIT, assetFiles, cardFiles, characterFiles, roleFiles, backFiles, dodgeCityArt, cardArt } from './scene/assetMap.ts';
import { cards, characters, roles } from './i18n.ts';
import { cardCatalog, cardFace, DODGE_CITY_FIRST_CARD } from './cardCatalog.ts';

const protocol = await readFile(new URL('../../generated/protocol.ts', import.meta.url), 'utf8');
function keys(type: string) {
  const declaration = protocol.match(new RegExp(`export type ${type} = ([^;]+);`))![1];
  return [...declaration.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();
}

test('asset whitelist covers base and Dodge City art at the pinned commit', () => {
  assert.equal(ASSET_COMMIT, 'dc7c29abffc566629ab0fae3bb3386280a7ae52c');
  assert.deepEqual(Object.keys(cardFiles).sort(), keys('CardKind'));
  assert.deepEqual(Object.keys(characterFiles).sort(), keys('Character'));
  assert.deepEqual(Object.keys(roleFiles).sort(), keys('BangRole'));
  assert.equal(Object.keys(cardFiles).length, 44);
  assert.equal(Object.keys(characterFiles).length, 31);
  assert.equal(Object.keys(roleFiles).length, 4);
  assert.equal(Object.keys(backFiles).length, 2);
  assert.equal(assetFiles.length, 93, '44 base + 34 pack cards + 15 pack characters');
  assert.equal(new Set(assetFiles).size, 93);
  for (const file of assetFiles) assert.match(file, /^(main_deck\/0[13]_[a-z_]+|character\/0[13]_[a-z_]+|role\/(sheriff|deputy|outlaw|renegade)|backface\/(main_deck|role))\.webp$/);
  assert.equal(cardFiles.scope, 'main_deck/01_mirino.webp');
  assert.equal(cardFiles.rev_carabine, 'main_deck/01_carabine.webp');
  assert.equal(characterFiles.slab_the_killer, 'character/01_slab.webp');
});

test('approved copy has every card, character and role with English card/character names', () => {
  assert.deepEqual(Object.keys(cards).sort(), keys('CardKind'));
  assert.deepEqual(Object.keys(characters).sort(), keys('Character'));
  assert.deepEqual(Object.keys(roles).sort(), keys('BangRole'));
  for (const card of Object.values(cards)) { assert.ok(card.effect.length > 4); assert.match(card.name, /^[A-Za-z .!]+$/); }
  for (const character of Object.values(characters)) { assert.ok(character.ability.length > 4); assert.match(character.name, /^[A-Za-z ]+$/); }
  assert.deepEqual(Object.values(roles).map((role) => role.name), ['Cảnh sát trưởng', 'Phó cảnh sát', 'Tội phạm', 'Kẻ phản bội']);
});

test('every physical CardId face matches the tracked Rust catalog, including duplicate Stagecoach cards', async () => {
  const rust = await readFile(new URL('../../../../../crates/bang/src/model/cards.rs', import.meta.url), 'utf8');
  const rankNames = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const rankLabels = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits: Record<string, string> = { Spades: '♠', Hearts: '♥', Diamonds: '♦', Clubs: '♣' };
  const dodge = await readFile(new URL('../../../../../crates/bang/src/model/dodge_city.rs', import.meta.url), 'utf8');
  const expected = [...(rust + dodge).matchAll(/Card::new\((\w+), (\w+), (\w+)\)/g)].map(([, kind, suit, rank]) => ({
    kind: kind.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(), suit: suits[suit], rank: rankLabels[rankNames.indexOf(rank)],
  }));
  assert.equal(expected.length, 120);
  assert.deepEqual(cardCatalog, expected);
  assert.deepEqual(cardFace(60), cardFace(61));
  assert.equal(cardFace(DODGE_CITY_FIRST_CARD)?.kind, 'barrel');
  assert.equal(cardFace(120), undefined);
});

test('Dodge City art: every pack kind and character has a real file, nothing in 03_* is unmapped, and pack cards use their own picture', async () => {
  assert.equal(Object.keys(dodgeCityArt.cards).length, 34, 'One picture per kind in the pack, including kinds shared with the base deck');
  assert.equal(Object.keys(dodgeCityArt.characters).length, 15);
  const root = new URL('../../../../../assets/bang/', import.meta.url);
  const mapped = new Set<string>([...Object.values(dodgeCityArt.cards), ...Object.values(dodgeCityArt.characters)]);
  for (const file of mapped) assert.ok((await readFile(new URL(file, root)).catch(() => null))?.length, `${file} missing`);
  for (const dir of ['main_deck', 'character']) for (const file of await readdir(new URL(`${dir}/`, root))) {
    if (file.startsWith('03_')) assert.ok(mapped.has(`${dir}/${file}`), `${dir}/${file} exists but is not mapped`);
  }
  // Every pack card id has a pack picture; the base deck keeps its own.
  for (let id = DODGE_CITY_FIRST_CARD; id < cardCatalog.length; id++) assert.match(cardArt(id, cardFace(id)!.kind), /^main_deck\/03_/);
  assert.equal(cardArt(1, 'bang'), 'main_deck/01_bang.webp');
  assert.equal(cardArt(DODGE_CITY_FIRST_CARD + 7, 'bang'), 'main_deck/03_bang.webp');
  assert.equal(cardFiles.punch, 'main_deck/03_pugno.webp');
  assert.equal(cardFiles.bang, 'main_deck/01_bang.webp', 'Shared kinds keep the base picture for tooltips');
  assert.equal(characterFiles.vera_custer, 'character/03_vera_custer.webp');
  // Every file the UI can ask for exists on disk.
  for (const file of [...Object.values(cardFiles), ...Object.values(characterFiles), ...assetFiles]) assert.ok((await readFile(new URL(file, root)).catch(() => null)), `${file} missing`);
});
