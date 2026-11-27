import type { GameClient } from '../types.ts';
import Board from './Board.tsx';
import Settings from './Settings.tsx';

export const client: GameClient = { Board, Settings };
