import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CardId, DecisionKind } from '../../generated/protocol.ts';
import type { BangSnapshot as GameSnapshot } from './types.ts';
import { demoGame } from './demo/demo.ts';
import { emptyDraft, actionMode, playAction, respondAction, endTurnAction, discardCount, responseCard, needsTarget } from './actions.ts';
import { selectGameView } from './testSupport.ts';
import { errorMessages } from '../../shared/lib/errors.ts';

function fixture(kind: DecisionKind = { type: 'turn' }): GameSnapshot {
  const game = structuredClone(demoGame);
  assert.equal(game.view.perspective, 'player');
  if (game.view.perspective === 'player') {
    game.view.view.table.turn.player = 0;
    game.view.view.table.waiting = { player: 0, pending_id: kind.type === 'turn' ? null : 42, kind };
  }
  return game;
}

const draft = (card: CardId, target: number | null = null) => ({ ...emptyDraft, card, target });

test('play builder creates targeted BANG and non-targeted Beer, leaving range and limits to the engine', () => {
  const game = fixture();
  const before = structuredClone(game);
  assert.equal(actionMode(game), 'turn');
  assert.equal(needsTarget(game, 1), true);
  assert.deepEqual(playAction(game, draft(1, 2), false), { type: 'play', card: 1, target: 2 });
  assert.equal(playAction(game, draft(1), false), null);
  assert.equal(playAction(game, draft(1, 0), false), null);
  assert.equal(playAction(game, draft(1, 3), false), null);
  assert.equal(playAction(game, draft(1, 99), false), null);
  assert.deepEqual(playAction(game, draft(37), false), { type: 'play', card: 37, target: null });
  assert.equal(playAction(game, draft(26), false), null);
  assert.equal(playAction(game, draft(255), false), null);
  assert.equal(playAction(game, draft(1, 2), true), null);
  assert.deepEqual(game, before);
});

test('Panic and Cat Balou build AffectCard only with a selected public region', () => {
  const game = fixture();
  assert.equal(playAction(game, draft(43, 1), false), null);
  assert.deepEqual(playAction(game, { ...draft(43, 1), selection: 'hand' }, false), { type: 'affect_card', card: 43, target: 1, selection: 'hand' });
  assert.deepEqual(playAction(game, { ...draft(43, 1), selection: { in_play: 63 } }, false), { type: 'affect_card', card: 43, target: 1, selection: { in_play: 63 } });
  assert.equal(playAction(game, { ...draft(43, 1), selection: { in_play: 78 } }, false), null);
  if (game.view.perspective === 'player') game.view.view.hand.push(47);
  assert.deepEqual(playAction(game, { ...draft(47, 0), selection: { in_play: 78 } }, false), { type: 'affect_card', card: 47, target: 0, selection: { in_play: 78 } });
});

test('responses carry the current nonce, allow declining, and select the right kind for each simple frame', () => {
  const attack = fixture({ type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 0 });
  assert.deepEqual(respondAction(attack, 26, false), { type: 'respond', pending_id: 42, card: 26 });
  assert.deepEqual(respondAction(attack, null, false), { type: 'respond', pending_id: 42, card: null });
  assert.equal(respondAction(attack, 1, false), null);
  assert.equal(respondAction(attack, 26, true), null);
  for (const kind of [{ type: 'duel' }, { type: 'attack_response', kind: 'indians', remaining: 1, checks_left: 0 }] as const) {
    const game = fixture(kind);
    assert.deepEqual(respondAction(game, 1, false), { type: 'respond', pending_id: 42, card: 1 });
    assert.equal(respondAction(game, 26, false), null);
  }
  const dying = fixture({ type: 'dying', needed: 1 });
  if (dying.view.perspective === 'player') dying.view.view.table.players[0].health = 0;
  assert.deepEqual(respondAction(dying, 37, false), { type: 'respond', pending_id: 42, card: 37 });
  assert.deepEqual(respondAction(dying, null, false), { type: 'respond', pending_id: 42, card: null });
  assert.equal(respondAction(dying, 26, false), null);
});

test('Calamity card category works both when playing Missed as BANG and when responding', () => {
  const game = fixture();
  if (game.view.perspective === 'player') game.view.view.table.players[0].character = 'calamity_janet';
  assert.equal(needsTarget(game, 26), true);
  assert.deepEqual(playAction(game, draft(26, 1), false), { type: 'play', card: 26, target: 1 });
  if (game.view.perspective === 'player') game.view.view.table.waiting = { player: 0, pending_id: 77, kind: { type: 'duel' } };
  assert.equal(responseCard(game, 26), true);
  assert.deepEqual(respondAction(game, 26, false), { type: 'respond', pending_id: 77, card: 26 });
});

test('end turn requires exactly the excess physical owned cards without duplicates', () => {
  const game = fixture();
  assert.equal(discardCount(game), 2);
  assert.equal(endTurnAction(game, [], false), null);
  assert.equal(endTurnAction(game, [1], false), null);
  assert.equal(endTurnAction(game, [1, 1], false), null);
  assert.equal(endTurnAction(game, [1, 255], false), null);
  assert.deepEqual(endTurnAction(game, [1, 26], false), { type: 'end_turn', discard: [1, 26] });
  assert.equal(endTurnAction(game, [1, 26], true), null);
  if (game.view.perspective === 'player') game.view.view.table.players[0].health = 5;
  assert.deepEqual(endTurnAction(game, [], false), { type: 'end_turn', discard: [] });
});

test('wrong actor, spectator, eliminated player, winner and other decision kinds do not build actions', () => {
  for (const mode of ['wrong', 'spectator', 'dead', 'won', 'pool'] as const) {
    const game = fixture();
    if (game.view.perspective === 'player') {
      const table = game.view.view.table;
      if (mode === 'wrong') table.waiting!.player = 1;
      if (mode === 'dead') table.players[0].alive = false;
      if (mode === 'won') table.winner = 'outlaws';
      if (mode === 'pool') { game.view.view.choices = [2, 3]; table.waiting = { player: 0, pending_id: 44, kind: { type: 'keep_cards', keep: 2 } }; }
      if (mode === 'spectator') game.view = { perspective: 'spectator', view: table };
    }
    assert.equal(playAction(game, draft(1, 1), false), null, mode);
    assert.equal(respondAction(game, 26, false), null, mode);
    assert.equal(endTurnAction(game, [1, 26], false), null, mode);
  }
  const pool = fixture();
  if (pool.view.perspective === 'player') pool.view.view.choices = [2, 3];
  assert.equal(playAction(pool, draft(2, 1), false), null);
  assert.equal(selectGameView(pool.view).hand.includes(2), false);
  assert.match(errorMessages.illegal_action, /lượt|bài/);
  assert.ok(!errorMessages.illegal_action.includes('illegal_action'));
});
