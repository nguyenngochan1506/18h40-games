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
      // Setup seq=0 already has the complete view; this step does not render events.
      return current && message.seq === current.seq + 1 ? { ...current, seq: message.seq, view: message.view } : current;
    default: return current;
  }
}

export type GameSyncState = { game: GameSnapshot | null; desynced: boolean };

export function receiveGameState(current: GameSyncState, message: ServerMessage): GameSyncState {
  if (message.type === 'joined') return { game: message.game, desynced: false };
  if (message.type === 'left' || (message.type === 'room_state' && message.room.phase === 'waiting')) return { game: null, desynced: false };
  if (current.desynced) return current;
  if ((message.type === 'game_update' || message.type === 'game_over') && current.game && message.seq > current.game.seq + 1) return { ...current, desynced: true };
  return { game: receiveGame(current.game, message), desynced: false };
}

export function inputLocked(state: { connected: boolean; pending: boolean; restoring: boolean; desynced: boolean }): boolean {
  return !state.connected || state.pending || state.restoring || state.desynced;
}
