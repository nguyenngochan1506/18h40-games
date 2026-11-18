function place(x: number, y: number, cardsX: number, cardsY: number, depth: number, actorHeight: number) {
  return { x, y, cardsX, cardsY, depth, actorHeight, angle: cardsX < 50 ? 8 : cardsX > 50 ? -8 : 0 };
}

// Chair anchors measured in each source image; cards sit inward on the painted tabletop.
export const sceneSeats = {
  4: [place(50, 89, 50, 85, 1.12, .30), place(10.5, 50, 24, 52, 1, .26), place(50, 28, 50, 30, .90, .22), place(89.5, 50, 76, 52, 1, .26)],
  5: [place(50, 89, 50, 85, 1.12, .30), place(10.5, 51.5, 24, 53, 1, .26), place(28, 31, 33, 35, .90, .22), place(72, 31, 67, 35, .90, .22), place(89.5, 51.5, 76, 53, 1, .26)],
  6: [place(50, 89, 50, 85, 1.12, .30), place(15, 77, 32, 66, 1.05, .30), place(14, 46, 25, 43, .98, .26), place(50, 28, 50, 30, .90, .22), place(86, 46, 75, 43, .98, .26), place(85, 77, 68, 66, 1.05, .30)],
  7: [place(50, 89, 50, 85, 1.12, .30), place(15, 77, 32, 67, 1.05, .30), place(11, 49, 21.5, 50, .98, .26), place(28, 31, 33, 35, .90, .22), place(72, 31, 67, 35, .90, .22), place(89, 49, 78.5, 50, .98, .26), place(85, 77, 68, 67, 1.05, .30)],
};

export function sceneSeatLayout(count: number, viewerIndex: number | null) {
  if (!Number.isInteger(count) || count < 4 || count > 7) throw new RangeError('Expected 4 to 7 seats');
  if (viewerIndex !== null && (!Number.isInteger(viewerIndex) || viewerIndex < 0 || viewerIndex >= count)) throw new RangeError('Invalid viewer seat');
  const seats = sceneSeats[count as keyof typeof sceneSeats];
  return Array.from({ length: count }, (_, index) => {
    const slot = viewerIndex === null ? index : (index - viewerIndex + count) % count;
    // Keep the viewer's role reachable above their hand tray; spectators occupy the painted front chair.
    return { ...seats[slot], cardsY: viewerIndex !== null && slot === 0 ? 70 : seats[slot].cardsY, slot };
  });
}
