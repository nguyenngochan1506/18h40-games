import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DecisionKind } from '../../generated/protocol.ts';
import type { BangSnapshot as GameSnapshot } from './types.ts';
import { demoGame } from './demo/demo.ts';
import { storeOwners } from './choiceFan.ts';
import { actionMode, chooseHandSlotAction, chooseStoreSlotAction, chooseDrawSourceAction, keepCardsAction, keepCount, chooseDrawResultAction, sidHealAction, isSid } from './actions.ts';

function fixture(kind: DecisionKind) {
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw new Error('Expected player fixture');
  game.view.view.table.waiting = { player: 0, pending_id: 101, kind };
  game.view.view.choices = [5, 33, 60];
  game.view.view.table.store_slots = 3;
  return { game, view: game.view.view, table: game.view.view.table };
}

test('General Store chooses an opaque remaining slot with the current pending id', () => {
  const { game, table } = fixture({ type: 'general_store' });
  assert.equal(actionMode(game), 'general_store');
  assert.deepEqual(chooseStoreSlotAction(game, 1, false), { type: 'choose_store_slot', pending_id: 101, slot: 1 });
  for (const slot of [null, -1, 3, 34, 255, 1.5, NaN, Infinity]) assert.equal(chooseStoreSlotAction(game, slot, false), null);
  assert.equal(chooseStoreSlotAction(game, 1, true), null);
  table.waiting!.pending_id = 102;
  assert.deepEqual(chooseStoreSlotAction(game, 1, false), { type: 'choose_store_slot', pending_id: 102, slot: 1 });
  table.store_slots = 1;
  assert.equal(chooseStoreSlotAction(game, 1, false), null);
  table.waiting!.player = 1;
  assert.equal(chooseStoreSlotAction(game, 0, false), null);
});

test('a retained claimed fan position never changes the remaining server slot index', () => {
  const { game } = fixture({ type: 'general_store' });
  const owners = storeOwners([null, null, null, null], 3, [{ type: 'store_card_claimed', player: 1, slot: 1 }]);
  const available = owners.flatMap((owner, index) => owner === null ? [index] : []);
  assert.deepEqual(available, [0, 2, 3]);
  assert.deepEqual(chooseStoreSlotAction(game, available.indexOf(2), false), { type: 'choose_store_slot', pending_id: 101, slot: 1 });
});

test('draw source defaults to deck; Jesse selects another living hand and Pedro can take a hidden discard top', () => {
  const { game, table } = fixture({ type: 'draw_choice' });
  table.players[0].character = 'jesse_jones';
  assert.deepEqual(chooseDrawSourceAction(game, 'deck', false), { type: 'choose_draw_source', pending_id: 101, source: 'deck' });
  assert.deepEqual(chooseDrawSourceAction(game, { player: 1 }, false), { type: 'choose_draw_source', pending_id: 101, source: { player: 1 } });
  for (const id of [0, 3, 99]) assert.equal(chooseDrawSourceAction(game, { player: id }, false), null);
  table.players[1].hand_count = 0;
  assert.equal(chooseDrawSourceAction(game, { player: 1 }, false), null);
  assert.equal(chooseDrawSourceAction(game, 'discard', false), null);
  table.players[0].character = 'pedro_ramirez';
  table.discard_top = null;
  assert.deepEqual(chooseDrawSourceAction(game, 'discard', false), { type: 'choose_draw_source', pending_id: 101, source: 'discard' });
  assert.equal(chooseDrawSourceAction(game, { player: 2 }, false), null);
  table.discard_count = 0;
  assert.equal(chooseDrawSourceAction(game, 'discard', false), null);
});

test('Kit keeps the exact count supplied by the frame, including short pools, without mutating its private view', () => {
  const { game, view, table } = fixture({ type: 'keep_cards', keep: 2 });
  const before = structuredClone(game);
  assert.equal(keepCount(game), 2);
  assert.deepEqual(keepCardsAction(game, [60, 5], false), { type: 'keep_cards', pending_id: 101, cards: [60, 5] });
  for (const cards of [[], [5], [5, 5], [5, 34], [5, 33, 60]]) assert.equal(keepCardsAction(game, cards, false), null);
  assert.deepEqual(game, before);
  view.choices = [60];
  table.waiting!.kind = { type: 'keep_cards', keep: 1 };
  assert.equal(keepCount(game), 1);
  assert.deepEqual(keepCardsAction(game, [60], false), { type: 'keep_cards', pending_id: 101, cards: [60] });
});

test('Lucky chooses only a card from the private check pool for each supplied reason', () => {
  for (const reason of ['barrel', 'jail', 'dynamite'] as const) {
    const { game } = fixture({ type: 'choose_draw_result', reason });
    assert.deepEqual(chooseDrawResultAction(game, 33, false), { type: 'choose_draw_result', pending_id: 101, card: 33 });
    assert.equal(chooseDrawResultAction(game, 34, false), null);
    assert.equal(chooseDrawResultAction(game, null, false), null);
  }
});

