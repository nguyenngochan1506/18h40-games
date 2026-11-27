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

// Ground seating coordinates around the central campfire clearing (50%, 62%).
// Slot 0 is always at bottom center (6 o'clock) facing inward into the campfire.
const CAMPFIRE_RING_SEATS: Record<number, readonly [number, number, number, TableSeatView][]> = {
  5: [
    [50, 90, 0.26, 'q3back'],
    [17, 70, 0.24, 'side'],
    [28, 48, 0.21, 'q3front'],
    [72, 48, 0.21, 'q3front'],
    [83, 70, 0.24, 'side'],
  ],
  6: [
    [50, 90, 0.26, 'q3back'],
    [21, 82, 0.25, 'q3back'],
    [17, 56, 0.22, 'side'],
    [50, 42, 0.19, 'q3front'],
    [83, 56, 0.22, 'side'],
    [79, 82, 0.25, 'q3back'],
  ],
  7: [
    [50, 90, 0.26, 'q3back'],
    [20, 82, 0.25, 'q3back'],
    [15, 59, 0.22, 'side'],
    [29, 46, 0.20, 'q3front'],
    [71, 46, 0.20, 'q3front'],
    [85, 59, 0.22, 'side'],
    [80, 82, 0.25, 'q3back'],
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
  const rx = count >= 12 ? 41 : 38;
  const ry = count >= 12 ? 23 : 22;
  const x = 50 + rx * Math.cos(angle);
  const y = 66 + ry * Math.sin(angle);
  const view: TableSeatView = y >= 74 ? 'q3back' : y < 52 ? 'q3front' : 'side';
  const actorHeight = count >= 12 ? 0.17 : 0.20;
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
