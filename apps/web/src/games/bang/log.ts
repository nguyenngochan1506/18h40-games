import type { CardId, Decision, EventKind, GameSeat, Winner } from '../../generated/protocol.ts';
import type { BangSnapshot as GameSnapshot } from './types.ts';
import { cardFace } from './cardCatalog.ts';
import { cards, characters, roles } from './i18n.ts';

export type LogEntry = { id: number; text: string };
export const LOG_LIMIT = 300;
export type LogContext = { seats: GameSeat[]; you: number | null; waiting?: Decision | null };

export function playerName(id: number, ctx: LogContext): string {
  return `${ctx.seats.find((seat) => seat.player_id === id)?.nickname ?? `Ghế ${id + 1}`}${id === ctx.you ? ' (bạn)' : ''}`;
}

export function cardName(id: CardId): string {
  const face = cardFace(id);
  return face ? `${cards[face.kind].name} (${face.rank}${face.suit})` : 'lá chưa xác định';
}

export function winnerName(winner: Winner): string {
  return winner === 'sheriff_and_deputies' ? 'Cảnh sát trưởng và Phó cảnh sát thắng' : winner === 'outlaws' ? 'Tội phạm thắng' : 'Kẻ phản bội thắng';
}

// Only format the recipient-filtered events; never fill missing details from the table or hand.
export function eventsToLog(events: EventKind[], ctx: LogContext): string[] {
  const name = (id: number) => playerName(id, ctx);
  // Panic! and Rag Time take the card for themselves; the other effects make the target discard it.
  const takes = (kind: string) => kind === 'panic' || kind === 'rag_time' || kind === 'conestoga';
  const list = (ids: CardId[]) => ids.length ? ids.map(cardName).join(', ') : 'không có lá nào';
  let waiting = ctx.waiting;
  return events.map((event): string => {
    switch (event.type) {
      case 'green_activated': return `${name(event.player)} bỏ lá xanh lá ${cardName(event.card)} để dùng hiệu ứng${event.target !== null ? ` lên ${name(event.target)}` : ''}.`;
      case 'table_card_taken': return `${name(event.player)} lấy ${cardName(event.card)} từ trước mặt ${name(event.target)}.`;
      case 'copy_chosen': return `${name(event.player)} có khả năng của ${characters[event.copied].name}.`;
      case 'skill_activated': return `${name(event.player)} dùng kỹ năng ${characters[event.character].name}.`;
      case 'choice_offered': return `${name(event.player)} xem riêng để chọn: ${list(event.cards)}.`;
      case 'card_shown': return `${name(event.player)} lộ lá ${cardName(event.card)}.`;
      case 'cards_stolen': return `${name(event.source)} lấy ${event.count} lá từ tay ${name(event.target)}.`;
      case 'stolen_cards': return `${name(event.source)} lấy từ tay ${name(event.target)}: ${list(event.cards)}.`;
      case 'cards_inherited': return `${name(event.player)} nhận ${event.count} lá của ${name(event.victim)}.`;
      case 'private_pool_discarded': return `Bỏ ${event.count} lá từ nhóm bài riêng, giữ kín mặt lá.`;
      case 'game_started': return `Ván bắt đầu. ${name(event.sheriff)} là Cảnh sát trưởng.`;
      case 'turn_started': return `Lượt của ${name(event.player)}.`;
      case 'cards_drawn': return `${name(event.player)} rút ${event.count} lá.`;
      case 'cards_received': return `${name(event.player)} nhận: ${list(event.cards)}.`;
      case 'deck_reshuffled': return `Xáo lại ${event.count} lá vào bộ rút.`;
      case 'card_played': {
        if (event.target !== null) {
          const shooting = ['bang', 'missed', 'dodge', 'punch', 'springfield'].includes(cardFace(event.card)?.kind ?? '');
          return shooting ? `${name(event.player)} bắn ${name(event.target)} bằng ${cardName(event.card)}.` : `${name(event.player)} chơi ${cardName(event.card)} nhắm tới ${name(event.target)}.`;
        }
        if (waiting?.player === event.player && waiting.kind.type === 'attack_response') return `${name(event.player)} ${waiting.kind.kind === 'indians' ? 'đáp' : 'đỡ'} bằng ${cardName(event.card)}.`;
        if (waiting?.player === event.player && waiting.kind.type === 'duel') return `${name(event.player)} đáp Duel bằng ${cardName(event.card)}.`;
        if (waiting?.player === event.player && waiting.kind.type === 'dying') return `${name(event.player)} dùng ${cardName(event.card)} để cứu mạng.`;
        return `${name(event.player)} chơi ${cardName(event.card)}.`;
      }
      case 'card_discarded': return `${name(event.player)} bỏ ${cardName(event.card)}.`;
      case 'health_changed': return event.delta < 0 ? `${name(event.player)} ${event.source !== null ? `chịu đòn từ ${name(event.source)}, ` : ''}mất ${-event.delta} máu (còn ${event.health}).` : `${name(event.player)} hồi ${event.delta} máu (còn ${event.health}).`;
      case 'player_eliminated': return `${name(event.player)} bị loại. Vai: ${roles[event.role].name}.`;
      case 'decision_changed': {
        waiting = event.decision;
        if (!waiting) return 'Đã giải quyết xong lượt chờ.';
        const kind = waiting.kind;
        const prompt = kind.type === 'pick_hand_slot' ? `chọn 1 lá úp trên tay ${name(kind.target)}` : kind.type === 'turn' ? 'chơi lượt của mình' : kind.type === 'check' ? `lật kiểm tra cho ${cards[kind.reason].name}` : kind.type === 'attack_response' ? kind.kind === 'indians' ? 'bỏ BANG! hoặc chịu đòn' : `${kind.checks_left > 0 ? `lật Barrel (còn ${kind.checks_left} lần), ` : ''}đỡ bằng Missed! (còn ${kind.remaining}) hoặc chịu đòn` : kind.type === 'duel' ? 'đáp Duel' : kind.type === 'dying' ? 'dùng Beer hoặc kỹ năng để sống, hoặc chấp nhận bị loại' : kind.type === 'general_store' ? 'chọn 1 lá General Store' : kind.type === 'draw_choice' ? 'chọn nơi rút lá đầu' : kind.type === 'keep_cards' ? `chọn ${kind.keep} lá để giữ` : kind.type === 'choose_copy' ? 'chọn nhân vật để sao chép khả năng' : kind.type === 'vulture_split' ? `lấy một lá của ${name(kind.victim)} (chia với người cùng khả năng Vulture Sam)` : `chọn kết quả lật kiểm tra cho ${cards[kind.reason].name}`;
        return `Đang chờ ${name(waiting.player)} ${prompt}.`;
      }
      case 'card_equipped': return `${name(event.player)} đặt ${cardName(event.card)} trước mặt.`;
      case 'card_passed': return `${name(event.source)} chuyển ${cardName(event.card)} sang ${name(event.target)}.`;
      case 'dynamite_round_ended': return `${name(event.player)} bỏ Dynamite vì đã đi hết một vòng.`;
      case 'jail_expired': return `${name(event.player)} thoát Jail sau 3 lượt đã mất, không cần lật kiểm tra.`;
      case 'jail_held': return event.turns_left > 0 ? `${name(event.player)} mất lượt; Jail còn ở lại (${event.turns_left} lượt).` : `${name(event.player)} đã mất 3 lượt vì Jail; Jail tự bỏ ở đầu lượt kế tiếp.`;
      case 'hand_slots_opened': return `${name(event.actor)} mở bài trên tay ${name(event.target)} (${event.count} lá úp).`;
      case 'hand_slot_claimed': return `${name(event.actor)} chọn ô ${event.slot + 1} trên tay ${name(event.target)}.`;
      case 'hand_pick_cancelled': return `${name(event.actor)} dừng chọn bài từ tay ${name(event.target)}.`;
      case 'hand_affected': return `${name(event.source)} dùng ${cards[event.kind].name} ${takes(event.kind) ? 'lấy' : 'buộc bỏ'} ${event.count} lá từ tay ${name(event.target)}.`;
      case 'hand_card_affected': return `${name(event.source)} dùng ${cards[event.kind].name} ${takes(event.kind) ? 'lấy' : 'buộc bỏ'} ${cardName(event.card)} từ tay ${name(event.target)}.`;
      case 'in_play_card_affected': return `${name(event.source)} dùng ${cards[event.kind].name} ${takes(event.kind) ? 'lấy' : 'bỏ'} ${cardName(event.card)} trước mặt ${name(event.target)}.`;
      case 'draw_revealed': return `${name(event.player)} lật kiểm tra cho ${cards[event.reason].name}: ${cardName(event.card)}.`;
      case 'store_opened': return `General Store mở ${event.count} lá úp.`;
      case 'store_card_claimed': return `${name(event.player)} chọn một lá General Store.`
      case 'store_card_received': return `Bạn nhận ${cardName(event.card)}.`;
      case 'pool_discarded': return `Bỏ các lá còn lại: ${list(event.cards)}.`;
      case 'bounty_awarded': return `${name(event.player)} được thưởng rút 3 lá vì hạ ${name(event.victim)} (Tội phạm).`;
      case 'sheriff_penalized': return `${name(event.player)} bị phạt bỏ hết bài vì hạ ${name(event.victim)} (Phó cảnh sát).`;
      case 'game_ended': return `${winnerName(event.winner)}.`;
    }
  });
}

export function gameResult(game: GameSnapshot, you: number | null) {
  const table = game.view.perspective === 'player' ? game.view.view.table : game.view.view;
  const winner = table.winner;
  if (!winner) return null;
  return {
    title: winnerName(winner),
    players: table.players.map((player) => ({
      id: player.id, name: playerName(player.id, { seats: game.seats, you }), alive: player.alive,
      role: player.role ? roles[player.role].name : 'Vai chưa lộ',
      won: player.role === null ? null : winner === 'sheriff_and_deputies' ? player.role === 'sheriff' || player.role === 'deputy' : winner === 'outlaws' ? player.role === 'outlaw' : winner.renegade.player === player.id,
    })),
  };
}
