import type { GameInfo } from '../types.ts';

export const info: GameInfo = { id: 'werewolf', name: 'Ma Sói', description: 'Cùng suy luận, tìm kẻ ẩn mình trong làng.', status: 'soon', enabled: false, limits: [5, 16], icon: '☾', load: () => import('./client.ts').then(module => module.client) };
