import type { Action, CardId, CardKind, CardSelection, GameSnapshot } from '../../generated/protocol.ts';
import { cardFace } from './cardCatalog.ts';
import { selectGameView } from './state.ts';

export type ActionDraft = { card: CardId | null; target: number | null; selection: CardSelection | null; discarding: boolean; discard: CardId[] };
export const emptyDraft: ActionDraft = { card: null, target: null, selection: null, discarding: false, discard: [] };

export function actionMode(game: GameSnapshot): 'view' | 'waiting' | 'turn' | 'response' | 'unsupported' {
  const { table, you } = selectGameView(game.view);
  if (you === null || table.winner) return 'view';
  if (!table.waiting || table.waiting.player !== you) return 'waiting';
  switch (table.waiting.kind.type) {
    case 'turn': return 'turn';
    case 'attack_response': case 'duel': case 'dying': return 'response';
    default: return 'unsupported';
  }
}

// These are input categories, not a client-side legality check (range, limits, etc.).
export function playKind(game: GameSnapshot, card: CardId): CardKind | undefined {
  const { table, you, hand } = selectGameView(game.view);
  if (you === null || !hand.includes(card)) return undefined;
  const kind = cardFace(card)?.kind;
  if (kind !== 'missed') return kind;
  return table.players.find((player) => player.id === you)?.character === 'calamity_janet' ? 'bang' : undefined;
}

export function needsTarget(game: GameSnapshot, card: CardId): boolean {
  return ['bang', 'panic', 'cat_balou', 'duel', 'jail'].includes(playKind(game, card) ?? '');
}

export function responseKind(game: GameSnapshot): CardKind | null {
  const { table } = selectGameView(game.view);
  if (actionMode(game) !== 'response') return null;
  switch (table.waiting!.kind.type) {
    case 'dying': return 'beer';
    case 'duel': return 'bang';
    case 'attack_response': return table.waiting!.kind.kind === 'indians' ? 'bang' : 'missed';
    default: return null;
  }
}

export function responseCard(game: GameSnapshot, card: CardId): boolean {
  const { table, hand, you } = selectGameView(game.view);
  const required = responseKind(game);
  const actual = cardFace(card)?.kind;
  if (!required || !actual || !hand.includes(card)) return false;
  return actual === required || (table.players.find((player) => player.id === you)?.character === 'calamity_janet'
    && ((required === 'bang' && actual === 'missed') || (required === 'missed' && actual === 'bang')));
}

export function playAction(game: GameSnapshot, draft: ActionDraft, locked: boolean): Action | null {
  if (locked || actionMode(game) !== 'turn' || draft.card === null) return null;
  const kind = playKind(game, draft.card);
  if (!kind) return null;
  if (!needsTarget(game, draft.card)) return { type: 'play', card: draft.card, target: null };
  const { table, you } = selectGameView(game.view);
  const target = table.players.find((player) => player.id === draft.target && player.alive);
  if (!target) return null;
  if (kind === 'panic' || kind === 'cat_balou') {
    const selection = draft.selection;
    if (!selection || (selection !== 'hand' && !target.in_play.includes(selection.in_play))) return null;
    return { type: 'affect_card', card: draft.card, target: target.id, selection };
  }
  if (target.id === you) return null;
  return { type: 'play', card: draft.card, target: target.id };
}

export function respondAction(game: GameSnapshot, card: CardId | null, locked: boolean): Action | null {
  const { table } = selectGameView(game.view);
  const pending = table.waiting?.pending_id;
  if (locked || actionMode(game) !== 'response' || pending === null || pending === undefined || (card !== null && !responseCard(game, card))) return null;
  return { type: 'respond', pending_id: pending, card };
}

export function discardCount(game: GameSnapshot): number {
  const { table, you, hand } = selectGameView(game.view);
  const own = table.players.find((player) => player.id === you);
  return own ? Math.max(0, hand.length - Math.max(0, own.health)) : 0;
}

export function endTurnAction(game: GameSnapshot, discard: CardId[], locked: boolean): Action | null {
  const { hand } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'turn' || discard.length !== discardCount(game)
    || new Set(discard).size !== discard.length || !discard.every((card) => hand.includes(card))) return null;
  return { type: 'end_turn', discard };
}
