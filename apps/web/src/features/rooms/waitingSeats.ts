import type { RoomView } from '../../generated/protocol.ts';
import { waitingActor, waitingSeat } from '../../shared/waitingScene.ts';

export function waitingSeats(room: RoomView) {
  // Match the server's player IDs: filter membership order, then enumerate.
  return room.members.filter(member => member.role === 'player').map((member, index) => {
    const seat = waitingSeat(index, room.max_players);
    return { member, seat, slot: index, actor: waitingActor(index, seat.view) };
  });
}
