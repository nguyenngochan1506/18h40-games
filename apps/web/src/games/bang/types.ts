import type { BangView, GameSnapshot } from '../../generated/protocol.ts';

export type BangSnapshot = Omit<GameSnapshot, 'view'> & { view: BangView };
