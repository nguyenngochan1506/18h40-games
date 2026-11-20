import type { GameDelta, GameSnapshot, GameView, ServerMessage } from '../generated/protocol.ts';

export type GameFrame = { id: number; game: GameSnapshot; update: GameDelta | null; reset: 'started' | 'joined' | null; setup: boolean };
export type GameSyncState = { game: GameSnapshot | null; desynced: boolean; setupPending: boolean; viewer: number | null; you: string | null; frames: GameFrame[]; revision: number; generation: number };
export const GAME_QUEUE_LIMIT = 128;
export const initialGameState: GameSyncState = { game: null, desynced: false, setupPending: false, viewer: null, you: null, frames: [], revision: 0, generation: 0 };

function deltaView(update: GameDelta): GameView {
  // Both fields come from the same discriminated variant.
  return { game: update.game, payload: update.view } as GameView;
}

export function receiveGame(current: GameSnapshot | null, message: ServerMessage): GameSnapshot | null {
  switch (message.type) {
    case 'joined': return message.game;
    case 'left': return null;
    case 'room_state': return message.room.phase === 'waiting' ? null : current;
    case 'game_started': return current === null && message.seq === 0 ? { seq: 0, seats: message.seats, view: message.view } : current;
    case 'game_update':
    case 'game_over': return current && message.seq === current.seq + 1 && message.update.game === current.view.game ? { ...current, seq: message.seq, view: deltaView(message.update) } : current;
    default: return current;
  }
}

export function receiveGameState(current: GameSyncState, message: ServerMessage): GameSyncState {
  if (message.type === 'left' || message.type === 'room_state' && message.room.phase === 'waiting') return { ...initialGameState, you: current.you, generation: current.generation };
  if (message.type === 'joined') {
    const viewer = message.game?.seats.find(seat => seat.member_id === message.room.you)?.player_id ?? null;
    return { ...initialGameState, game: message.game, viewer, you: message.room.you, generation: current.generation + 1,
      revision: message.game ? 1 : 0, frames: message.game ? [{ id: 1, game: message.game, update: null, reset: 'joined', setup: false }] : [] };
  }
  if (current.desynced) return current;
  const batch = message.type === 'game_update' || message.type === 'game_over';
  if (batch && (!current.game || message.update.game !== current.game.view.game || message.seq > current.game.seq + 1)) return { ...current, desynced: true, frames: [] };
  const game = receiveGame(current.game, message);
  const start = message.type === 'game_started' && game !== current.game && game;
  const setup = message.type === 'game_update' && message.seq === 0 && current.game?.seq === 0 && current.setupPending;
  if (!game || !start && !setup && game === current.game) return current;
  if (!start && !setup && !batch) return current;
  if (current.frames.length >= GAME_QUEUE_LIMIT) return { ...current, desynced: true, frames: [] };
  const id = current.revision + 1;
  const frame: GameFrame = { id, game, update: batch ? message.update : null, reset: start ? 'started' : null, setup: !!setup };
  return { ...current, game, revision: id, generation: start ? current.generation + 1 : current.generation,
    viewer: start ? game.seats.find(seat => seat.member_id === current.you)?.player_id ?? null : current.viewer,
    setupPending: !!start, frames: start ? [frame] : [...current.frames, frame] };
}

export function consumeFrames(current: GameSyncState, through: number): GameSyncState {
  const frames = current.frames.filter(frame => frame.id > through);
  return frames.length === current.frames.length ? current : { ...current, frames };
}

export function inputLocked(state: { connected: boolean; pending: boolean; restoring: boolean; desynced: boolean }): boolean {
  return !state.connected || state.pending || state.restoring || state.desynced;
}
