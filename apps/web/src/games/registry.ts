import type { GameKind } from '../generated/protocol.ts';
import type { GameClient, GameInfo } from './types.ts';
import { info as uno } from './uno/info.ts';
import { info as werewolf } from './werewolf/info.ts';
import { info as cats } from './cats/info.ts';

export const registry = {
  bang: { id: 'bang', name: 'BANG!', description: 'Đấu súng miền Tây, giấu vai và tìm đồng đội.', status: 'available', enabled: true, limits: [4, 7], icon: { viewBox: '0 0 32 32', paths: ['M4 10h24v6H14l-4 12-6-2 4-13M22 10V6M15 16v5h6v-5M4 10V7h11', 'M11 9v8m4-7v6m4-6v6'] }, load: () => import('./bang/index.ts').then(module => module.client) },
  uno, werewolf, cats,
} satisfies Record<GameKind, GameInfo>;
export const games: GameInfo[] = Object.values(registry);
export const availableGames = Object.fromEntries(games.filter(game => game.enabled).map(game => [game.id, game])) as Partial<Record<GameKind, GameInfo>>;
const loading = new Map<GameKind, Promise<GameClient>>();
export function loadGame(kind: GameKind): Promise<GameClient> {
  if (!registry[kind]?.enabled) return Promise.reject(new Error('Trò chơi chưa được hỗ trợ. Bạn vẫn có thể rời phòng.'));
  if (!loading.has(kind)) loading.set(kind, registry[kind].load().catch(error => { loading.delete(kind); throw error; }));
  return loading.get(kind)!;
}

export function loadDemo() {
  return import('./bang/demo/GameDemo.tsx');
}
