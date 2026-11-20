import type { GameInfo } from '../types.ts';

export const info: GameInfo = { id: 'uno', name: 'UNO', description: 'Đổi màu, đánh hết bài và hô UNO!', status: 'soon', enabled: false, limits: [2, 10], icon: 'U', load: () => import('./client.ts').then(module => module.client) };
