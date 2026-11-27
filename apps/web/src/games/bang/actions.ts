import type { Action, BrawlPick, CardId, CardKind, CardSelection, Character, DrawSource, PublicPlayer } from '../../generated/protocol.ts';
import type { BangSnapshot as GameSnapshot } from './types.ts';
import { cardFace } from './cardCatalog.ts';
import { selectGameView } from './state.ts';

export type ActionDraft = { storeSlot: number | null; handSlot: number | null; card: CardId | null; target: number | null; selection: CardSelection | null; discarding: boolean; discard: CardId[]; healing: boolean; source: DrawSource; kept: CardId[]; extra: CardId | null; brawl: Record<number, CardSelection> };
export const emptyDraft: ActionDraft = { storeSlot: null, handSlot: null, card: null, target: null, selection: null, discarding: false, discard: [], healing: false, source: 'deck', kept: [], extra: null, brawl: {} };

export function actionMode(game: GameSnapshot): 'view' | 'waiting' | 'turn' | 'response' | 'check' | 'pick_hand_slot' | 'general_store' | 'draw_choice' | 'keep_cards' | 'choose_draw_result' {
  const { table, you } = selectGameView(game.view);
  if (you === null || table.winner) return 'view';
  if (!table.waiting || table.waiting.player !== you) return 'waiting';
  switch (table.waiting.kind.type) {
    case 'turn': return 'turn';
    case 'attack_response': case 'duel': case 'dying': return 'response';
    case 'pick_hand_slot': case 'check': case 'general_store': case 'draw_choice': case 'keep_cards': case 'choose_draw_result': return table.waiting.kind.type;
    // Dodge City is not offered in rooms yet; its choice has no UI until that stage.
    case 'choose_copy': case 'vulture_split': return 'waiting';
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

/** Printed character or the one Vera Custer is copying (engine `Player::has`). */
export function has(player: Pick<PublicPlayer, 'character' | 'copied'>, character: Character): boolean {
  return player.character === character || player.copied === character;
}

// These are input categories, not a client-side legality check (range, limits, etc.).
export function playKind(game: GameSnapshot, card: CardId): CardKind | undefined {
  const { table, you, hand } = selectGameView(game.view);
  if (you === null || !hand.includes(card)) return undefined;
  const kind = cardFace(card)?.kind;
  if (kind !== 'missed' && kind !== 'dodge') return kind;
  const own = table.players.find((player) => player.id === you);
  return own && has(own, 'calamity_janet') ? 'bang' : undefined;
}

// Dodge City cards that cost one more hand card (`play_with_discard`, `affect_with_discard`, `brawl`).
const extraKinds: CardKind[] = ['springfield', 'tequila', 'whisky', 'rag_time', 'brawl'];
// Cards that take or discard a chosen card of the target (hand slot or table card).
const affectKinds: CardKind[] = ['panic', 'cat_balou', 'rag_time'];
const targetKinds: CardKind[] = ['bang', 'panic', 'cat_balou', 'duel', 'jail', 'punch', 'springfield', 'tequila', 'rag_time'];
const selfKinds: CardKind[] = ['panic', 'cat_balou', 'tequila', 'rag_time'];

export function needsExtra(game: GameSnapshot, card: CardId): boolean {
  return extraKinds.includes(playKind(game, card) ?? 'bang');
}

export function isAffect(game: GameSnapshot, card: CardId): boolean {
  return affectKinds.includes(playKind(game, card) ?? 'bang');
}

export function needsTarget(game: GameSnapshot, card: CardId): boolean {
  return targetKinds.includes(playKind(game, card) ?? '' as CardKind);
}

/** Players Brawl must hear from: every other living player who still has a card. */
export function brawlTargets(game: GameSnapshot) {
  const { table, you } = selectGameView(game.view);
  return table.players.filter(player => player.alive && player.id !== you && (player.hand_count > 0 || player.in_play.length > 0));
}

// Belle Star: during her turn the cards in front of the other players are inactive (engine `table_active`).
function tableActive(game: GameSnapshot, owner: PublicPlayer): boolean {
  const { table } = selectGameView(game.view);
  const turn = table.players.find(player => player.id === table.turn.player);
  return owner.id === table.turn.player || !(turn?.alive && has(turn, 'belle_star'));
}

/** Seat distance with equipment and character modifiers, as `effective_distance` in the engine. */
export function effectiveDistance(game: GameSnapshot, from: number, to: number): number {
  const { table } = selectGameView(game.view);
  const living = table.players.filter(player => player.alive);
  const a = living.findIndex(player => player.id === from), b = living.findIndex(player => player.id === to);
  if (a < 0 || b < 0) return Infinity;
  const source = living[a], target = living[b];
  const count = (owner: PublicPlayer, kinds: CardKind[]) => tableActive(game, owner) ? owner.in_play.filter(id => kinds.includes(cardFace(id)?.kind as CardKind)).length : 0;
  const around = Math.abs(a - b);
  const base = Math.min(around, living.length - around);
  return Math.max(1, base + count(target, ['mustang', 'hideout']) + (from !== to && has(target, 'paul_regret') ? 1 : 0)
    - count(source, ['scope', 'binocular']) - (has(source, 'rose_doolan') ? 1 : 0));
}

const unlimitedBangs = (player: PublicPlayer) => has(player, 'willy_the_kid') || player.in_play.some(id => cardFace(id)?.kind === 'volcanic');

/**
 * Who a card may be aimed at. One list serves the Play button and drag-and-drop. Dodge City shots are
 * checked like the engine (range, Apache Kid's diamonds, one BANG! per turn); the base cards keep the
 * looser "input category" rule and leave range errors to the server.
 */
export function playTargets(game: GameSnapshot, card: CardId) {
  const { table, you } = selectGameView(game.view);
  const kind = playKind(game, card);
  const self = selfKinds.includes(kind ?? 'bang');
  const own = table.players.find(player => player.id === you);
  const suit = cardFace(card)?.suit;
  const strict = kind === 'punch' || kind === 'springfield' || kind === 'rag_time' || cardFace(card)?.kind === 'dodge';
  return needsTarget(game, card) ? table.players.filter(player => {
    if (!player.alive || (player.id === you && !self)) return false;
    if (!strict || !own) return true;
    if (player.id !== you && has(player, 'apache_kid') && suit === '♦') return false;
    if (kind === 'punch') return effectiveDistance(game, own.id, player.id) <= 1;
    if (kind === 'bang') { // Dodge played as BANG! by Calamity Janet
      return (table.turn.bangs_played < 1 || unlimitedBangs(own)) && effectiveDistance(game, own.id, player.id) <= own.weapon_range;
    }
    return true;
  }) : [];
}

/** Hand cards of `target` that a taker can still pick: your own hand loses the cards you pay first. */
export function pickableHand(game: GameSnapshot, card: CardId, target: PublicPlayer): number {
  const { you, hand } = selectGameView(game.view);
  if (target.id !== you) return target.hand_count;
  return Math.max(0, hand.length - (playKind(game, card) === 'rag_time' ? 2 : 1));
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
  return actual === required || (required === 'missed' && actual === 'dodge') || (has(table.players.find((player) => player.id === you)!, 'calamity_janet')
    && ((required === 'bang' && (actual === 'missed' || actual === 'dodge')) || (required === 'missed' && actual === 'bang')));
}

export function playAction(game: GameSnapshot, draft: ActionDraft, locked: boolean): Action | null {
  if (locked || actionMode(game) !== 'turn' || draft.card === null) return null;
  const kind = playKind(game, draft.card);
  if (!kind) return null;
  const { table, you, hand } = selectGameView(game.view);
  const extra = needsExtra(game, draft.card);
  if (extra && (draft.extra === null || draft.extra === draft.card || !hand.includes(draft.extra))) return null;
  if (kind === 'brawl') {
    const picks: BrawlPick[] = [];
    for (const player of brawlTargets(game)) {
      const selection = draft.brawl[player.id];
      if (!selection || (selection === 'hand' ? player.hand_count === 0 : !player.in_play.includes(selection.in_play))) return null;
      picks.push({ target: player.id, selection });
    }
    // Nobody may have a card left: the server accepts an empty list and just spends the cards.
    return { type: 'brawl', card: draft.card, discard: draft.extra!, picks };
  }
  if (!needsTarget(game, draft.card)) return extra ? { type: 'play_with_discard', card: draft.card, discard: draft.extra!, target: null } : { type: 'play', card: draft.card, target: null };
  const target = playTargets(game, draft.card).find((player) => player.id === draft.target);
  if (!target) return null;
  if (isAffect(game, draft.card)) {
    const selection = draft.selection;
    if (!selection || (selection === 'hand' ? pickableHand(game, draft.card, target) === 0 : !target.in_play.includes(selection.in_play))) return null;
    return extra ? { type: 'affect_with_discard', card: draft.card, discard: draft.extra!, target: target.id, selection } : { type: 'affect_card', card: draft.card, target: target.id, selection };
  }
  return extra ? { type: 'play_with_discard', card: draft.card, discard: draft.extra!, target: target.id } : { type: 'play', card: draft.card, target: target.id };
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

export function chooseHandSlotAction(game: GameSnapshot, slot: number | null, locked: boolean): Action | null {
  const { table } = selectGameView(game.view);
  const waiting = table.waiting;
  if (locked || actionMode(game) !== 'pick_hand_slot' || waiting?.pending_id == null || waiting.kind.type !== 'pick_hand_slot' || slot === null || !Number.isInteger(slot) || slot < 0 || slot >= waiting.kind.count) return null;
  return { type: 'choose_hand_slot', pending_id: waiting.pending_id, slot };
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
  if (source === 'discard' && (!has(own, 'pedro_ramirez') || table.discard_count === 0)) return null;
  if (typeof source === 'object' && (!('player' in source) || !has(own, 'jesse_jones') || source.player === you || !table.players.some((player) => player.id === source.player && player.alive && player.hand_count > 0))) return null;
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
  return !table.winner && you !== null && table.players.some((player) => player.id === you && has(player, 'sid_ketchum'));
}

export function sidHealAction(game: GameSnapshot, discard: CardId[], locked: boolean): Action | null {
  const { table, you, hand } = selectGameView(game.view);
  if (locked || !isSid(game) || discard.length !== 2 || discard[0] === discard[1] || !discard.every((card) => hand.includes(card))) return null;
  const ownDying = table.waiting?.player === you && table.waiting.kind.type === 'dying';
  if (ownDying && table.waiting!.pending_id === null) return null;
  return { type: 'sid_heal', pending_id: ownDying ? table.waiting!.pending_id : null, discard: [discard[0], discard[1]] };
}
