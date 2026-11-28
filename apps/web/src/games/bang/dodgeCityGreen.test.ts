import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DecisionKind, SpectatorView } from '../../generated/protocol.ts';
import { demoGame } from './demo/demo.ts';
import { discardCount, endTurnAction, responseCard, activateGreenAction, actionMode, chooseCopyAction, chooseDrawSourceAction, chuckAction, docAction, docTargets, emptyDraft, greenTargets, joseAction, respondAction, vultureTakeAction } from './actions.ts';
import { greenStatus } from './equipment.ts';
import { cardCatalog } from './cardCatalog.ts';

const id = (kind: string, nth = 0) => cardCatalog.map((card, index) => ({ card, index })).filter(({ card, index }) => card.kind === kind && index >= 80)[nth].index;
type Own = SpectatorView['players'][number];
// Demo table: players 0, 1, 2, 4 alive; 0 is next to 1 and 4 and two seats from 2. Neutral characters, no equipment.
function game(hand: number[], tweak?: (table: SpectatorView, own: Own) => void, waiting: DecisionKind = { type: 'turn' }) {
  const g = structuredClone(demoGame);
  if (g.view.perspective !== 'player') throw new Error('player');
  g.view.view.hand = hand;
  const table = g.view.view.table;
  table.turn.player = 0; table.turn.bangs_played = 0;
  table.waiting = { player: 0, pending_id: waiting.type === 'turn' ? null : 7, kind: waiting };
  table.players[0].character = 'bart_cassidy'; table.players[0].weapon_range = 1;
  for (const player of table.players) player.in_play = [];
  tweak?.(table, table.players[0]);
  return g;
}
const withGreen = (kind: string, ready = true, extra?: (table: SpectatorView, own: Own) => void) => game([1, 26], (table, own) => { own.in_play = [id(kind)]; own.green_ready = ready ? [id(kind)] : []; extra?.(table, own); });
const draft = (card: number, target: number | null = null, selection: 'hand' | { in_play: number } | null = null) => ({ ...emptyDraft, green: card, target, selection });

test('green cards with no target are confirmed once ready, never while waiting', () => {
  for (const kind of ['bible', 'canteen', 'pony_express', 'howitzer']) {
    const ready = withGreen(kind), card = id(kind);
    assert.deepEqual(activateGreenAction(ready, draft(card), false), { type: 'activate_green', card, target: null, selection: null }, kind);
    assert.equal(activateGreenAction(withGreen(kind, false), draft(card), false), null, `${kind} just placed`);
  }
  for (const kind of ['ten_gallon_hat', 'iron_plate', 'sombrero']) assert.equal(activateGreenAction(withGreen(kind), draft(id(kind)), false), null, `${kind} only answers Missed!`);
});

test('Derringer and Knife reach distance 1, Pepperbox the weapon range, Buffalo Rifle anyone else', () => {
  const ids = (kind: string) => greenTargets(withGreen(kind), id(kind)).map(player => player.id);
  assert.deepEqual(ids('derringer'), [1, 4]);
  assert.deepEqual(ids('knife'), [1, 4]);
  assert.deepEqual(ids('pepperbox'), [1, 4], 'Colt range 1');
  assert.deepEqual(greenTargets(withGreen('pepperbox', true, (_t, own) => { own.weapon_range = 2; }), id('pepperbox')).map(player => player.id), [1, 2, 4]);
  assert.deepEqual(ids('buffalo_rifle'), [1, 2, 4]);
  const far = withGreen('derringer'), card = id('derringer');
  assert.equal(activateGreenAction(far, draft(card, 2), false), null, 'Distance 2 is refused');
  assert.deepEqual(activateGreenAction(far, draft(card, 1), false), { type: 'activate_green', card, target: 1, selection: null });
});

test('Apache Kid ignores diamond green cards and Belle Star switches other players cards off', () => {
  const kinds = ['buffalo_rifle', 'derringer', 'can_can'].map(kind => [kind, cardCatalog[id(kind)].suit] as const);
  for (const [kind, suit] of kinds) {
    const g = withGreen(kind, true, table => { table.players[1].character = 'apache_kid'; });
    assert.equal(greenTargets(g, id(kind)).some(player => player.id === 1), suit !== '♦', `${kind} ${suit}`);
  }
  const belle = withGreen('derringer', true, table => { table.players[1].in_play = [id('mustang')]; table.players[0].character = 'belle_star'; });
  assert.equal(greenTargets(belle, id('derringer')).some(player => player.id === 1), true, "Belle Star: the other player's Mustang is off");
});

