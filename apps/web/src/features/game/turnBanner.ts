import type { SpectatorView } from '../../generated/protocol';
import { cards } from './i18n.ts';

export type TurnBanner = { text: string; own: boolean; key: string };

// Chỉ đọc dữ liệu đã có trong view: ai có lượt, ai đang bị chờ phản ứng.
export function turnBanner(table: Pick<SpectatorView, 'turn' | 'waiting' | 'winner'>, nicknames: Map<number, string>, viewer: number | null): TurnBanner | null {
  if (table.winner) return null;
  const name = (id: number) => nicknames.get(id) ?? `Ghế ${id + 1}`;
  const waiting = table.waiting;
  if (waiting && waiting.kind.type !== 'turn') {
    const own = waiting.player === viewer;
    const kind = waiting.kind;
    if (kind.type === 'pick_hand_slot') return { own, key: `wait:${waiting.player}`, text: own ? `Chọn lá từ tay ${name(kind.target)}` : `${name(waiting.player)} đang chọn lá từ tay ${name(kind.target)}` };
    const verb = kind.type === 'check' || kind.type === 'choose_draw_result' ? `lật ${cards[kind.reason].name}` : kind.type === 'attack_response' && kind.checks_left > 0 ? 'lật Barrel hoặc phản ứng' : kind.type === 'general_store' ? 'chọn' : 'phản ứng';
    return { own, key: `wait:${waiting.player}`, text: own ? `Chờ bạn ${verb}` : `${name(waiting.player)} đang ${verb}` };
  }
  const own = table.turn.player === viewer;
  return { own, key: `turn:${table.turn.player}`, text: own ? 'Đến lượt bạn!' : `Lượt của ${name(table.turn.player)}` };
}
