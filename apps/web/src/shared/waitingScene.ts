// Platform saloon skin: positions match the chairs painted in waiting-table.webp.
const chairs = [
  [50, 85, .30, 'q3back'], [19, 79, .30, 'q3back'], [14, 52, .28, 'side'],
  [29, 34, .24, 'q3front'], [71, 34, .24, 'q3front'], [86, 52, .28, 'side'], [81, 79, .30, 'q3back'],
] as const;
export function waitingSeat(index: number, capacity: number) {
  const painted = capacity <= chairs.length ? chairs[index] : null;
  const angle = Math.PI / 2 + index * Math.PI * 2 / capacity;
  const [x, y, actorHeight, view] = painted ?? [50 + 38 * Math.cos(angle), 56 + 29 * Math.sin(angle), .22, 'q3front'];
  return { x, y, actorHeight, view, flip: x > 50 };
}
export const waitingBackdrop = '/platform/waiting-table.webp';
export const waitingActor = (index: number, view: string) => `/platform/seat/cowboy-${'abcdef'[index % 6]}-${view}.webp`;
