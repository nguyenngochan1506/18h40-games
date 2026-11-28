import type { SeatView } from './assetMap.ts';

function place(x: number, y: number, cardsX: number, depth: number, actorHeight: number, view: SeatView) {
  const flip = x > 50, near = view === 'q3back' && x !== 50;
  const cardsY = y - actorHeight * 36;
  const faceX = view === 'front' ? .5 : view === 'q3back' ? .62 : .58;
  const handX = view === 'front' ? .5 : .82;
  return { x, y, cardsX, cardsY, depth, actorHeight, view, flip, near,
    faceX: flip ? 1 - faceX : faceX, faceY: .35,
    handX: flip ? 1 - handX : handX, handY: view === 'q3back' ? .78 : .92,
    angle: cardsX < 50 ? 8 : cardsX > 50 ? -8 : 0 };
}

// Portrait waists meet the chairs; hands reach inward over the painted table edge.
export const sceneSeats = {
  4: [place(50, 85, 50, 1.12, .30, 'q3back'), place(14, 53, 19, 1, .29, 'side'), place(50, 28, 50, .90, .22, 'front'), place(86, 53, 81, 1, .29, 'side')],
  5: [place(50, 85, 50, 1.12, .30, 'q3back'), place(14, 54.5, 19, 1, .29, 'side'), place(29, 34, 37.5, .90, .24, 'q3front'), place(71, 34, 62.5, .90, .24, 'q3front'), place(86, 54.5, 81, 1, .29, 'side')],
  6: [place(50, 85, 50, 1.12, .30, 'q3back'), place(19, 79, 26, 1.05, .30, 'q3back'), place(17, 49, 25.5, .98, .28, 'side'), place(50, 28, 50, .90, .22, 'front'), place(83, 49, 74.5, .98, .28, 'side'), place(81, 79, 74, 1.05, .30, 'q3back')],
  7: [place(50, 85, 50, 1.12, .30, 'q3back'), place(19, 79, 26, 1.05, .30, 'q3back'), place(14, 52, 25.5, .98, .28, 'side'), place(29, 34, 37.5, .90, .24, 'q3front'), place(71, 34, 62.5, .90, .24, 'q3front'), place(86, 52, 74.5, .98, .28, 'side'), place(81, 79, 74, 1.05, .30, 'q3back')],
  // Eight reuses the seven-seat table art and adds the top-centre chair; the side-top seats move outward.
  8: [place(50, 85, 50, 1.12, .30, 'q3back'), place(19, 79, 26, 1.05, .30, 'q3back'), place(14, 52, 25.5, .98, .28, 'side'), place(26, 35, 35, .90, .24, 'q3front'), place(50, 27, 50, .88, .22, 'front'), place(74, 35, 65, .90, .24, 'q3front'), place(86, 52, 74.5, .98, .28, 'side'), place(81, 79, 74, 1.05, .30, 'q3back')],
};

export function sceneSeatLayout(count: number, viewerIndex: number | null) {
  if (!Number.isInteger(count) || count < 4 || count > 8) throw new RangeError('Expected 4 to 8 seats');
  if (viewerIndex !== null && (!Number.isInteger(viewerIndex) || viewerIndex < 0 || viewerIndex >= count)) throw new RangeError('Invalid viewer seat');
  const seats = sceneSeats[count as keyof typeof sceneSeats];
  return Array.from({ length: count }, (_, index) => {
    const slot = viewerIndex === null ? index : (index - viewerIndex + count) % count;
    return { ...seats[slot], slot };
  });
}


export function sceneSeatGeometry(seat: Pick<ReturnType<typeof place>, 'cardsY' | 'y'>, height: number) {
  const lift = height * .015;
  return { badgeY: height * seat.cardsY / 100 - lift, actorY: height * seat.y / 100 - lift };
}
