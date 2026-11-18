import { eventsToLog, LOG_LIMIT } from './log.ts';
import type { LogEntry } from './log.ts';
import type { GameSnapshot, GameView, ServerMessage } from '../../generated/protocol.ts';

export function selectGameView(view: GameView) {
  const table = view.perspective === 'player' ? view.view.table : view.view;
  const own = view.perspective === 'player' && table.players.find((player) => player.id === view.view.you && player.alive);
  return {
    table,
    you: own && view.perspective === 'player' ? view.view.you : null,
    hand: own && view.perspective === 'player' ? view.view.hand : [],
    choices: own && view.perspective === 'player' ? view.view.choices : [],
  };
}

export function receiveGame(current: GameSnapshot | null, message: ServerMessage): GameSnapshot | null {
  switch (message.type) {
    case 'joined': return message.game;
    case 'left': return null;
    case 'room_state': return message.room.phase === 'waiting' ? null : current;
    case 'game_started':
      return current === null && message.seq === 0 ? { seq: message.seq, seats: message.seats, view: message.view } : current;
    case 'game_update':
    case 'game_over':
      // Setup seq=0 already has the complete view; its events are handled by receiveGameState.
      return current && message.seq === current.seq + 1 ? { ...current, seq: message.seq, view: message.view } : current;
    default: return current;
  }
}

export type GameSyncState = { game: GameSnapshot | null; desynced: boolean; log: LogEntry[]; nextLogId: number; setupPending: boolean; viewer: number | null };
export const initialGameState: GameSyncState = { game: null, desynced: false, log: [], nextLogId: 0, setupPending: false, viewer: null };

export function receiveGameState(current: GameSyncState, message: ServerMessage): GameSyncState {
  if (message.type === 'joined') return {
    ...initialGameState, game: message.game,
    viewer: message.game?.seats.find((seat) => seat.member_id === message.room.you)?.player_id ?? null,
    log: message.game ? [{ id: 0, text: 'Đã vào lại ván. Lịch sử trước đó không có; nhật ký bắt đầu từ trạng thái hiện tại.' }] : [], nextLogId: message.game ? 1 : 0,
  };
  if (message.type === 'left' || (message.type === 'room_state' && message.room.phase === 'waiting')) return initialGameState;
  if (current.desynced) return current;
  if ((message.type === 'game_update' || message.type === 'game_over') && current.game && message.seq > current.game.seq + 1) return { ...current, desynced: true };
  const game = receiveGame(current.game, message);
  if (message.type === 'game_started' && game !== current.game && game) return { ...initialGameState, game, setupPending: true, viewer: game.view.perspective === 'player' ? game.view.view.you : null };
  const setup = message.type === 'game_update' && message.seq === 0 && current.game?.seq === 0 && current.setupPending;
  if (game && (setup || (game !== current.game && (message.type === 'game_update' || message.type === 'game_over')))) {
    const previous = current.game?.view;
    const waiting = previous ? previous.perspective === 'player' ? previous.view.table.waiting : previous.view.waiting : null;
    const text = eventsToLog(message.events, { seats: game.seats, you: current.viewer, waiting });
    return { ...current, game, setupPending: false, nextLogId: current.nextLogId + text.length, log: [...current.log, ...text.map((text, i) => ({ id: current.nextLogId + i, text }))].slice(-LOG_LIMIT) };
  }
  return current;
}

export function inputLocked(state: { connected: boolean; pending: boolean; restoring: boolean; desynced: boolean }): boolean {
  return !state.connected || state.pending || state.restoring || state.desynced;
}
