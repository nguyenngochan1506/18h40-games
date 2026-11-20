import { cards, characters, roles } from './i18n.ts';
import type { CardKind, Character, BangRole } from '../../generated/protocol.ts';
import { assetUrl, cardFiles } from './scene/assetMap.ts';

export function tooltipContent(key: string): { title: string; text: string; image?: string } | null {
  const [type, value, max] = key.split(':');
  if (type === 'card' && Object.hasOwn(cards, value)) { const kind = value as CardKind, card = cards[kind]; return { title: card.name, text: card.effect, image: assetUrl(cardFiles[kind]) }; }
  if (type === 'character' && Object.hasOwn(characters, value)) { const character = characters[value as Character]; return { title: character.name, text: character.ability }; }
  if (type === 'role') {
    if (Object.hasOwn(roles, value)) { const role = roles[value as BangRole]; return { title: role.name, text: role.description }; }
    if (value === 'hidden') return { title: 'Vai chưa lộ', text: 'Vai của người chơi này đang được giữ kín.' };
  }
  if (type === 'health' && /^\d+$/.test(value) && /^\d+$/.test(max)) return { title: `Máu: ${value}/${max}`, text: 'Mỗi viên đạn sáng tương ứng 1 máu. Khi hết máu, cần cứu mạng để tiếp tục ván.' };
  return null;
}

type Rect = { left: number; top: number; width: number; height: number };
export function tooltipPosition(anchor: Rect, tip: { width: number; height: number }, viewport: { width: number; height: number }, obstacles: Rect[] = []) {
  const gap = 12;
  const candidates = [
    [anchor.left + (anchor.width - tip.width) / 2, anchor.top - tip.height - gap],
    [anchor.left + (anchor.width - tip.width) / 2, anchor.top + anchor.height + gap],
    [anchor.left + anchor.width + gap, anchor.top],
    [anchor.left - tip.width - gap, anchor.top],
    ...obstacles.map(r => [anchor.left + (anchor.width - tip.width) / 2, r.top - tip.height - gap]),
    [gap, gap], [viewport.width - tip.width - gap, gap],
  ];
  for (const [x, y] of candidates) {
    if (y < gap || y + tip.height > viewport.height - gap) continue;
    const left = Math.max(gap, Math.min(viewport.width - tip.width - gap, x));
    const top = Math.max(gap, Math.min(viewport.height - tip.height - gap, y));
    if (!obstacles.some(r => left < r.left + r.width + gap && left + tip.width > r.left - gap && top < r.top + r.height + gap && top + tip.height > r.top - gap)) return { left, top };
  }
  return null;
}

export function tableShortcut(key: string, state: { desktop: boolean; editing: boolean; overlay: boolean; nativeControl: boolean; modified: boolean; repeat: boolean; locked: boolean; dragging: boolean }) {
  if (state.editing || state.overlay || state.modified || state.repeat || state.dragging) return null;
  if (key === 'Escape') return 'cancel';
  if (!state.desktop || state.locked) return null;
  if (key === 'Enter') return state.nativeControl ? null : 'confirm';
  if (/^[1-9]$/.test(key)) return Number(key) - 1;
  return null;
}
