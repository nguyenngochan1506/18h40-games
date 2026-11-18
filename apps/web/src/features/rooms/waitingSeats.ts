import type { RoomView } from '../../generated/protocol.ts';
import { sceneSeats } from '../game/sceneSeats.ts';
import { seatActorFile } from '../game/assetMap.ts';

export function waitingSeats(room: RoomView) {
  // Match the server's player IDs: filter membership order, then enumerate.
  return room.members.filter(member => member.role === 'player').map((member, index) => {
    const seat = sceneSeats[7][index];
    return { member, seat, slot: index, actor: seatActorFile(index, seat.view) };
  });
}