test('Sid can heal across any waiting frame, uses only his own Dying nonce, and leaves the underlying decision untouched', () => {
  for (const kind of [{ type: 'turn' }, { type: 'attack_response', kind: 'bang', remaining: 1, checks_left: 0 }, { type: 'general_store' }, { type: 'keep_cards', keep: 2 }, { type: 'dying', needed: 2 }] as const) {
    const { game, table } = fixture(kind);
    table.players[0].character = 'sid_ketchum';
    table.players[0].health = 2;
    for (const player of [0, 1]) {
      table.waiting!.player = player;
      const before = structuredClone(game);
      const pending_id = kind.type === 'dying' && player === 0 ? 101 : null;
      assert.deepEqual(sidHealAction(game, [1, 26], false), { type: 'sid_heal', pending_id, discard: [1, 26] });
      assert.deepEqual(game, before);
    }
  }
  const { game, table } = fixture({ type: 'dying', needed: 2 });
  table.players[0].character = 'sid_ketchum';
  table.players[0].health = -1;
  for (const cards of [[], [1], [1, 1], [1, 255], [1, 26, 37]]) assert.equal(sidHealAction(game, cards, false), null);
  assert.deepEqual(sidHealAction(game, [1, 26], false), { type: 'sid_heal', pending_id: 101, discard: [1, 26] });
  table.waiting!.pending_id = 102;
  assert.deepEqual(sidHealAction(game, [1, 26], false), { type: 'sid_heal', pending_id: 102, discard: [1, 26] });
  table.waiting!.pending_id = null;
  assert.equal(sidHealAction(game, [1, 26], false), null);
});

test('all new decision builders reject a locked input, wrong actor, spectator, dead player and missing or wrong pending kind', () => {
  const builders = [
    { kind: { type: 'pick_hand_slot', target: 1, kind: 'panic', count: 3 }, build: (g: GameSnapshot, locked: boolean) => chooseHandSlotAction(g, 0, locked) },
    { kind: { type: 'general_store' }, build: (g: GameSnapshot, locked: boolean) => chooseStoreSlotAction(g, 0, locked) },
    { kind: { type: 'draw_choice' }, build: (g: GameSnapshot, locked: boolean) => chooseDrawSourceAction(g, 'deck', locked) },
    { kind: { type: 'keep_cards', keep: 2 }, build: (g: GameSnapshot, locked: boolean) => keepCardsAction(g, [5, 33], locked) },
    { kind: { type: 'choose_draw_result', reason: 'barrel' }, build: (g: GameSnapshot, locked: boolean) => chooseDrawResultAction(g, 5, locked) },
  ] satisfies { kind: DecisionKind; build: (game: GameSnapshot, locked: boolean) => unknown }[];
  for (const { kind, build } of builders) {
    for (const mode of ['locked', 'wrong', 'spectator', 'dead', 'won', 'nonce', 'kind'] as const) {
      const { game, table } = fixture(kind);
      if (mode === 'wrong') table.waiting!.player = 1;
      if (mode === 'spectator') game.view = { perspective: 'spectator', view: table };
      if (mode === 'dead') table.players[0].alive = false;
      if (mode === 'won') table.winner = 'outlaws';
      if (mode === 'nonce') table.waiting!.pending_id = null;
      if (mode === 'kind') table.waiting!.kind = { type: 'duel' };
      assert.equal(build(game, mode === 'locked'), null, `${kind.type}/${mode}`);
    }
  }
  for (const mode of ['locked', 'other', 'spectator', 'dead', 'won'] as const) {
    const { game, table } = fixture({ type: 'turn' });
    table.players[0].character = mode === 'other' ? 'kit_carlson' : 'sid_ketchum';
    if (mode === 'spectator') game.view = { perspective: 'spectator', view: table };
    if (mode === 'dead') table.players[0].alive = false;
    if (mode === 'won') table.winner = 'outlaws';
    assert.equal(sidHealAction(game, [1, 26], mode === 'locked'), null);
    if (mode !== 'locked') assert.equal(isSid(game), false);
  }
});


test('blind hand choices use only the current nonce and an opaque bounded slot for either card', () => {
  for (const kind of ['panic', 'cat_balou'] as const) {
    const { game, table } = fixture({ type: 'pick_hand_slot', target: 1, kind, count: 3 });
    const before = structuredClone(game);
    assert.equal(actionMode(game), 'pick_hand_slot');
    for (let slot = 0; slot < 3; slot++) assert.deepEqual(chooseHandSlotAction(game, slot, false), { type: 'choose_hand_slot', pending_id: 101, slot });
    for (const slot of [null, -1, 3, 255, 1.5, NaN, Infinity]) assert.equal(chooseHandSlotAction(game, slot, false), null);
    assert.deepEqual(game, before);
    table.waiting!.pending_id = 102;
    assert.deepEqual(chooseHandSlotAction(game, 1, false), { type: 'choose_hand_slot', pending_id: 102, slot: 1 });
  }
});
