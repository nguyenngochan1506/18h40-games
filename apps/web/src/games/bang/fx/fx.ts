import type { CardId, Decision, EventKind, GameSeat, PublicPlayer } from '../../../generated/protocol.ts';
import { cardFace } from '../cardCatalog.ts';

export type FxAnchor = number | 'draw' | 'discard' | 'hand' | 'table' | `equipment-${number}` | `health-${number}` | `store-${number}`;
export type FxKind = 'shot' | 'deflect' | 'damage' | 'heal' | 'card' | 'equip' | 'explosion' | 'jail' | 'jail-held' | 'escape' | 'extinguish' | 'check' | 'duel' | 'indians' | 'eliminate' | 'reveal' | 'turn' | 'win';
export type FxCue = { kind: FxKind; from: FxAnchor; to: FxAnchor; card?: CardId; label?: string; delay?: number; duration?: number; result?: 'good' | 'bad' | 'neutral'; cards?: (CardId | undefined)[]; selected?: number; player?: number; fuse?: boolean; storeSlot?: number };
export type FxBatch = { id: number; events: EventKind[]; waiting: Decision | null };
export type FxContext = { players: PublicPlayer[]; seats: GameSeat[]; you: number | null; waiting?: Decision | null; lucky?: { player: number; cards: (CardId | undefined)[]; waiting: Decision | null } };
export const FX_CONCURRENT = 6;
export const FX_BATCH_LIMIT = 12;
export const FX_BUDGET = 2400;
export const CHECK_DURATION = 1400;

function checkResult(event: Extract<EventKind, { type: 'draw_revealed' }>, events: EventKind[], before?: Decision | null): Pick<FxCue, 'result' | 'label'> {
  const after = events.find(e => e.type === 'decision_changed');
  const next = after?.type === 'decision_changed' ? after.decision : undefined;
  let good: boolean | undefined;
  if (event.reason === 'dynamite') {
    if (events.some(e => e.type === 'health_changed' && e.player === event.player && e.delta < 0)) good = false;
    else if (events.some(e => e.type === 'card_passed' && e.source === event.player && cardFace(e.card)?.kind === 'dynamite' || e.type === 'dynamite_round_ended' && e.player === event.player)) good = true;
  } else if (event.reason === 'jail') {
    if (events.some(e => e.type === 'jail_held' && e.player === event.player || e.type === 'turn_started' && e.player !== event.player)) good = false;
    else if (events.some(e => e.type === 'card_discarded' && e.player === event.player && cardFace(e.card)?.kind === 'jail') && next?.player === event.player && ['turn', 'draw_choice', 'keep_cards'].includes(next.kind.type)) good = true;
  } else if (event.reason === 'barrel' && before?.player === event.player && before.kind.type === 'attack_response' && next !== undefined) {
    good = next?.player === event.player && next.kind.type === 'attack_response' ? next.kind.remaining < before.kind.remaining : next?.kind.type === 'turn' || next?.player !== event.player;
  }
  return { result: good === undefined ? 'neutral' : good ? 'good' : 'bad', label: good === undefined ? 'ĐÃ LẬT' : event.reason === 'barrel' ? good ? 'ĐỠ ĐƯỢC!' : 'TRƯỢT' : event.reason === 'jail' ? good ? 'THOÁT!' : 'MẤT LƯỢT' : good ? 'KHÔNG NỔ' : 'NỔ!' };
}

