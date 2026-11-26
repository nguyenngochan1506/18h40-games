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

// Coordinates aligned with the 7 painted wooden chairs in /platform/waiting-table.webp.
// Slot 0 is always at bottom center (6 o'clock) for the local player.
const PAINTED_CHAIRS: Record<number, readonly [number, number, number, TableSeatView][]> = {
  5: [
    [50, 88, 0.27, 'q3back'],
    [12, 54, 0.27, 'side'],
    [26, 29, 0.23, 'q3front'],
    [74, 29, 0.23, 'q3front'],
    [88, 54, 0.27, 'side'],
  ],
  6: [
    [50, 88, 0.27, 'q3back'],
    [17, 78, 0.26, 'q3back'],
    [13, 46, 0.25, 'side'],
    [50, 25, 0.22, 'q3front'],
    [87, 46, 0.25, 'side'],
    [83, 78, 0.26, 'q3back'],
  ],
  7: [
    [50, 88, 0.27, 'q3back'],
    [17, 79, 0.26, 'q3back'],
    [12, 49, 0.25, 'side'],
    [27, 29, 0.23, 'q3front'],
    [73, 29, 0.23, 'q3front'],
    [88, 49, 0.25, 'side'],
    [83, 79, 0.26, 'q3back'],
  ],
};

export function tableSeatPose(index: number, count: number, viewerIndex: number | null): TableSeatPose {
  const slot = viewerIndex === null || viewerIndex < 0 ? index : (index - viewerIndex + count) % count;
  const preset = PAINTED_CHAIRS[count];
  if (preset && preset[slot]) {
    const [x, y, actorHeight, view] = preset[slot];
    return {
      slot,
      x,
      y,
      actorHeight,
      view,
      flip: x > 50,
      cardOffsetY: view === 'q3front' ? 0 : view === 'side' ? 4 : -10,
    };
  }

  // Smooth ellipse around the wooden table for 8–16 players.
  const angle = Math.PI / 2 + (slot * Math.PI * 2) / Math.max(1, count);
  const rx = count >= 12 ? 42 : 40;
  const ry = count >= 12 ? 35 : 33;
  const x = 50 + rx * Math.cos(angle);
  const y = 52 + ry * Math.sin(angle);
  const view: TableSeatView = y > 68 ? 'q3back' : y < 40 ? 'q3front' : 'side';
  const actorHeight = count >= 12 ? 0.17 : 0.21;
  return {
    slot,
    x,
    y,
    actorHeight,
    view,
    flip: x > 50,
    cardOffsetY: view === 'q3front' ? 8 : view === 'side' ? 6 : -6,
  };
}

export const TABLE_BACKDROP = '/platform/waiting-table.webp';

export function tableActorImage(playerId: number, view: TableSeatView, alive: boolean): string {
  if (!alive) return `/platform/seat/ghost-${view}.webp`;
  const variant = 'abcdef'[playerId % 6];
  return `/platform/seat/cowboy-${variant}-${view}.webp`;
}
