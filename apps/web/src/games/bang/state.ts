import { eventsToLog, LOG_LIMIT } from './log.ts';
import type { FxBatch } from './fx/fx.ts';
import type { LogEntry } from './log.ts';
import type { BangView } from '../../generated/protocol.ts';
import type { GameFrame } from '../../shared/gameSync.ts';
import type { BangSnapshot } from './types.ts';

export function selectGameView(view: BangView) {
  const table = view.perspective === 'player' ? view.view.table : view.view;
  const own = view.perspective === 'player' && table.players.find(player => player.id === view.view.you && player.alive);
  return { table, you: own && view.perspective === 'player' ? view.view.you : null, hand: own && view.perspective === 'player' ? view.view.hand : [], choices: own && view.perspective === 'player' ? view.view.choices : [] };
}
export type BangState = { game: BangSnapshot | null; log: LogEntry[]; nextLogId: number; fxBatch: FxBatch | null; soundBatch: FxBatch | null };
export const initialBangState: BangState = { game: null, log: [], nextLogId: 0, fxBatch: null, soundBatch: null };

export function receiveFrame(current: BangState, frame: GameFrame, viewer: number | null): BangState {
  if (frame.game.view.game !== 'bang' || frame.update && frame.update.game !== 'bang') throw new Error('Trạng thái không thuộc BANG!. Hãy kết nối lại.');
  const game: BangSnapshot = { ...frame.game, view: frame.game.view.payload };
  if (frame.reset) return { ...initialBangState, game, log: frame.reset === 'joined' ? [{ id: 0, text: 'Đã vào lại ván. Lịch sử trước đó không có; nhật ký bắt đầu từ trạng thái hiện tại.' }] : [], nextLogId: frame.reset === 'joined' ? 1 : 0 };
  if (!frame.update) return { ...current, game };
  const previous = current.game?.view;
  const waiting = previous ? selectGameView(previous).table.waiting : null;
  const text = eventsToLog(frame.update.events, { seats: game.seats, you: viewer, waiting });
  const batch = { id: game.seq, events: frame.update.events, waiting };
  return { game, log: [...current.log, ...text.map((text, i) => ({ id: current.nextLogId + i, text }))].slice(-LOG_LIMIT), nextLogId: current.nextLogId + text.length, fxBatch: frame.setup ? null : batch, soundBatch: batch };
}