test('Can Can and Conestoga pick a hand card or a table card, never the green card being spent', () => {
  for (const kind of ['can_can', 'conestoga']) {
    const g = withGreen(kind, true, table => { table.players[1].in_play = [id('barrel')]; }), card = id(kind);
    assert.deepEqual(greenTargets(g, card).map(player => player.id), [0, 1, 2, 4]);
    assert.equal(activateGreenAction(g, draft(card, 1), false), null, 'A selection is required');
    assert.deepEqual(activateGreenAction(g, draft(card, 1, 'hand'), false), { type: 'activate_green', card, target: 1, selection: 'hand' });
    assert.deepEqual(activateGreenAction(g, draft(card, 1, { in_play: id('barrel') }), false)?.type, 'activate_green');
    assert.equal(activateGreenAction(g, draft(card, 0, { in_play: card }), false), null, 'The card being used cannot be picked');
  }
});

test('ready green Missed! cards answer a shot, but not Duel or Indians!', () => {
  const missed = { type: 'attack_response', kind: 'bang', remaining: 1, checks_left: 0 } as const;
  for (const kind of ['bible', 'ten_gallon_hat', 'iron_plate', 'sombrero']) {
    const card = id(kind);
    const answering = game([1], (_t, own) => { own.in_play = [card]; own.green_answers = [card]; }, missed);
    assert.deepEqual(respondAction(answering, card, false), { type: 'respond', pending_id: 7, card }, kind);
    const waiting = game([1], (_t, own) => { own.in_play = [card]; own.green_answers = []; }, missed);
    assert.equal(respondAction(waiting, card, false), null, `${kind} placed this turn`);
    for (const other of [{ type: 'duel' }, { type: 'attack_response', kind: 'indians', remaining: 1, checks_left: 0 }] as const) {
      assert.equal(respondAction(game([1], (_t, own) => { own.in_play = [card]; own.green_answers = [card]; }, other), card, false), null, `${kind} vs ${other.type}`);
    }
  }
});

test('green card status says placed, ready or able to answer', () => {
  const bible = id('bible'), own = { green_ready: [bible], green_answers: [bible] };
  assert.match(greenStatus(own, bible)!, /Sẵn sàng/);
  assert.match(greenStatus(own, bible)!, /đỡ được Missed!/);
  assert.match(greenStatus({ green_ready: [], green_answers: [] }, id('bible'))!, /Vừa đặt/);
  assert.equal(greenStatus(own, id('barrel')), undefined);
});

test('Chuck Wengam never spends his last life; José needs a blue card; Doc needs two cards, range and a legal target', () => {
  assert.deepEqual(chuckAction(game([], (_t, own) => { own.character = 'chuck_wengam'; own.health = 2; }), false), { type: 'chuck_draw' });
  assert.equal(chuckAction(game([], (_t, own) => { own.character = 'chuck_wengam'; own.health = 1; }), false), null);
  assert.equal(chuckAction(game([]), false), null);
  const jose = game([id('barrel'), 1, id('bible')], (_t, own) => { own.character = 'jose_delgado'; });
  assert.deepEqual(joseAction(jose, id('barrel'), false), { type: 'jose_delgado', card: id('barrel') });
  assert.equal(joseAction(jose, 1, false), null);
  assert.equal(joseAction(jose, id('bible'), false), null, 'Green cards are not blue');
  const doc = game([1, 26, 37], (_t, own) => { own.character = 'doc_holyday'; });
  assert.deepEqual(docAction(doc, [1, 26], 1, false), { type: 'doc_holyday', cards: [1, 26], target: 1 });
  assert.equal(docAction(doc, [1, 26], 2, false), null, 'Out of range');
  assert.equal(docAction(doc, [1], 1, false), null);
  const apache = game([1, 2], (table, own) => { own.character = 'doc_holyday'; table.players[1].character = 'apache_kid'; });
  assert.equal(docTargets(apache, [1, 2]).some(player => player.id === 1), false, 'Two diamonds');
  assert.equal(docTargets(apache, [1, 26]).some(player => player.id === 1), true, 'One non-diamond hits him');
});

test('Pat Brennan may take a card from the table instead of drawing', () => {
  const g = game([], (table, own) => { own.character = 'pat_brennan'; table.players[2].in_play = [id('barrel')]; }, { type: 'draw_choice' });
  assert.equal(actionMode(g), 'draw_choice');
  const source = { in_play: { player: 2, card: id('barrel') } };
  assert.deepEqual(chooseDrawSourceAction(g, source, false), { type: 'choose_draw_source', pending_id: 7, source });
  assert.equal(chooseDrawSourceAction(g, { in_play: { player: 2, card: id('mustang') } }, false), null);
  assert.equal(chooseDrawSourceAction(game([], undefined, { type: 'draw_choice' }), source, false), null, 'Only Pat');
});

