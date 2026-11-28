import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SpectatorView } from '../../generated/protocol.ts';
import { dragDestination, dropAction } from './drag/cardDrag.ts';
import { demoGame } from './demo/demo.ts';
import { actionMode, respondAction, responseCard, brawlTargets, effectiveDistance, emptyDraft, pickableHand, playAction, playTargets } from './actions.ts';
import { cardCatalog } from './cardCatalog.ts';

// Demo table: players 0, 1, 2, 4 are alive (3 is dead), so 0 sees 1 and 4 at distance 1 and 2 at distance 2.
const id = (kind: string, nth = 0) => cardCatalog.map((card, index) => ({ card, index })).filter(({ card, index }) => card.kind === kind && index >= 80)[nth].index;
function turn(hand: number[], tweak?: (table: SpectatorView, own: SpectatorView['players'][number]) => void) {
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw new Error('player');
  game.view.view.hand = hand;
  const table = game.view.view.table;
  table.turn.player = 0; table.turn.bangs_played = 0; // the demo fixture has already shot once
  table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } };
  // A neutral table: no character modifiers (the demo's own Rose Doolan is −1) and no equipment.
  table.players[0].character = 'bart_cassidy'; table.players[0].weapon_range = 1;
  for (const player of table.players) player.in_play = [];
  tweak?.(table, table.players[0]);
  return game;
}
const targets = (game: ReturnType<typeof turn>, card: number) => playTargets(game, card).map(player => player.id);

test('distance follows the living seats and equipment like the engine', () => {
  const game = turn([]);
  assert.deepEqual([1, 2, 4].map(to => effectiveDistance(game, 0, to)), [1, 2, 1]);
  const scoped = turn([], (table, own) => { own.in_play = [id('binocular')]; table.players[2].in_play = [id('hideout')]; });
  assert.equal(effectiveDistance(scoped, 0, 2), 2, 'Binocular −1 and Hideout +1 cancel');
  const belle = turn([], (table, own) => { own.in_play = []; table.players[2].in_play = [id('mustang')]; table.turn.player = 0; table.players[0].character = 'belle_star'; });
  assert.equal(effectiveDistance(belle, 0, 2), 2, "Belle Star's turn switches the other players' Mustang off");
});

test('punch reaches only distance 1, in the button list and for drag-and-drop, even with a long gun', () => {
  const punch = id('punch');
  const game = turn([punch], (_table, own) => { own.in_play = [id('rev_carabine')]; own.weapon_range = 4; });
  assert.deepEqual(targets(game, punch), [1, 4]);
  assert.equal(playAction(game, { ...emptyDraft, card: punch, target: 2 }, false), null, 'Distance 2 is refused by the button');
  assert.deepEqual(playAction(game, { ...emptyDraft, card: punch, target: 1 }, false), { type: 'play', card: punch, target: 1 });
  assert.equal(dragDestination(game, emptyDraft, punch, false), 'player');
  assert.equal(dropAction(game, emptyDraft, punch, { player: 2, rect: { x: 0, y: 0, width: 1, height: 1 } }, false), null, 'Drag onto distance 2 is refused too');
  assert.deepEqual(dropAction(game, emptyDraft, punch, { player: 1, rect: { x: 0, y: 0, width: 1, height: 1 } }, false)?.action, { type: 'play', card: punch, target: 1 });
});

test('Apache Kid is not aimed at with diamond Dodge City cards', () => {
  const dodge = id('dodge', 0); // 7♦, thrown as BANG! by Janet
  const game = turn([dodge], (table, own) => { own.character = 'calamity_janet'; own.in_play = [id('rev_carabine')]; own.weapon_range = 4; table.players[1].character = 'apache_kid'; });
  assert.deepEqual(targets(game, dodge), [2, 4]);
  const punch = id('punch'); // 10♠ is not a diamond
  assert.ok(targets(turn([punch], (table) => { table.players[1].character = 'apache_kid'; }), punch).includes(1));
});

