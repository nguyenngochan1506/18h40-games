export function seatLayout(count: number, viewerIndex: number | null) {
  if (!Number.isInteger(count) || count < 4 || count > 7) throw new RangeError('Expected 4 to 7 seats');
  if (viewerIndex !== null && (!Number.isInteger(viewerIndex) || viewerIndex < 0 || viewerIndex >= count)) throw new RangeError('Invalid viewer seat');
  return Array.from({ length: count }, (_, index) => {
    const offset = viewerIndex === null ? index : (index - viewerIndex + count) % count;
    const radians = Math.PI / 2 + offset * Math.PI * 2 / count;
    return {
      index,
      x: 50 + Math.cos(radians) * 36,
      y: 50 + Math.sin(radians) * 38,
      // Six seats place a pair beside the piles, requiring a wider portrait ellipse.
      portraitX: 50 + Math.cos(radians) * (count === 6 ? 35 : 32),
      portraitY: 50 + Math.sin(radians) * 38,
      landscapeY: 50 + Math.sin(radians) * 46,
      angle: ((radians * 180 / Math.PI - 90 + 180) % 360) - 180,
      outwardX: Math.cos(radians), outwardY: Math.sin(radians),
    };
  });
}