test('Vera Custer chooses a living character and Vulture Sam shares the loot', () => {
  const copy = game([], undefined, { type: 'choose_copy' });
  assert.equal(actionMode(copy), 'choose_copy');
  assert.deepEqual(chooseCopyAction(copy, 2, false), { type: 'choose_copy', pending_id: 7, target: 2 });
  assert.equal(chooseCopyAction(copy, 0, false), null, 'Not herself');
  assert.equal(chooseCopyAction(copy, 3, false), null, 'Not a dead player');
  const loot = game([], table => { table.loot_table = [id('barrel')]; }, { type: 'vulture_split', victim: 1, hand_count: 2, table_count: 1 });
  assert.equal(actionMode(loot), 'vulture_split');
  assert.deepEqual(vultureTakeAction(loot, 'hand', false), { type: 'vulture_take', pending_id: 7, selection: 'hand' });
  assert.deepEqual(vultureTakeAction(loot, { in_play: id('barrel') }, false)?.type, 'vulture_take');
  assert.equal(vultureTakeAction(loot, { in_play: id('mustang') }, false), null, 'Not in the loot table');
  const empty = game([], table => { table.loot_table = [id('barrel')]; }, { type: 'vulture_split', victim: 1, hand_count: 0, table_count: 1 });
  assert.equal(vultureTakeAction(empty, 'hand', false), null, 'No face-down card left');
});

const usedUp = (g: ReturnType<typeof game>, uses: { doc_holyday: boolean; jose_delgado: number; vera_copy: boolean }) => { if (g.view.perspective === 'player') g.view.view.skill_uses = uses; return g; };

test('José and Doc lock after their per-turn limit, also when Vera copies them', () => {
  const hand = [id('barrel'), id('mustang'), 1, 26];
  for (const [character, copied] of [['jose_delgado', undefined], ['vera_custer', 'jose_delgado']] as const) {
    const make = (uses: number) => usedUp(game(hand, (_t, own) => { own.character = character; own.copied = copied; }), { doc_holyday: false, jose_delgado: uses, vera_copy: false });
    assert.deepEqual(joseAction(make(1), id('barrel'), false), { type: 'jose_delgado', card: id('barrel') }, `${character} after one use`);
    assert.equal(joseAction(make(2), id('barrel'), false), null, `${character} after two uses`);
  }
  for (const [character, copied] of [['doc_holyday', undefined], ['vera_custer', 'doc_holyday']] as const) {
    const make = (used: boolean) => usedUp(game([1, 26], (_t, own) => { own.character = character; own.copied = copied; }), { doc_holyday: used, jose_delgado: 0, vera_copy: false });
    assert.deepEqual(docAction(make(false), [1, 26], 1, false), { type: 'doc_holyday', cards: [1, 26], target: 1 }, character);
    assert.equal(docAction(make(true), [1, 26], 1, false), null, `${character} already shot`);
    assert.deepEqual(docTargets(make(true), [1, 26]), []);
  }
  // A new turn (or a reload) sends a fresh count, so the controls open again.
  assert.deepEqual(joseAction(usedUp(game(hand, (_t, own) => { own.character = 'jose_delgado'; }), { doc_holyday: false, jose_delgado: 0, vera_copy: false }), id('barrel'), false), { type: 'jose_delgado', card: id('barrel') });
});

test('Sean Mallory, or Vera copying him, keeps ten cards whatever his health', () => {
  const hand = Array.from({ length: 6 }, (_, i) => i + 1);
  for (const [character, copied] of [['sean_mallory', undefined], ['vera_custer', 'sean_mallory']] as const) {
    const g = game(hand, (_t, own) => { own.character = character; own.copied = copied; own.health = 2; });
    assert.equal(discardCount(g), 0, character);
    assert.deepEqual(endTurnAction(g, [], false), { type: 'end_turn', discard: [] });
  }
  const plain = game(hand, (_t, own) => { own.health = 2; });
  assert.equal(discardCount(plain), 4);
});

test('Elena Fuente, or Vera copying her, answers Missed! with any hand card but not a different request', () => {
  const beer = cardCatalog.findIndex(card => card.kind === 'beer');
  const missed = { type: 'attack_response', kind: 'bang', remaining: 1, checks_left: 0 } as const;
  for (const [character, copied] of [['elena_fuente', undefined], ['vera_custer', 'elena_fuente']] as const) {
    const g = game([beer], (_t, own) => { own.character = character; own.copied = copied; }, missed);
    assert.equal(responseCard(g, beer), true, character);
    assert.deepEqual(respondAction(g, beer, false), { type: 'respond', pending_id: 7, card: beer });
    assert.equal(responseCard(game([beer], (_t, own) => { own.character = character; own.copied = copied; }, { type: 'duel' }), beer), false, 'Duel still needs a BANG!');
    // Green cards keep their own rule: a placed one does not answer.
    const bible = id('bible');
    assert.equal(responseCard(game([beer], (_t, own) => { own.character = character; own.copied = copied; own.in_play = [bible]; own.green_answers = []; }, missed), bible), false);
  }
  assert.equal(responseCard(game([beer], undefined, missed), beer), false, 'Nobody else');
});
