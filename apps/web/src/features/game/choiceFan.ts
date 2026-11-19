import type { EventKind } from '../../generated/protocol.ts';

export function choiceFan(count: number, cardWidth: number, available: number) {
  const cardHeight = cardWidth * 389 / 250;
  const edge = (size: number) => Math.min(25, (size - 1) * 1.5);
  const padding = (size: number) => cardHeight * Math.sin(edge(size) * Math.PI / 180) + 8;
  let capacity = Math.max(1, count);
  while (capacity > 1 && cardWidth + (capacity - 1) * 44 + 2 * padding(capacity) > available) capacity--;
  const rows = Math.ceil(count / capacity), perRow = rows ? Math.ceil(count / rows) : 0;
  return Array.from({ length: rows }, (_, row) => {
    const size = Math.min(perRow, count - row * perRow);
    const side = padding(size);
    const step = size < 2 ? 0 : Math.max(44, Math.min(cardWidth * .7, (available - cardWidth - 2 * side) / (size - 1)));
    const angleStep = size < 2 ? 0 : Math.min(3, 50 / (size - 1));
    return {
      width: cardWidth + Math.max(0, size - 1) * step + side * 2,
      height: 32 + cardHeight + cardWidth / 2 * Math.sin(edge(size) * Math.PI / 180) + edge(size) ** 2 * .025 + 8,
      step,
      slots: Array.from({ length: size }, (_, index) => {
        const angle = (index - (size - 1) / 2) * angleStep;
        return { index: row * perRow + index, left: side + index * step, angle, curve: angle ** 2 * .025 };
      }),
    };
  });
}

export function nextChoiceSlot(key: string, current: number, count: number) {
  if (!count) return null;
  if (key === 'ArrowLeft') return (current + count - 1) % count;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export function storeOwners(previous: (number | null)[], count: number, events: EventKind[]) {
  let owners = previous.length ? [...previous] : Array<number | null>(count + events.filter(event => event.type === 'store_card_claimed').length).fill(null);
  for (const event of events) {
    if (event.type === 'store_opened') owners = Array<number | null>(event.count).fill(null);
    if (event.type === 'store_card_claimed') {
      const index = owners.flatMap((owner, index) => owner === null ? [index] : [])[event.slot];
      if (index !== undefined) owners[index] = event.player;
    }
  }
  return owners.filter(owner => owner === null).length === count ? owners : Array<number | null>(count).fill(null);
}
