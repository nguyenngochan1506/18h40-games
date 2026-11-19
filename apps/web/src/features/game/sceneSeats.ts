import type { SeatView } from './assetMap.ts';

function place(x: number, y: number, cardsX: number, cardsY: number, depth: number, actorHeight: number, view: SeatView) {
  const flip = x > 50;
  const faceX = view === 'front' ? .5 : view === 'q3back' ? .62 : .58;
  const handX = view === 'front' ? .5 : .82;
  return { x, y, cardsX, cardsY, depth, actorHeight, view, flip,
    faceX: flip ? 1 - faceX : faceX, faceY: .35,
    handX: flip ? 1 - handX : handX, handY: view === 'q3back' ? .78 : .92,
    angle: cardsX < 50 ? 8 : cardsX > 50 ? -8 : 0 };
}

// Portrait waists meet the chairs; hands reach inward over the painted table edge.
export const sceneSeats = {
  4: [place(50, 85, 50, 85, 1.12, .30, 'q3back'), place(14, 53, 27, 56, 1, .29, 'side'), place(50, 28, 50, 32, .90, .22, 'front'), place(86, 53, 73, 56, 1, .29, 'side')],
  5: [place(50, 85, 50, 85, 1.12, .30, 'q3back'), place(14, 54.5, 27, 57, 1, .29, 'side'), place(29, 34, 35, 40, .90, .24, 'q3front'), place(71, 34, 65, 40, .90, .24, 'q3front'), place(86, 54.5, 73, 57, 1, .29, 'side')],
  6: [place(50, 85, 50, 85, 1.12, .30, 'q3back'), place(19, 79, 19, 69, 1.05, .30, 'q3back'), place(17, 49, 28, 46, .98, .28, 'side'), place(50, 28, 50, 32, .90, .22, 'front'), place(83, 49, 72, 46, .98, .28, 'side'), place(81, 79, 81, 69, 1.05, .30, 'q3back')],
  7: [place(50, 85, 50, 85, 1.12, .30, 'q3back'), place(19, 79, 19, 69, 1.05, .30, 'q3back'), place(14, 52, 30, 54, .98, .28, 'side'), place(29, 34, 35, 40, .90, .24, 'q3front'), place(71, 34, 65, 40, .90, .24, 'q3front'), place(86, 52, 70, 54, .98, .28, 'side'), place(81, 79, 81, 69, 1.05, .30, 'q3back')],
};

export function sceneSeatLayout(count: number, viewerIndex: number | null) {
  if (!Number.isInteger(count) || count < 4 || count > 7) throw new RangeError('Expected 4 to 7 seats');
  if (viewerIndex !== null && (!Number.isInteger(viewerIndex) || viewerIndex < 0 || viewerIndex >= count)) throw new RangeError('Invalid viewer seat');
  const seats = sceneSeats[count as keyof typeof sceneSeats];
  return Array.from({ length: count }, (_, index) => {
    const slot = viewerIndex === null ? index : (index - viewerIndex + count) % count;
    // Keep the viewer's role reachable above their hand tray; spectators occupy the painted front chair.
    return { ...seats[slot], cardsY: viewerIndex !== null && slot === 0 ? 62 : seats[slot].cardsY, slot };
  });
}
