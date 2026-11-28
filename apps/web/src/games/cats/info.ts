import type { GameInfo } from '../types.ts';

export const info: GameInfo = {
  id: 'cats',
  name: 'Mèo Nổ',
  description: 'Rút bài, né Mèo Nổ & Mèo Sập cùng 3 bản mở rộng Imploding, Streaking, Barking.',
  status: 'available',
  enabled: true,
  limits: [2, 8],
  icon: '🐱',
  load: () => import('./client.ts').then(module => module.client),
};
