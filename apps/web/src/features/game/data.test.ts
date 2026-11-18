import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ASSET_COMMIT, assetFiles, cardFiles, characterFiles, roleFiles, backFiles } from './assetMap.ts';
import { cards, characters, roles } from './i18n.ts';
import { cardCatalog, cardFace } from './cardCatalog.ts';

const protocol = await readFile(new URL('../../generated/protocol.ts', import.meta.url), 'utf8');
function keys(type: string) {
  const declaration = protocol.match(new RegExp(`export type ${type} = ([^;]+);`))![1];
  return [...declaration.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();
}

test('asset whitelist covers exactly 22 cards, 16 characters, 4 roles and 2 backs at the pinned commit', () => {
  assert.equal(ASSET_COMMIT, 'dc7c29abffc566629ab0fae3bb3386280a7ae52c');
  assert.deepEqual(Object.keys(cardFiles).sort(), keys('CardKind'));
  assert.deepEqual(Object.keys(characterFiles).sort(), keys('Character'));
  assert.deepEqual(Object.keys(roleFiles).sort(), keys('BangRole'));
  assert.equal(Object.keys(cardFiles).length, 22);
  assert.equal(Object.keys(characterFiles).length, 16);
  assert.equal(Object.keys(roleFiles).length, 4);
  assert.equal(Object.keys(backFiles).length, 2);
  assert.equal(assetFiles.length, 44);
  assert.equal(new Set(assetFiles).size, 44);
  for (const file of assetFiles) assert.match(file, /^(main_deck\/01_[a-z]+|character\/01_[a-z]+|role\/(sheriff|deputy|outlaw|renegade)|backface\/(main_deck|role))\.webp$/);
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
  const expected = [...rust.matchAll(/Card::new\((\w+), (\w+), (\w+)\)/g)].map(([, kind, suit, rank]) => ({
    kind: kind.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(), suit: suits[suit], rank: rankLabels[rankNames.indexOf(rank)],
  }));
  assert.equal(expected.length, 80);
  assert.deepEqual(cardCatalog, expected);
  assert.deepEqual(cardFace(60), cardFace(61));
  assert.equal(cardFace(80), undefined);
});
