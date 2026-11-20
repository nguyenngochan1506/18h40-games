import type { ComponentType, ReactNode } from 'react';
import type { GameAction, GameKind, GameSettings, RoomView } from '../generated/protocol.ts';
import type { GameSyncState } from '../shared/gameSync.ts';

export type GameBoardProps = {
  room: RoomView; sync: GameSyncState; disabled: boolean; pending: boolean; requestVersion: number;
  actionError: string | null; actionErrorCode: string | null; fxEnabled: boolean; roomMenu: ReactNode;
  consume: (through: number) => void; sendAction: (action: GameAction) => void;
  endGame: () => void; leaveRoom: () => void; hostSkip: () => void;
};
export type GameSettingsProps = { settings: GameSettings; players: number; editable: boolean; onChange: (settings: GameSettings) => void };
export type GameClient = { Board: ComponentType<GameBoardProps>; Settings: ComponentType<GameSettingsProps>; Root?: ComponentType<{ children: ReactNode }> };
export type GameInfo = { id: GameKind; name: string; description: string; status: 'available' | 'soon'; enabled: boolean; limits?: readonly [number, number]; icon: string | { viewBox: string; paths: readonly string[] }; load: () => Promise<GameClient> };
