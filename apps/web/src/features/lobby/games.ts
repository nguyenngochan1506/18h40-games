import type { GameKind } from '../../generated/protocol.ts';

export const availableGames = {
  bang: { id: 'bang', name: 'BANG!', description: 'Đấu súng miền Tây, giấu vai và tìm đồng đội.', minPlayers: 4, maxPlayers: 7, status: 'available' },
} as const satisfies Record<GameKind, { id: GameKind; name: string; description: string; minPlayers: number; maxPlayers: number; status: 'available' }>;

export const games = [
  availableGames.bang,
  { id: 'uno', name: 'UNO', description: 'Đổi màu, đánh hết bài và hô UNO!', status: 'soon' },
  { id: 'werewolf', name: 'Ma Sói', description: 'Cùng suy luận, tìm kẻ ẩn mình trong làng.', status: 'soon' },
] as const;
