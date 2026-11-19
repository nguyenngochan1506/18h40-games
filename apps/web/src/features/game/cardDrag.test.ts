import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dragDestination, dropAction, dropZoneAt, settleDrop } from './cardDrag.ts';
import { emptyDraft, playTargets } from './actions.ts';
import { demoGame } from './demo.ts';
import { cardCatalog } from './cardCatalog.ts';

function turn() {
  const game = structuredClone(demoGame);
  if (game.view.perspective !== 'player') throw new Error('Expected player fixture');
  game.view.view.table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } };
  return game;
}
const center = { player: null, rect: { x: 400, y: 250, width: 200, height: 150 } };
const actor = { player: 1, rect: { x: 100, y: 150, width: 100, height: 200 } };
const id = (kind: string) => cardCatalog.findIndex(c => c.kind === kind);

test('drop hit testing uses viewport coordinates and rejects outside/nonfinite points', () => {
  assert.equal(dropZoneAt({ x: 150, y: 200 }, [center, actor]), actor);
  assert.equal(dropZoneAt({ x: 400, y: 250 }, [center, actor]), center);
  for (const point of [{ x: 1, y: 1 }, { x: NaN, y: 200 }, { x: Infinity, y: 200 }]) assert.equal(dropZoneAt(point, [actor]), null);
});

test('hand drag categories and actions match click, including multi-step selection', () => {
  const game = turn(); if (game.view.perspective !== 'player') throw new Error('player');
  for (const kind of ['beer', 'stagecoach', 'wells_fargo', 'saloon', 'volcanic', 'barrel']) {
    const card = id(kind); game.view.view.hand = [card];
    assert.equal(dragDestination(game, emptyDraft, card, false), 'table');
    assert.deepEqual(dropAction(game, emptyDraft, card, center, false)?.action, { type: 'play', card, target: null });
    assert.equal(dropAction(game, emptyDraft, card, actor, false), null);
  }
  for (const kind of ['bang', 'panic', 'cat_balou', 'jail', 'duel']) {
    const card = id(kind); game.view.view.hand = [card];
    assert.equal(dragDestination(game, emptyDraft, card, false), 'player');
    const result = dropAction(game, emptyDraft, card, actor, false)!;
    assert.equal(result.draft.card, card); assert.equal(result.draft.target, 1);
    assert.deepEqual(result.action, ['panic', 'cat_balou'].includes(kind) ? null : { type: 'play', card, target: 1 });
    assert.equal(dropAction(game, emptyDraft, card, center, false), null);
    assert.equal(dropAction(game, emptyDraft, card, { ...actor, player: 3 }, false), null); // Eliminated player.
    assert.equal(playTargets(game, card).some(p => p.id === 0), ['panic', 'cat_balou'].includes(kind));
  }
  game.view.view.hand = [26]; assert.equal(dragDestination(game, emptyDraft, 26, false), null);
  game.view.view.table.players[0].character = 'calamity_janet'; assert.equal(dragDestination(game, emptyDraft, 26, false), 'player');
});

test('response drops reuse respondAction; pool/discard/Sid selection stays click-only', () => {
  const game = turn(); if (game.view.perspective !== 'player') throw new Error('player');
  for (const [kind, card] of [['duel', 1], ['dying', 37], ['attack_response', 26]] as const) {
    game.view.view.table.waiting = { player: 0, pending_id: 12, kind: kind === 'attack_response' ? { type: kind, kind: 'bang', remaining: 1 } : kind === 'dying' ? { type: kind, needed: 1 } : { type: kind } };
    assert.equal(dragDestination(game, emptyDraft, card, false), 'table');
    assert.deepEqual(dropAction(game, emptyDraft, card, center, false)?.action, { type: 'respond', pending_id: 12, card });
    assert.equal(dropAction(game, emptyDraft, card, actor, false), null);
  }
  assert.equal(dragDestination(game, emptyDraft, 1, true), null);
  assert.equal(dragDestination(game, { ...emptyDraft, discarding: true }, 26, false), null);
  assert.equal(dragDestination(game, { ...emptyDraft, healing: true }, 26, false), null);
  game.view.view.table.waiting = { player: 1, pending_id: null, kind: { type: 'turn' } };
  assert.equal(dragDestination(game, emptyDraft, 1, false), null);
  game.view.view.table.waiting = { player: 0, pending_id: 13, kind: { type: 'keep_cards', keep: 2 } };
  assert.equal(dragDestination(game, emptyDraft, 1, false), null);
});

test('drop settlement uses server hand and request barrier, with rejection/timeout/desync rollback', () => {
  const game = turn(), ready = { ready: true, failed: false, settled: false };
  assert.equal(settleDrop(1, game.seq, game, ready), 'pending');
  assert.equal(settleDrop(1, game.seq, game, { ...ready }), 'pending');
  for (const flags of [{ ready: false }, { failed: true }, { settled: true }]) assert.equal(settleDrop(1, game.seq, game, { ...ready, ...flags }), 'rollback');
  assert.equal(settleDrop(1, game.seq - 1, game, ready), 'rollback');
  if (game.view.perspective === 'player') game.view.view.hand = game.view.view.hand.filter(card => card !== 1);
  assert.equal(settleDrop(1, game.seq + 1, game, ready), 'accepted');
});
