export type TableSeatView = 'q3back' | 'side' | 'q3front';

export type TableSeatPose = {
  slot: number;
  x: number;
  y: number;
  actorHeight: number;
  view: TableSeatView;
  flip: boolean;
  cardOffsetY: number;
};

// Ground seating coordinates around the central campfire clearing (50%, 59%).
// Slot 0 is always at bottom center (6 o'clock) facing inward into the campfire,
// leaving bottom-left (.ww-my-panel) and bottom-right (.ww-log-panel) HUD corners clear.
const CAMPFIRE_RING_SEATS: Record<number, readonly [number, number, number, TableSeatView][]> = {
  5: [
    [50, 84, 0.21, 'q3back'],
    [18, 63, 0.20, 'side'],
    [28, 45, 0.18, 'q3front'],
    [72, 45, 0.18, 'q3front'],
    [82, 63, 0.20, 'side'],
  ],
  6: [
    [50, 84, 0.21, 'q3back'],
    [28, 73, 0.20, 'q3back'],
    [18, 54, 0.19, 'side'],
    [50, 41, 0.17, 'q3front'],
    [82, 54, 0.19, 'side'],
    [72, 73, 0.20, 'q3back'],
  ],
  7: [
    [50, 84, 0.21, 'q3back'],
    [27, 73, 0.20, 'q3back'],
    [17, 56, 0.19, 'side'],
    [30, 43, 0.17, 'q3front'],
    [70, 43, 0.17, 'q3front'],
    [83, 56, 0.19, 'side'],
    [73, 73, 0.20, 'q3back'],
  ],
};

export function tableSeatPose(index: number, count: number, viewerIndex: number | null): TableSeatPose {
  const slot = viewerIndex === null || viewerIndex < 0 ? index : (index - viewerIndex + count) % count;
  const preset = CAMPFIRE_RING_SEATS[count];
  if (preset && preset[slot]) {
    const [x, y, actorHeight, view] = preset[slot];
    return {
      slot,
      x,
      y,
      actorHeight,
      view,
      flip: x > 50,
      cardOffsetY: view === 'q3front' ? 2 : view === 'side' ? 0 : -8,
    };
  }

  // Smooth ground ring around the central campfire for 8–16 players.
  const angle = Math.PI / 2 + (slot * Math.PI * 2) / Math.max(1, count);
  const rx = count >= 12 ? 40 : 36;
  const ry = count >= 12 ? 25 : 22;
  const x = 50 + rx * Math.cos(angle);
  const y = 60 + ry * Math.sin(angle);
  const view: TableSeatView = y >= 70 ? 'q3back' : y < 50 ? 'q3front' : 'side';
  const actorHeight = count >= 12 ? 0.14 : 0.17;
  return {
    slot,
    x,
    y,
    actorHeight,
    view,
    flip: x > 50,
    cardOffsetY: view === 'q3front' ? 4 : view === 'side' ? 2 : -6,
  };
}

export const CAMPFIRE_NIGHT_BACKDROP = '/werewolf/scene/campfire-night.webp';
export const CAMPFIRE_DAY_BACKDROP = '/werewolf/scene/campfire-day.webp';

export function campfireBackdrop(isNight: boolean): string {
  return isNight ? CAMPFIRE_NIGHT_BACKDROP : CAMPFIRE_DAY_BACKDROP;
}

export function tableActorImage(_playerId: number, view: TableSeatView, alive: boolean): string {
  return alive ? `/werewolf/scene/villager-${view}.webp` : `/werewolf/scene/villager-ghost-${view}.webp`;
}
