// Platform saloon skin: positions match the chairs painted in waiting-table.webp.
const chairs = [
  [50, 85, .30, 'q3back'], [19, 79, .30, 'q3back'], [14, 52, .28, 'side'],
  [29, 34, .24, 'q3front'], [71, 34, .24, 'q3front'], [86, 52, .28, 'side'], [81, 79, .30, 'q3back'],
] as const;
// Capacity 8 (an expansion table) seats the extra player at the top-centre of the same art.
const chairs8 = [chairs[0], chairs[1], chairs[2], [26, 35, .24, 'q3front'], [50, 27, .22, 'front'], [74, 35, .24, 'q3front'], chairs[5], chairs[6]] as const;
export function waitingSeat(index: number, capacity: number) {
  const painted = capacity <= chairs.length ? chairs[index] : capacity === 8 ? chairs8[index] : null;
  const angle = Math.PI / 2 + index * Math.PI * 2 / capacity;
  const [x, y, actorHeight, view] = painted ?? [50 + 38 * Math.cos(angle), 56 + 29 * Math.sin(angle), .22, 'q3front'];
  return { x, y, actorHeight, view, flip: x > 50 };
}
export const waitingBackdrop = '/platform/waiting-table.webp';
export const waitingActor = (index: number, view: string) => `/platform/seat/cowboy-${'abcdef'[index % 6]}-${view}.webp`;
