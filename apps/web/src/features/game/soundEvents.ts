import { cardFace } from './cardCatalog.ts';
import { eventsToFx, scheduleFx } from './fx.ts';
import type { FxBatch, FxContext } from './fx.ts';
import { SOUND_BATCH_LIMIT } from './soundCatalog.ts';
import type { SoundKind } from './soundCatalog.ts';
import type { EventKind } from '../../generated/protocol.ts';

export type SoundJob = { kind: SoundKind; start: number };
export function shouldPlaySound(batch: FxBatch | null, seen: number | null, state: { enabled: boolean; hidden: boolean; muted: boolean }) {
  return batch !== null && batch.id !== seen && state.enabled && !state.hidden && !state.muted;
}

// Use the visual scheduler, but never derive sound from a private flight's card face.
export function eventsToSounds(events: EventKind[], ctx: FxContext, congested = false): SoundJob[] {
  const jobs: SoundJob[] = [];
  for (const event of events) {
    if (event.type === 'game_started') jobs.push({ kind: 'gamestart', start: 0 });
    if (event.type === 'deck_reshuffled') jobs.push({ kind: 'shuffle', start: 0 });
    if (event.type === 'store_opened') jobs.push({ kind: 'generalstore', start: 0 });
    if (event.type === 'card_passed' && cardFace(event.card)?.kind === 'dynamite') jobs.push({ kind: 'dynamite', start: 0 });
  }
  // The opening fanfare replaces the initial deal; setup is accepted only once by the reducer.
  if (events.some(e => e.type === 'game_started')) {
    if (events.some(e => e.type === 'turn_started' && e.player === ctx.you)) jobs.push({ kind: 'tap', start: 400 });
    return jobs.slice(0, SOUND_BATCH_LIMIT);
  }
  let gatling = false;
  for (const job of scheduleFx(eventsToFx(events, ctx), congested)) {
    let kind: SoundKind | null = null;
    switch (job.kind) {
      case 'shot': {
        const burst = events.some(e => e.type === 'card_played' && e.player === job.from && cardFace(e.card)?.kind === 'gatling');
        kind = burst ? gatling ? null : 'gatling' : 'shot'; if (burst) gatling = true; break;
      }
      case 'deflect': kind = 'missed'; break;
      case 'damage': kind = 'hit'; break;
      case 'heal': kind = 'clink'; break;
      case 'explosion': kind = 'explosion'; break;
      case 'jail': kind = 'jail'; break;
      case 'duel': kind = 'duel'; break;
      case 'indians': kind = 'indians'; break;
      case 'eliminate': kind = 'death'; break;
      case 'win': kind = 'victory'; break;
      case 'turn': kind = job.to === ctx.you ? 'tap' : null; break;
      case 'card': kind = job.from === 'draw' && job.to === 'hand' ? 'draw' : 'card'; break;
      case 'reveal': kind = 'card'; break;
      case 'equip': {
        const face = job.card === undefined ? undefined : cardFace(job.card)?.kind;
        kind = face === 'mustang' ? 'neigh' : face === 'dynamite' ? 'dynamite' : face && ['volcanic', 'schofield', 'remington', 'rev_carabine', 'winchester'].includes(face) ? 'reload' : 'tap'; break;
      }
    }
    if (kind) jobs.push({ kind, start: job.start });
  }
  return jobs.slice(0, SOUND_BATCH_LIMIT);
}
