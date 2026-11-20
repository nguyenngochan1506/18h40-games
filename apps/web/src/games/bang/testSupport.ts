// Adapter tests express BANG payloads directly, then exercise the real v7 sync pipeline.
import type { GameSeat, GameView, ServerMessage as WireMessage } from '../../generated/protocol.ts';
import { initialGameState as initialSync, receiveGame as receiveWire, receiveGameState as receiveSync, inputLocked } from '../../shared/gameSync.ts';
import type { GameSyncState } from '../../shared/gameSync.ts';
import type { BangSnapshot } from './types.ts';
import type { BangView, BangEvents } from '../../generated/protocol.ts';
import { initialBangState, receiveFrame, selectGameView } from './state.ts';
import type { BangState } from './state.ts';
export { selectGameView, inputLocked };

type Step = { v: number; type: 'game_update' | 'game_over'; seq: number; view: BangView; events: BangEvents };
export type ServerMessage = Exclude<WireMessage, { type: 'game_started' | 'game_update' | 'game_over' | 'joined' }> |
  { v: number; type: 'game_started'; seq: number; seats: GameSeat[]; view: BangView } | (Omit<Step, 'type'> & { type: 'game_update' }) | (Omit<Step, 'type'> & { type: 'game_over' }) |
  (Omit<Extract<WireMessage, { type: 'joined' }>, 'game'> & { game: BangSnapshot | null });
const wireGame = (game: BangSnapshot | null) => game ? { ...game, view: { game: 'bang', payload: game.view } as GameView } : null;
function wire(message: ServerMessage): WireMessage {
  switch (message.type) {
    case 'game_started': return { ...message, view: { game: 'bang', payload: message.view } };
    case 'game_update': case 'game_over': return { v: message.v, type: message.type, seq: message.seq, update: { game: 'bang', events: message.events, view: message.view } };
    case 'joined': return { ...message, game: wireGame(message.game) };
    default: return message;
  }
}
export function receiveGame(current: BangSnapshot | null, message: ServerMessage): BangSnapshot | null {
  const before = wireGame(current), next = receiveWire(before, wire(message));
  if (next === before) return current;
  if (message.type === 'joined') return message.game;
  if (!next) return null;
  if (next.view.game !== 'bang') throw Error('Expected BANG');
  return { ...next, view: next.view.payload };
}
type TestState = BangState & { sync: GameSyncState; desynced: boolean; viewer: number | null };
export const initialGameState: TestState = { ...initialBangState, sync: initialSync, desynced: false, viewer: null };
export function receiveGameState(current: TestState, message: ServerMessage): TestState {
  const before = { ...current.sync, game: wireGame(current.game) };
  if (message.type === 'game_started' && message.view.perspective === 'player') { const you = message.view.view.you; before.you = message.seats.find(seat => seat.player_id === you)?.member_id ?? null; }
  const next = receiveSync(before, wire(message));
  if (next === before) return current;
  if (next.desynced) return { ...current, sync: next, desynced: true, fxBatch: null, soundBatch: null };
  let state: BangState = next.game ? current : initialBangState;
  for (const frame of next.frames) state = receiveFrame(state, frame, next.viewer);
  const game = message.type === 'joined' ? message.game : state.game;
  return { ...state, game, sync: { ...next, frames: [] }, viewer: next.viewer, desynced: next.desynced };
}
