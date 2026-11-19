import type { Action, CardId, CardKind, CardSelection, DrawSource, GameSnapshot } from '../../generated/protocol.ts';
import { cardFace } from './cardCatalog.ts';
import { selectGameView } from './state.ts';

export type ActionDraft = { storeSlot: number | null; card: CardId | null; target: number | null; selection: CardSelection | null; discarding: boolean; discard: CardId[]; healing: boolean; source: DrawSource; kept: CardId[] };
export const emptyDraft: ActionDraft = { storeSlot: null, card: null, target: null, selection: null, discarding: false, discard: [], healing: false, source: 'deck', kept: [] };

export function actionMode(game: GameSnapshot): 'view' | 'waiting' | 'turn' | 'response' | 'check' | 'general_store' | 'draw_choice' | 'keep_cards' | 'choose_draw_result' {
  const { table, you } = selectGameView(game.view);
  if (you === null || table.winner) return 'view';
  if (!table.waiting || table.waiting.player !== you) return 'waiting';
  switch (table.waiting.kind.type) {
    case 'turn': return 'turn';
    case 'attack_response': case 'duel': case 'dying': return 'response';
    case 'check': case 'general_store': case 'draw_choice': case 'keep_cards': case 'choose_draw_result': return table.waiting.kind.type;
  }
}

export function flipCheckAction(game: GameSnapshot, locked: boolean): Action | null {
  const { table } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'check' || table.waiting?.pending_id == null) return null;
  return { type: 'flip_check', pending_id: table.waiting.pending_id };
}

export function flipBarrelAction(game: GameSnapshot, locked: boolean): Action | null {
  const { table } = selectGameView(game.view);
  const waiting = table.waiting;
  if (locked || actionMode(game) !== 'response' || waiting?.pending_id == null || waiting.kind.type !== 'attack_response' || !waiting.kind.checks_left) return null;
  return { type: 'flip_barrel', pending_id: waiting.pending_id };
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

export function playTargets(game: GameSnapshot, card: CardId) {
  const { table, you } = selectGameView(game.view);
  const self = ['panic', 'cat_balou'].includes(playKind(game, card) ?? '');
  return needsTarget(game, card) ? table.players.filter(player => player.alive && (player.id !== you || self)) : [];
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

export function chooseStoreSlotAction(game: GameSnapshot, slot: number | null, locked: boolean): Action | null {
  const { table } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'general_store' || table.waiting?.pending_id == null || slot === null || !Number.isInteger(slot) || slot < 0 || slot >= table.store_slots) return null;
  return { type: 'choose_store_slot', pending_id: table.waiting.pending_id, slot };
}

export function chooseDrawSourceAction(game: GameSnapshot, source: DrawSource, locked: boolean): Action | null {
  const { table, you } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'draw_choice' || table.waiting?.pending_id == null) return null;
  const own = table.players.find((player) => player.id === you)!;
  if (source === 'discard' && (own.character !== 'pedro_ramirez' || table.discard_count === 0)) return null;
  if (typeof source === 'object' && (own.character !== 'jesse_jones' || source.player === you || !table.players.some((player) => player.id === source.player && player.alive && player.hand_count > 0))) return null;
  return { type: 'choose_draw_source', pending_id: table.waiting.pending_id, source };
}

export function keepCount(game: GameSnapshot): number {
  const { table } = selectGameView(game.view);
  return table.waiting?.kind.type === 'keep_cards' ? table.waiting.kind.keep : 0;
}

export function keepCardsAction(game: GameSnapshot, cards: CardId[], locked: boolean): Action | null {
  const { table, choices } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'keep_cards' || table.waiting?.pending_id == null || cards.length !== keepCount(game)
    || new Set(cards).size !== cards.length || !cards.every((card) => choices.includes(card))) return null;
  return { type: 'keep_cards', pending_id: table.waiting.pending_id, cards };
}

export function chooseDrawResultAction(game: GameSnapshot, card: CardId | null, locked: boolean): Action | null {
  const { table, choices } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'choose_draw_result' || table.waiting?.pending_id == null || card === null || !choices.includes(card)) return null;
  return { type: 'choose_draw_result', pending_id: table.waiting.pending_id, card };
}

export function isSid(game: GameSnapshot): boolean {
  const { table, you } = selectGameView(game.view);
  return !table.winner && you !== null && table.players.some((player) => player.id === you && player.character === 'sid_ketchum');
}

export function sidHealAction(game: GameSnapshot, discard: CardId[], locked: boolean): Action | null {
  const { table, you, hand } = selectGameView(game.view);
  if (locked || !isSid(game) || discard.length !== 2 || discard[0] === discard[1] || !discard.every((card) => hand.includes(card))) return null;
  const ownDying = table.waiting?.player === you && table.waiting.kind.type === 'dying';
  if (ownDying && table.waiting!.pending_id === null) return null;
  return { type: 'sid_heal', pending_id: ownDying ? table.waiting!.pending_id : null, discard: [discard[0], discard[1]] };
}
