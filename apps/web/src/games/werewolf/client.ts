import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { GameClient, GameWaitingScene } from '../types.ts';
import Board from './Board';
import Settings from './Settings';
import { CAMPFIRE_NIGHT_BACKDROP, tableActorImage, tableSeatPose } from './tableLayout.ts';
import type { TableSeatView } from './tableLayout.ts';

function Root({ children }: { children: ReactNode }) {
  return createElement('div', { className: 'game-werewolf game-werewolf-root' }, children);
}

const waitingScene: GameWaitingScene = {
  backdrop: CAMPFIRE_NIGHT_BACKDROP,
  seat: (index, _capacity, playerCount) => {
    const pose = tableSeatPose(index, Math.max(5, playerCount), null);
    return {
      x: pose.x,
      y: pose.y,
      actorHeight: pose.actorHeight,
      view: pose.view,
      flip: pose.flip,
    };
  },
  actor: (index, view) => tableActorImage(index, view as TableSeatView, true),
  className: 'ww-waiting-campfire',
};

export const client: GameClient = { Board, Settings, Root, waitingScene };