// Face data comes only from the recipient's events, never from a current hand or a guessed draw.
export function eventsToFx(events: EventKind[], ctx: FxContext): FxCue[] {
  const cues: FxCue[] = [];
  const hand = (player: number): FxAnchor => player === ctx.you ? 'hand' : player;
  const name = (id: number) => ctx.seats.find(s => s.player_id === id)?.nickname ?? `Ghế ${id + 1}`;
  let flightOrder = 0;
  const fly = (from: FxAnchor, to: FxAnchor, card?: CardId, delay = flightOrder++ * 100) => cues.push({ kind: 'card', from, to, card, delay });
  const received = events.filter((e): e is Extract<EventKind, { type: 'cards_received' }> => e.type === 'cards_received' && e.player === ctx.you);
  const drawOffsets = new Map<number, number>();
  const inheritedDraws = new Set<number>();
  let waiting = ctx.waiting;
  for (const event of events) {
    switch (event.type) {
      case 'card_played': {
        const kind = cardFace(event.card)?.kind;
        const equipped = events.some(e => e.type === 'card_equipped' && e.card === event.card);
        if (!equipped) fly(hand(event.player), 'discard', event.card);
        if (event.target !== null && (kind === 'bang' || kind === 'missed')) cues.push({ kind: 'shot', from: event.player, to: event.target });
        if (kind === 'gatling') ctx.players.filter(p => p.alive && p.id !== event.player).forEach((p, i) => cues.push({ kind: 'shot', from: event.player, to: p.id, delay: i * 130 }));
        if (event.target === null && waiting?.player === event.player && (waiting.kind.type === 'attack_response' || waiting.kind.type === 'duel')) {
          cues.push({ kind: waiting.kind.type === 'attack_response' && waiting.kind.kind !== 'indians' ? 'deflect' : 'duel', from: event.player, to: event.player, label: kind === 'missed' ? 'MISSED!' : 'BANG!' });
        }
        if (kind === 'duel' || kind === 'indians') cues.push({ kind, from: event.player, to: event.target ?? 'table', label: kind === 'duel' ? 'DUEL!' : 'INDIANS!' });
        break;
      }
      case 'health_changed':
        cues.push({ kind: event.delta > 0 ? 'heal' : 'damage', from: event.source ?? event.player, to: event.player, label: `${event.delta > 0 ? '+' : '−'}${Math.abs(event.delta)} máu`, ...(events.some(e => e.type === 'draw_revealed' && e.player === event.player) ? { delay: 850, duration: 500 } : {}) });
        if (event.delta < 0 && events.some(e => e.type === 'draw_revealed' && e.player === event.player && e.reason === 'dynamite')) cues.push({ kind: 'explosion', from: event.player, to: event.player, label: 'DYNAMITE!', delay: 850, duration: 500 });
        break;
      case 'cards_drawn': {
        const cards = received.filter(e => e.player === event.player).flatMap(e => e.cards);
        const offset = drawOffsets.get(event.player) ?? 0;
        const source = waiting?.player === event.player && waiting.kind.type === 'keep_cards' ? 'table' : events.some(e => e.type === 'skill_activated' && e.player === event.player && e.character === 'pedro_ramirez') && offset === 0 ? 'discard' : 'draw';
        if (!inheritedDraws.delete(event.player)) for (let i = 0; i < Math.min(event.count, FX_BATCH_LIMIT); i++) fly(source, hand(event.player), cards[offset + i], i * 100);
        drawOffsets.set(event.player, offset + event.count);
        break;
      }
      case 'cards_stolen': {
        const privateCards = ctx.you === event.source || ctx.you === event.target ? events.find((e): e is Extract<EventKind, { type: 'stolen_cards' }> => e.type === 'stolen_cards' && e.source === event.source && e.target === event.target)?.cards : undefined;
        for (let i = 0; i < Math.min(event.count, 3); i++) fly(hand(event.target), hand(event.source), privateCards?.[i], i * 90);
        break;
      }
      case 'cards_inherited': {
        const cards = received.filter(e => e.player === event.player).flatMap(e => e.cards);
        const offset = drawOffsets.get(event.player) ?? 0;
        for (let i = 0; i < Math.min(event.count, FX_BATCH_LIMIT); i++) fly(event.victim, hand(event.player), cards[offset + i], i * 100);
        inheritedDraws.add(event.player);
        break;
      }
      case 'hand_affected': {
        const detail = ctx.you === event.source || ctx.you === event.target ? events.find((e): e is Extract<EventKind, { type: 'hand_card_affected' }> => e.type === 'hand_card_affected' && e.source === event.source && e.target === event.target && e.kind === event.kind) : undefined;
        fly(hand(event.target), event.kind === 'panic' ? hand(event.source) : 'discard', detail?.card);
        break;
      }
      case 'in_play_card_affected': fly(`equipment-${event.target}`, event.kind === 'panic' ? hand(event.source) : 'discard', event.card); break;
      case 'card_discarded':
        if (!(cardFace(event.card)?.kind === 'dynamite' && events.some(e => e.type === 'dynamite_round_ended' && e.player === event.player))) fly(hand(event.player), 'discard', event.card, events.some(e => e.type === 'draw_revealed' && e.player === event.player && ['jail', 'dynamite'].includes(e.reason)) ? 850 : undefined);
        break;
      case 'card_passed':
        cues.push({ kind: 'card', from: `equipment-${event.source}`, to: `equipment-${event.target}`, card: event.card, delay: events.some(e => e.type === 'draw_revealed' && e.player === event.source && e.reason === 'dynamite') ? 850 : 0, ...(cardFace(event.card)?.kind === 'dynamite' ? { fuse: true } : {}) });
        break;
      case 'dynamite_round_ended': {
        const discarded = events.find(e => e.type === 'card_discarded' && e.player === event.player && cardFace(e.card)?.kind === 'dynamite');
        cues.push({ kind: 'extinguish', from: `equipment-${event.player}`, to: 'discard', card: discarded?.type === 'card_discarded' ? discarded.card : undefined, label: 'HẾT VÒNG', ...(events.some(e => e.type === 'draw_revealed' && e.player === event.player && e.reason === 'dynamite') ? { delay: 850, duration: 500 } : {}) });
        break;
      }
      case 'jail_held': cues.push({ kind: 'jail-held', from: event.player, to: event.player, label: event.turns_left ? `CÒN ${event.turns_left} LƯỢT` : 'SẮP ĐƯỢC THẢ', ...(events.some(e => e.type === 'draw_revealed' && e.player === event.player && e.reason === 'jail') ? { delay: 850, duration: 500 } : {}) }); break;
      case 'jail_expired': cues.push({ kind: 'escape', from: event.player, to: event.player, label: 'ĐƯỢC THẢ!' }); break;
      case 'card_equipped': {
        const play = events.find((e): e is Extract<EventKind, { type: 'card_played' }> => e.type === 'card_played' && e.card === event.card);
        fly(hand(play?.player ?? event.player), `equipment-${event.player}`, event.card);
        cues.push({ kind: cardFace(event.card)?.kind === 'jail' ? 'jail' : 'equip', from: event.player, to: event.player, card: event.card, label: cardFace(event.card)?.kind === 'jail' ? 'JAIL' : 'CẠCH' });
        break;
      }
      case 'draw_revealed': {
        const lucky = ctx.lucky?.player === event.player && waiting?.kind.type === 'choose_draw_result' ? ctx.lucky : undefined;
        const result = checkResult(event, events.slice(events.indexOf(event) + 1), lucky?.waiting ?? waiting);
        const choosing = waiting?.player === event.player && waiting.kind.type === 'choose_draw_result';
        const cards = lucky ? event.player === ctx.you ? [...lucky.cards] : [undefined, undefined] : choosing ? [event.card, undefined] : [event.card];
        const selected = lucky ? Math.max(0, cards.indexOf(event.card)) : choosing ? 0 : undefined;
        if (selected !== undefined) cards[selected] = event.card;
        cues.push({ kind: 'check', from: selected === undefined ? 'draw' : 'table', to: 'table', card: event.card, cards, selected, player: event.player, ...result });
        if (event.reason === 'barrel' && result.result === 'good') cues.push({ kind: 'deflect', from: event.player, to: event.player, label: 'KENG!', delay: 900, duration: 500 });
        if (event.reason === 'jail' && result.result === 'good') cues.push({ kind: 'escape', from: event.player, to: event.player, label: 'ĐƯỢC THẢ!', delay: 900, duration: 500 });
        break;
      }
      case 'skill_activated': {
        if (event.character !== 'lucky_duke') break;
        const decision = events.find(e => e.type === 'decision_changed' && e.decision?.player === event.player && e.decision.kind.type === 'choose_draw_result');
        if (!decision) break;
        const offered = event.player === ctx.you ? events.find(e => e.type === 'choice_offered' && e.player === event.player) : undefined;
        cues.push({ kind: 'check', from: 'draw', to: 'table', player: event.player, cards: offered?.type === 'choice_offered' ? offered.cards.slice(0, 2) : [undefined, undefined], result: 'neutral', label: event.player === ctx.you ? 'CHỌN 1 LÁ' : 'LUCKY DUKE' });
        break;
      }
      case 'store_opened': for (let i = 0; i < event.count; i++) fly('draw', 'table', undefined, i * 90); break;
      case 'store_card_claimed': {
        const received = events.find(e => e.type === 'store_card_received');
        cues.push({ kind: 'card', from: `store-${event.player}`, to: hand(event.player), card: event.player === ctx.you && received?.type === 'store_card_received' ? received.card : undefined, delay: 0, storeSlot: event.slot });
        break;
      }
      case 'store_card_received': break;
      case 'pool_discarded': event.cards.slice(0, 3).forEach((card, i) => fly('table', 'discard', card, i * 90)); break;
      case 'card_shown': cues.push({ kind: 'reveal', from: event.player, to: 'table', card: event.card }); break;
      case 'player_eliminated': cues.push({ kind: 'eliminate', from: event.player, to: event.player, label: 'BỊ LOẠI' }); break;
      case 'turn_started': cues.push({ kind: 'turn', from: 'table', to: event.player, label: `Lượt của ${name(event.player)}` }); break;
      case 'game_ended': cues.push({ kind: 'win', from: 'table', to: 'table', label: 'VÁN KẾT THÚC' }); break;
      case 'decision_changed': waiting = event.decision; break;
    }
  }
  return cues;
}

