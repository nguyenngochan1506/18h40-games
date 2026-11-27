import type { GameInfo } from '../types.ts';

export const info: GameInfo = {
  id: 'werewolf',
  name: 'Ma Sói',
  description: 'Ultimate Werewolf: Deluxe Edition — 16 vai trò, cùng suy luận tìm bầy Sói ẩn mình trong làng.',
  status: 'available',
  enabled: true,
  limits: [5, 16],
  icon: '☾',
  lobbyBackdrop: '/werewolf/scene/campfire-night.webp',
  load: () => import('./client.ts').then(module => module.client),
};
