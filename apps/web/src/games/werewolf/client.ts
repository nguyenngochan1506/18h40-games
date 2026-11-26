import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { GameClient } from '../types.ts';
import Board from './Board';
import Settings from './Settings';

function Root({ children }: { children: ReactNode }) {
  return createElement('div', { className: 'game-werewolf game-werewolf-root' }, children);
}

export const client: GameClient = { Board, Settings, Root };
