export type SeatPose = {
  index: number;
  x: number;
  y: number;
  portraitX: number;
  portraitY: number;
  outwardX: number;
  outwardY: number;
  view: 'q3back' | 'q3front' | 'side';
  flip: boolean;
};

const characters = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export function seatActorUrl(playerId: number, view: SeatPose['view'], eliminated: boolean): string {
  if (eliminated) return `/platform/seat/ghost-${view}.webp`;
  return `/platform/seat/cowboy-${characters[playerId % characters.length]}-${view}.webp`;
}

export function catsSeatLayout(count: number, viewerIndex: number | null): SeatPose[] {
  const safeCount = Math.max(2, count);
  return Array.from({ length: safeCount }, (_, index) => {
    const offset = viewerIndex === null ? index : (index - viewerIndex + safeCount) % safeCount;
    const radians = Math.PI / 2 + (offset * Math.PI * 2) / safeCount;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = 50 + cos * (safeCount >= 7 ? 40 : 37);
    const y = 50 + sin * (safeCount >= 7 ? 39 : 37);
    const portraitX = 50 + cos * 36;
    const portraitY = 50 + sin * 39;
    const view: SeatPose['view'] = sin > 0.45 ? 'q3back' : sin < -0.45 ? 'q3front' : 'side';
    return {
      index,
      x,
      y,
      portraitX,
      portraitY,
      outwardX: cos,
      outwardY: sin,
      view,
      flip: x > 50,
    };
  });
}
