import type { Action, CardId, CardSelection } from '../../../generated/protocol.ts';
import type { BangSnapshot as GameSnapshot } from '../types.ts';
import { actionMode, emptyDraft, needsTarget, playAction, playKind, playTargets, respondAction, responseCard } from '../actions.ts';
import type { ActionDraft } from '../actions.ts';
import { selectGameView } from '../state.ts';

export type Point = { x: number; y: number };
export type DropRect = { x: number; y: number; width: number; height: number };
export type DropZone = { player: number | null; rect: DropRect; selection?: CardSelection };
export function dragDestination(game: GameSnapshot, draft: ActionDraft, card: CardId, locked: boolean) {
  // shortcut: multi-card/pool decisions use click; extend when adding drag selection for those frames.
  if (locked || draft.discarding || draft.healing) return null;
  const mode = actionMode(game);
  if (mode === 'response') return responseCard(game, card) ? 'table' : null;
  if (mode !== 'turn' || !playKind(game, card)) return null;
  return needsTarget(game, card) ? 'player' : 'table';
}
export function dropZoneAt(point: Point, zones: DropZone[]) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  for (const zone of zones) {
    const r = zone.rect;
    if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) return zone;
  }
  return null;
}
export function dropAction(game: GameSnapshot, draft: ActionDraft, card: CardId, zone: DropZone | null, locked: boolean): { draft: ActionDraft; action: Action | null } | null {
  const destination = dragDestination(game, draft, card, locked);
  if (!destination || !zone || (destination === 'table' ? zone.player !== null : !playTargets(game, card).some(p => p.id === zone.player))) return null;
  const affect = ['panic', 'cat_balou'].includes(playKind(game, card) ?? '');
  const next = { ...emptyDraft, card, target: zone.player, selection: affect ? zone.selection ?? null : null };
  return { draft: next, action: actionMode(game) === 'response' ? respondAction(game, card, locked) : playAction(game, next, locked) };
}
export function settleDrop(card: CardId, seq: number, game: GameSnapshot, state: { ready: boolean; failed: boolean; settled: boolean }) {
  if (!selectGameView(game.view).hand.includes(card)) return 'accepted';
  if (!state.ready || state.failed || game.seq !== seq || state.settled) return 'rollback';
  return 'pending';
}
