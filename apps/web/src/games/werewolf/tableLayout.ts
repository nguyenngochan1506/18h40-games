export type TableSeatView = 'q3front' | 'side';

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
// Foreground and side seats flank the campfire using the side-profile pose warming hands inward,
// while far-side seats behind the fire face forward/inward so every villager always faces the fire.
const CAMPFIRE_RING_SEATS: Record<number, readonly [number, number, number, TableSeatView][]> = {
  5: [
    [34, 86, 0.25, 'side'],
    [17, 64, 0.23, 'side'],
    [31, 46, 0.21, 'q3front'],
    [71, 47, 0.21, 'q3front'],
    [72, 82, 0.25, 'side'],
  ],
  6: [
    [34, 86, 0.25, 'side'],
    [16, 66, 0.23, 'side'],
    [28, 46, 0.20, 'q3front'],
    [72, 46, 0.20, 'q3front'],
    [84, 66, 0.23, 'side'],
    [66, 86, 0.25, 'side'],
  ],
  7: [
    [33, 86, 0.25, 'side'],
    [15, 70, 0.23, 'side'],
    [21, 50, 0.21, 'side'],
    [50, 42, 0.19, 'q3front'],
    [79, 50, 0.21, 'side'],
    [85, 70, 0.23, 'side'],
    [67, 86, 0.25, 'side'],
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
      cardOffsetY: y < 50 ? 2 : y > 80 ? -6 : 0,
    };
  }

  // Smooth ground ring around the campfire for 8–16 players.
  // Half-step offset keeps foreground seats flanking left/right so everyone faces inward toward the fire.
  const step = (Math.PI * 2) / Math.max(1, count);
  const angle = Math.PI / 2 + step / 2 + slot * step;
  const rx = count >= 12 ? 41 : 38;
  const ry = count >= 12 ? 23 : 22;
  const x = 50 + rx * Math.cos(angle);
  const y = 66 + ry * Math.sin(angle);
  const view: TableSeatView = y < 54 && Math.abs(x - 50) <= 26 ? 'q3front' : 'side';
  const actorHeight = count >= 12 ? 0.17 : 0.20;
  return {
    slot,
    x,
    y,
    actorHeight,
    view,
    flip: x > 50,
    cardOffsetY: y < 50 ? 4 : y > 80 ? -6 : 2,
  };
}

export const CAMPFIRE_NIGHT_BACKDROP = '/werewolf/scene/campfire-night.jpg';
export const CAMPFIRE_DAY_BACKDROP = '/werewolf/scene/campfire-day.jpg';

export function campfireBackdrop(isNight: boolean): string {
  return isNight ? CAMPFIRE_NIGHT_BACKDROP : CAMPFIRE_DAY_BACKDROP;
}

export function tableActorImage(_playerId: number, view: TableSeatView, alive: boolean): string {
  return alive ? `/werewolf/scene/villager-${view}.png` : `/werewolf/scene/villager-ghost-${view}.png`;
}
