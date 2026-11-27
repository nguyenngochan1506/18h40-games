import type { Action, BrawlPick, CardId, CardKind, CardSelection, Character, DrawSource, PublicPlayer } from '../../generated/protocol.ts';
import type { BangSnapshot as GameSnapshot } from './types.ts';
import { cardFace } from './cardCatalog.ts';
import { selectGameView } from './state.ts';

export type ActionDraft = { storeSlot: number | null; handSlot: number | null; card: CardId | null; target: number | null; selection: CardSelection | null; discarding: boolean; discard: CardId[]; healing: boolean; source: DrawSource; kept: CardId[]; extra: CardId | null; brawl: Record<number, CardSelection>; green: CardId | null; doc: boolean; panel: 'green' | 'skills' | null };
export const emptyDraft: ActionDraft = { storeSlot: null, handSlot: null, card: null, target: null, selection: null, discarding: false, discard: [], healing: false, source: 'deck', kept: [], extra: null, brawl: {}, green: null, doc: false, panel: null };

export function actionMode(game: GameSnapshot): 'view' | 'waiting' | 'turn' | 'response' | 'check' | 'pick_hand_slot' | 'general_store' | 'draw_choice' | 'keep_cards' | 'choose_draw_result' | 'choose_copy' | 'vulture_split' {
  const { table, you } = selectGameView(game.view);
  if (you === null || table.winner) return 'view';
  if (!table.waiting || table.waiting.player !== you) return 'waiting';
  switch (table.waiting.kind.type) {
    case 'turn': return 'turn';
    case 'attack_response': case 'duel': case 'dying': return 'response';
    case 'pick_hand_slot': case 'check': case 'general_store': case 'draw_choice': case 'keep_cards': case 'choose_draw_result': return table.waiting.kind.type;
    case 'choose_copy': case 'vulture_split': return table.waiting.kind.type;
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
  const ownPlayer = table.players.find((player) => player.id === you);
  // A ready green Missed! card in front of you answers a Missed! request (the view already applies Belle Star).
  if (required === 'missed' && ownPlayer?.green_answers?.includes(card)) return true;
  if (!required || !actual || !hand.includes(card)) return false;
  // Elena Fuente (or Vera copying her): any hand card is a Missed!.
  if (required === 'missed' && ownPlayer && has(ownPlayer, 'elena_fuente')) return true;
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

/** Hand size kept at the end of the turn: Sean Mallory (or Vera copying him) keeps 10 whatever his health. */
export function handLimit(player: PublicPlayer): number {
  return has(player, 'sean_mallory') ? 10 : Math.max(0, player.health);
}

export function discardCount(game: GameSnapshot): number {
  const { table, you, hand } = selectGameView(game.view);
  const own = table.players.find((player) => player.id === you);
  return own ? Math.max(0, hand.length - handLimit(own)) : 0;
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
  if (typeof source === 'object' && 'in_play' in source) {
    const from = table.players.find((player) => player.id === source.in_play.player);
    if (!has(own, 'pat_brennan') || !from?.alive || !from.in_play.includes(source.in_play.card)) return null;
    return { type: 'choose_draw_source', pending_id: table.waiting.pending_id, source };
  }
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

/** Sid's heal needs a wound: the engine answers `WrongAction` at full health (a dying player is at 0 or less). */
export function canSidHeal(game: GameSnapshot): boolean {
  const { table, you } = selectGameView(game.view);
  return isSid(game) && table.players.some((player) => player.id === you && player.health < player.max_health);
}

export function sidHealAction(game: GameSnapshot, discard: CardId[], locked: boolean): Action | null {
  const { table, you, hand } = selectGameView(game.view);
  if (locked || !canSidHeal(game) || discard.length !== 2 || discard[0] === discard[1] || !discard.every((card) => hand.includes(card))) return null;
  const ownDying = table.waiting?.player === you && table.waiting.kind.type === 'dying';
  if (ownDying && table.waiting!.pending_id === null) return null;
  return { type: 'sid_heal', pending_id: ownDying ? table.waiting!.pending_id : null, discard: [discard[0], discard[1]] };
}

// ---- Dodge City: green-bordered cards -------------------------------------------------------------

/** The 13 green-bordered Dodge City cards. */
export const greenKinds: CardKind[] = ['bible', 'canteen', 'can_can', 'ten_gallon_hat', 'conestoga', 'derringer', 'buffalo_rifle', 'howitzer', 'pepperbox', 'iron_plate', 'pony_express', 'knife', 'sombrero'];
const greenNoTarget: CardKind[] = ['bible', 'canteen', 'pony_express', 'howitzer'];
const greenPicks: CardKind[] = ['can_can', 'conestoga'];
const greenShots: CardKind[] = ['derringer', 'knife', 'pepperbox', 'buffalo_rifle'];
/** Green cards with an active effect (Ten Gallon Hat, Iron Plate and Sombrero only answer as Missed!). */
export function greenActive(kind: CardKind | undefined): boolean {
  return !!kind && (greenNoTarget.includes(kind) || greenPicks.includes(kind) || greenShots.includes(kind));
}

function ownPlayer(game: GameSnapshot) {
  const { table, you } = selectGameView(game.view);
  return table.players.find((player) => player.id === you);
}

/** Players a green card can be aimed at; same distance, range and Apache Kid rules as the engine. */
export function greenTargets(game: GameSnapshot, card: CardId): PublicPlayer[] {
  const { table, you } = selectGameView(game.view);
  const own = ownPlayer(game), face = cardFace(card);
  if (!own || !face) return [];
  const isPick = greenPicks.includes(face.kind), isShot = greenShots.includes(face.kind);
  if (!isPick && !isShot) return [];
  return table.players.filter((player) => {
    if (!player.alive) return false;
    if (player.id !== you && has(player, 'apache_kid') && face.suit === '♦') return false;
    if (isPick) return true;
    if (player.id === you) return false;
    if (face.kind === 'derringer' || face.kind === 'knife') return effectiveDistance(game, own.id, player.id) <= 1;
    if (face.kind === 'pepperbox') return effectiveDistance(game, own.id, player.id) <= own.weapon_range;
    return true;
  });
}

/** Cards the player can take from `target` with Can Can / Conestoga (the spent green card cannot be picked). */
export function greenPickable(game: GameSnapshot, card: CardId, target: PublicPlayer) {
  const { you, hand } = selectGameView(game.view);
  return { hand: target.id === you ? hand.length : target.hand_count, table: target.in_play.filter((id) => !(target.id === you && id === card)) };
}

export function activateGreenAction(game: GameSnapshot, draft: ActionDraft, locked: boolean): Action | null {
  const own = ownPlayer(game);
  if (locked || actionMode(game) !== 'turn' || draft.green === null || !own?.green_ready?.includes(draft.green)) return null;
  const card = draft.green, kind = cardFace(card)?.kind;
  if (!kind || !greenActive(kind)) return null;
  if (greenNoTarget.includes(kind)) return { type: 'activate_green', card, target: null, selection: null };
  const target = greenTargets(game, card).find((player) => player.id === draft.target);
  if (!target) return null;
  if (greenShots.includes(kind)) return { type: 'activate_green', card, target: target.id, selection: null };
  const selection = draft.selection, can = greenPickable(game, card, target);
  if (!selection || (selection === 'hand' ? can.hand === 0 : !can.table.includes(selection.in_play))) return null;
  return { type: 'activate_green', card, target: target.id, selection };
}

// ---- Dodge City: character skills -----------------------------------------------------------------

export function chuckAction(game: GameSnapshot, locked: boolean): Action | null {
  const own = ownPlayer(game);
  return !locked && actionMode(game) === 'turn' && own && has(own, 'chuck_wengam') && own.health > 1 ? { type: 'chuck_draw' } : null;
}

const blueKinds: CardKind[] = ['volcanic', 'schofield', 'remington', 'rev_carabine', 'winchester', 'barrel', 'dynamite', 'jail', 'scope', 'mustang', 'binocular', 'hideout'];
/** Hand cards José Delgado may discard (blue equipment, not green); the two-per-turn cap is the server's. */
export function joseCards(game: GameSnapshot): CardId[] {
  const { hand } = selectGameView(game.view);
  const own = ownPlayer(game);
  const { skillUses } = selectGameView(game.view);
  return own && has(own, 'jose_delgado') && (skillUses?.jose_delgado ?? 0) < 2 ? hand.filter((card) => blueKinds.includes(cardFace(card)?.kind as CardKind)) : [];
}
export function joseAction(game: GameSnapshot, card: CardId | null, locked: boolean): Action | null {
  return !locked && actionMode(game) === 'turn' && card !== null && joseCards(game).includes(card) ? { type: 'jose_delgado', card } : null;
}

export function docTargets(game: GameSnapshot, cards: CardId[]): PublicPlayer[] {
  const { table, you } = selectGameView(game.view);
  const own = ownPlayer(game);
  if (!own || !has(own, 'doc_holyday') || selectGameView(game.view).skillUses?.doc_holyday) return [];
  const allDiamonds = cards.length === 2 && cards.every((card) => cardFace(card)?.suit === '♦');
  return table.players.filter((player) => player.alive && player.id !== you && !(allDiamonds && has(player, 'apache_kid')) && effectiveDistance(game, own.id, player.id) <= own.weapon_range);
}
export function docAction(game: GameSnapshot, cards: CardId[], target: number | null, locked: boolean): Action | null {
  const { hand } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'turn' || cards.length !== 2 || cards[0] === cards[1] || !cards.every((card) => hand.includes(card))) return null;
  return docTargets(game, cards).some((player) => player.id === target) ? { type: 'doc_holyday', cards: [cards[0], cards[1]], target: target! } : null;
}

// ---- Dodge City: Vera Custer and Vulture Sam decisions ---------------------------------------------

export function chooseCopyAction(game: GameSnapshot, target: number | null, locked: boolean): Action | null {
  const { table, you } = selectGameView(game.view);
  if (locked || actionMode(game) !== 'choose_copy' || table.waiting?.pending_id == null || target === null || target === you || !table.players.some((player) => player.id === target && player.alive)) return null;
  return { type: 'choose_copy', pending_id: table.waiting.pending_id, target };
}

export function vultureTakeAction(game: GameSnapshot, selection: CardSelection | null, locked: boolean): Action | null {
  const { table } = selectGameView(game.view);
  const waiting = table.waiting;
  if (locked || actionMode(game) !== 'vulture_split' || waiting?.pending_id == null || waiting.kind.type !== 'vulture_split' || selection === null) return null;
  if (selection === 'hand' ? waiting.kind.hand_count === 0 : !table.loot_table?.includes(selection.in_play)) return null;
  return { type: 'vulture_take', pending_id: waiting.pending_id, selection };
}