export function shouldPlayFx(batch: FxBatch | null, seen: number | null, state: { enabled: boolean; hidden: boolean; reduced: boolean }) {
  return batch !== null && batch.id !== seen && state.enabled && !state.hidden && !state.reduced;
}

// A new batch replaces the old one; there is deliberately no cross-batch backlog.
export function scheduleFx(cues: FxCue[], congested = false) {
  const lanes = Array<number>(FX_CONCURRENT).fill(0);
  const speed = congested ? .55 : 1;
  return cues.slice(-FX_BATCH_LIMIT).flatMap(cue => {
    const lane = lanes.indexOf(Math.min(...lanes));
    const duration = cue.kind === 'card' ? congested ? 380 : 520 : Math.round((cue.duration ?? (cue.kind === 'check' ? CHECK_DURATION : cue.kind === 'explosion' || cue.kind === 'eliminate' || cue.kind === 'win' ? 1200 : 900)) * speed);
    const start = Math.max(lanes[lane], Math.round((cue.delay ?? 0) * speed));
    if (start + duration > FX_BUDGET) return [];
    lanes[lane] = start + duration;
    return [{ ...cue, start, duration }];
  });
}

// Actor-local hand position; the viewer without an actor keeps the existing first-person anchor.
export function shotOrigin(from: { x: number; y: number }, to: { x: number; y: number }, actor?: { x: number; y: number; width: number; height: number; handX?: number; handY?: number }) {
  if (!actor) return from;
  return { x: actor.x + actor.width * (actor.handX ?? (to.x >= actor.x + actor.width / 2 ? .72 : .28)), y: actor.y + actor.height * (actor.handY ?? .62) };
}

export function particlePolicy(state: { width: number; reduced: boolean; webgl: boolean; cores?: number; memory?: number; saveData?: boolean }) {
  const enabled = state.width >= 900 && !state.reduced && state.webgl;
  return { enabled, ambient: enabled && !state.saveData && (state.cores ?? 8) > 4 && (state.memory ?? 8) > 4 };
}