test('dodge played as BANG! obeys weapon range and the one-BANG! limit like the engine', () => {
  const dodge = id('dodge', 1);
  const janet = (tweak?: (table: SpectatorView, own: SpectatorView['players'][number]) => void) => turn([dodge], (table, own) => { own.character = 'calamity_janet'; own.in_play = []; own.weapon_range = 1; tweak?.(table, own); });
  assert.deepEqual(targets(janet(), dodge), [1, 4], 'Colt range 1');
  assert.deepEqual(targets(janet((_t, own) => { own.weapon_range = 2; }), dodge), [1, 2, 4]);
  const spent = janet(table => { table.turn.bangs_played = 1; });
  assert.deepEqual(targets(spent, dodge), []);
  assert.equal(playAction(spent, { ...emptyDraft, card: dodge, target: 1 }, false), null, 'The shot limit is already used');
  const volcanic = cardCatalog.findIndex(card => card.kind === 'volcanic');
  assert.deepEqual(targets(janet((table, own) => { table.turn.bangs_played = 1; own.in_play = [volcanic]; own.weapon_range = 1; }), dodge), [1, 4], 'Volcanic lifts the one-BANG! limit');
});

test('rag time on yourself cannot take a hand card the cost has already used', () => {
  const rag = id('rag_time');
  const lone = turn([rag, 1], (_table, own) => { own.in_play = [78]; });
  const own = selectGameViewOwn(lone);
  assert.equal(pickableHand(lone, rag, own), 0, 'Both hand cards leave before the pick');
  const draft = { ...emptyDraft, card: rag, extra: 1, target: 0 };
  assert.equal(playAction(lone, { ...draft, selection: 'hand' }, false), null);
  assert.deepEqual(playAction(lone, { ...draft, selection: { in_play: 78 } }, false), { type: 'affect_with_discard', card: rag, discard: 1, target: 0, selection: { in_play: 78 } });
  const three = turn([rag, 1, 26]);
  assert.equal(pickableHand(three, rag, selectGameViewOwn(three)), 1);
  assert.equal(pickableHand(three, rag, three.view.perspective === 'player' ? three.view.view.table.players[1] : (undefined as never)), 3, 'Other players keep their full hand');
});

test('brawl with nobody holding a card still sends an empty pick list', () => {
  const brawl = id('brawl');
  const game = turn([brawl, 1], (table) => { for (const player of table.players.slice(1)) { player.hand_count = 0; player.in_play = []; } });
  assert.equal(brawlTargets(game).length, 0);
  assert.equal(playAction(game, { ...emptyDraft, card: brawl }, false), null, 'The extra discard is still missing');
  assert.deepEqual(playAction(game, { ...emptyDraft, card: brawl, extra: 1 }, false), { type: 'brawl', card: brawl, discard: 1, picks: [] });
});

function selectGameViewOwn(game: ReturnType<typeof turn>) {
  if (game.view.perspective !== 'player') throw new Error('player');
  return game.view.view.table.players[0];
}

test('Vera Custer copying Calamity Janet plays Dodge as BANG! in her turn and answers Duel or Indians! with it', () => {
  const dodge = id('dodge', 1);
  const vera = (kind: 'duel' | 'indians') => {
    const game = turn([dodge], (_table, own) => { own.character = 'vera_custer'; own.copied = 'calamity_janet'; });
    if (game.view.perspective !== 'player') throw new Error('player');
    game.view.view.table.waiting = { player: 0, pending_id: 9, kind: kind === 'duel' ? { type: 'duel' } : { type: 'attack_response', kind: 'indians', remaining: 1, checks_left: 0 } };
    return game;
  };
  assert.deepEqual(targets(turn([dodge], (_t, own) => { own.character = 'vera_custer'; own.copied = 'calamity_janet'; }), dodge), [1, 4]);
  for (const kind of ['duel', 'indians'] as const) {
    const game = vera(kind);
    assert.equal(actionMode(game), 'response');
    assert.equal(responseCard(game, dodge), true);
    assert.deepEqual(respondAction(game, dodge, false), { type: 'respond', pending_id: 9, card: dodge });
    assert.equal(dragDestination(game, emptyDraft, dodge, false), 'table', 'Drag-and-drop accepts it as well');
  }
  const plain = vera('duel');
  if (plain.view.perspective === 'player') plain.view.view.table.players[0].copied = undefined;
  assert.equal(responseCard(plain, dodge), false, 'Without the copy the card is no BANG!');
});
