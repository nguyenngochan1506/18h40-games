import type { PublicPlayer } from '../../../generated/protocol.ts';
import { landscapeScenes, seatActorFile } from './assetMap.ts';
import { sceneSeatLayout } from './sceneSeats.ts';

export function gameSceneImages(players: PublicPlayer[], viewer: number | null, desktop: boolean) {
  if (!desktop) return [];
  const viewerIndex = players.findIndex(player => player.id === viewer);
  const seats = sceneSeatLayout(players.length, viewerIndex < 0 ? null : viewerIndex);
  return [...new Set([landscapeScenes[players.length as keyof typeof landscapeScenes], ...players.flatMap((player, i) => player.id === viewer ? [] : [seatActorFile(player.id, seats[i].view, !player.alive)])])];
}
