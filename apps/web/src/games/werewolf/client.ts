import type { GameClient } from '../types.ts';
import Board from './Board';
import Settings from './Settings';

export const client: GameClient = { Board, Settings };
