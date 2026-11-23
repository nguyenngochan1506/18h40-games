import type { ServerMessage } from '../testSupport.ts';
import { PROTOCOL_VERSION } from '../../../generated/protocol.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import type { EventKind } from '../../../generated/protocol.ts';
import { eventsToFx, FX_BUDGET, FX_CONCURRENT, FX_BATCH_LIMIT, scheduleFx, shouldPlayFx, shotOrigin } from './fx.ts';
import { cowboyFile, cowboyVariants, fxFiles, optionalSceneFiles, sceneFiles } from '../scene/assetMap.ts';
import { demoGame, demoRoom } from '../demo/demo.ts';
import { demoFx } from '../demo/demoFx.ts';
import { initialGameState, receiveGameState, selectGameView } from '../testSupport.ts';

const ctx = { players: selectGameView(demoGame.view).table.players, seats: demoGame.seats, you: 0 };
test('BANG and Gatling emit directed shots; response and Barrel deflect without inventing a shot', () => {
  const bang = eventsToFx(demoFx.shot.events, ctx);
  assert.deepEqual(bang.find(e => e.kind === 'shot'), { kind: 'shot', from: 1, to: 0 });
  const targets = eventsToFx(demoFx.gatling.events, ctx).filter(e => e.kind === 'shot');
  assert.deepEqual(targets.map(e => e.to), [1, 2, 4]);
  assert.deepEqual(targets.map(e => e.delay), [0, 130, 260]);
  const missed = eventsToFx(demoFx.missed.events, ctx);
  assert.equal(missed.filter(e => e.kind === 'deflect').length, 1);
  assert.equal(missed.some(e => e.kind === 'shot'), false);
  const barrel = eventsToFx(demoFx.barrel_good.events, { ...ctx, waiting: demoFx.barrel_good.waiting });
  assert.equal(barrel.some(e => e.kind === 'deflect'), true);
  assert.equal(eventsToFx([{ type: 'draw_revealed', player: 1, reason: 'barrel', card: 0 }], ctx).some(e => e.kind === 'deflect'), false);
});

test('unknown draws and stolen cards stay face down; private details enrich exactly one public flight', () => {
  assert.deepEqual(eventsToFx(demoFx.draw.events, ctx).map(e => e.card), [1, 26]);
  const spectator = { ...ctx, you: null };
  assert.deepEqual(eventsToFx(demoFx.draw.events, spectator).map(e => e.card), [undefined, undefined]);
  const stealing: EventKind[] = [{ type: 'cards_stolen', source: 0, target: 1, count: 1 }, { type: 'stolen_cards', source: 0, target: 1, cards: [7] }];
  assert.deepEqual(eventsToFx(stealing, ctx).map(e => e.card), [7]);
  assert.deepEqual(eventsToFx(stealing, spectator).map(e => e.card), [undefined]);
  assert.deepEqual(eventsToFx(stealing, { ...ctx, you: 2 }).map(e => e.card), [undefined]);
  const affect: EventKind[] = [{ type: 'hand_affected', source: 0, target: 1, kind: 'cat_balou', count: 1 }, { type: 'hand_card_affected', source: 0, target: 1, kind: 'cat_balou', card: 8 }];
  assert.equal(eventsToFx(affect, ctx)[0].to, 'discard');
  assert.equal(eventsToFx(affect, spectator)[0].card, undefined);
  assert.equal(eventsToFx([{ type: 'choice_offered', player: 1, cards: [75] }], ctx).length, 0);
  const shown = eventsToFx([{ type: 'card_shown', player: 1, card: 75 }], spectator);
  assert.equal(shown[0].card, 75);
  const many = eventsToFx([{ type: 'cards_drawn', player: 1, count: 9999 }], ctx);
  assert.equal(many.length, FX_BATCH_LIMIT);
});

test('equipment, inherited cards, Store and dynamite transfer use the correct public route', () => {
  const equip = eventsToFx(demoFx.jail.events, ctx);
  assert.equal(equip.filter(e => e.kind === 'card').length, 1);
  assert.equal(equip[0].from, 'hand'); assert.equal(equip[0].to, 'equipment-1');
  const transfers = eventsToFx([{ type: 'card_passed', source: 1, target: 2, card: 65 }, { type: 'cards_inherited', player: 0, victim: 3, count: 2 }, { type: 'store_card_claimed', player: 0, slot: 1 }, { type: 'store_card_received', card: 37 }], ctx);
  assert.deepEqual(transfers[0], { kind: 'card', from: 'equipment-1', to: 'equipment-2', card: 65, delay: 0, fuse: true });
  assert.equal(transfers[1].from, 3); assert.equal(transfers[1].card, undefined);
  const inherited = eventsToFx([{ type: 'cards_inherited', player: 0, victim: 3, count: 2 }, { type: 'cards_drawn', player: 0, count: 2 }, { type: 'cards_received', player: 0, cards: [1, 26] }], ctx);
  assert.equal(inherited.length, 2); assert.deepEqual(inherited.map(e => e.card), [1, 26]);
  assert.equal(inherited[0].from, 3);
  assert.equal(transfers.at(-1)!.card, 37); assert.equal(transfers.at(-1)!.to, 'hand');
});

test('damage, healing, explosion, jail, death, turn, duel and victory map to explicit cues', () => {
  for (const [key, expected] of [['damage', 'damage'], ['heal', 'heal'], ['explosion', 'explosion'], ['jail', 'jail'], ['duel', 'duel'], ['eliminate', 'eliminate'], ['turn', 'turn'], ['win', 'win']] as const) assert.ok(eventsToFx(demoFx[key].events, ctx).some(e => e.kind === expected), key);
  assert.equal(eventsToFx(demoFx.damage.events, ctx).some(e => e.kind === 'explosion'), false);
  assert.ok(eventsToFx(demoFx.jail_good.events, ctx).some(e => e.kind === 'escape' && e.label === 'ĐƯỢC THẢ!'));
  assert.equal(eventsToFx(demoFx.turn.events, ctx).at(-1)?.label, 'Lượt của Linh');
});

test('batch planner caps work, concurrent intervals and lifetime; congested batches shorten instead of queueing', () => {
  const cues = Array.from({ length: 200 }, () => ({ kind: 'shot' as const, from: 0 as const, to: 1 as const }));
  const plan = scheduleFx(cues);
  assert.ok(plan.length <= FX_BATCH_LIMIT);
  assert.ok(plan.every(e => e.start + e.duration <= FX_BUDGET));
  for (const time of plan.flatMap(e => [e.start, e.start + e.duration - .01])) assert.ok(plan.filter(e => e.start <= time && e.start + e.duration > time).length <= FX_CONCURRENT);
  assert.ok(scheduleFx(cues, true)[0].duration < plan[0].duration);
  const batch = { id: 3, events: demoFx.shot.events, waiting: null };
  const ready = { enabled: true, hidden: false, reduced: false };
  assert.equal(shouldPlayFx(batch, null, ready), true);
  assert.equal(shouldPlayFx(null, null, ready), false);
  assert.equal(shouldPlayFx(batch, 3, ready), false);
  for (const flag of [{ enabled: false }, { hidden: true }, { reduced: true }]) assert.equal(shouldPlayFx(batch, null, { ...ready, ...flag }), false);
});

test('manual draw results follow authoritative transitions, with neutral results when evidence is missing', () => {
  for (const [fixture, result, label] of [
    ['barrel_good', 'good', 'ĐỠ ĐƯỢC!'], ['barrel_bad', 'bad', 'TRƯỢT'],
    ['jail_good', 'good', 'THOÁT!'], ['jail_held', 'bad', 'MẤT LƯỢT'],
    ['dynamite_pass', 'good', 'KHÔNG NỔ'], ['explosion', 'bad', 'NỔ!'],
  ] as const) {
    const sample = demoFx[fixture];
    const cues = eventsToFx(sample.events, { ...ctx, waiting: 'waiting' in sample ? sample.waiting : null });
    const check = cues.find(cue => cue.kind === 'check')!;
    assert.equal(check.result, result, fixture); assert.equal(check.label, label, fixture);
    assert.ok(scheduleFx(cues).find(cue => cue.kind === 'check')!.duration <= 1400);
  }
  const classicJail: EventKind[] = [{ type: 'draw_revealed', player: 1, reason: 'jail', card: 27 }, { type: 'card_discarded', player: 1, card: 66 }, { type: 'turn_started', player: 2 }];
  assert.equal(eventsToFx(classicJail, ctx).find(cue => cue.kind === 'check')!.label, 'MẤT LƯỢT');
  assert.equal(eventsToFx(classicJail, ctx).some(cue => cue.kind === 'escape'), false);
  for (const reason of ['barrel', 'jail', 'dynamite'] as const) for (const card of [27, 37]) {
    const cues = eventsToFx([{ type: 'draw_revealed', player: 1, reason, card }], ctx);
    assert.equal(cues[0].result, 'neutral'); assert.equal(cues[0].label, 'ĐÃ LẬT');
    assert.equal(cues.length, 1, 'A face alone cannot imply a successful defense or release');
  }
  const swapped = demoFx.barrel_good.events.map(event => event.type === 'draw_revealed' ? { ...event, card: 27 } : event);
  assert.equal(eventsToFx(swapped, { ...ctx, waiting: demoFx.barrel_good.waiting })[0].result, 'good', 'The transition, not a second client rule engine, decides the outcome');
});

test('continuous hand flights route draws, plays, discards, reactions and hidden hand transfers without extra reveals', () => {
  const draws = eventsToFx([{ type: 'cards_drawn', player: 0, count: 2 }, { type: 'cards_received', player: 0, cards: [10, 11] }], ctx);
  assert.deepEqual(draws.map(cue => [cue.from, cue.to, cue.card, cue.delay]), [['draw', 'hand', 10, 0], ['draw', 'hand', 11, 100]]);
  assert.ok(scheduleFx(draws).every(cue => cue.duration >= 380 && cue.duration <= 520));
  const other = eventsToFx([{ type: 'cards_drawn', player: 1, count: 2 }], ctx);
  assert.ok(other.every(cue => cue.from === 'draw' && cue.to === 1 && cue.card === undefined));
  for (const card of [1, 26, 37]) {
    const play = eventsToFx([{ type: 'card_played', player: 0, card, target: null }], ctx)[0];
    assert.deepEqual([play.from, play.to, play.card], ['hand', 'discard', card]);
  }
  const discarded = eventsToFx([{ type: 'card_discarded', player: 0, card: 10 }, { type: 'card_discarded', player: 0, card: 11 }], ctx);
  assert.deepEqual(discarded.map(cue => [cue.from, cue.to, cue.delay]), [['hand', 'discard', 0], ['hand', 'discard', 100]]);
  for (const kind of ['panic', 'cat_balou'] as const) {
    const events: EventKind[] = [{ type: 'hand_affected', source: 0, target: 1, kind, count: 1 }, { type: 'hand_card_affected', source: 0, target: 1, kind, card: 10 }];
    const own = eventsToFx(events, ctx)[0], spectator = eventsToFx(events, { ...ctx, you: null })[0];
    assert.deepEqual([own.from, own.to, own.card], [1, kind === 'panic' ? 'hand' : 'discard', 10]);
    assert.equal(spectator.card, undefined);
  }
  const kit = eventsToFx([{ type: 'cards_drawn', player: 0, count: 1 }, { type: 'cards_received', player: 0, cards: [10] }], { ...ctx, waiting: { player: 0, pending_id: 5, kind: { type: 'keep_cards', keep: 2 } } });
  assert.equal(kit[0].from, 'table');
  const pedro = eventsToFx([{ type: 'cards_drawn', player: 0, count: 1 }, { type: 'cards_received', player: 0, cards: [10] }, { type: 'skill_activated', player: 0, character: 'pedro_ramirez' }], ctx);
  assert.equal(pedro[0].from, 'discard');
});

test('Club Jail and Dynamite cues use event counts and do not duplicate round-end flights', () => {
  assert.equal(eventsToFx(demoFx.jail_held.events, ctx).find(cue => cue.kind === 'jail-held')!.label, 'CÒN 2 LƯỢT');
  assert.equal(eventsToFx(demoFx.jail_last.events, ctx)[0].label, 'SẮP ĐƯỢC THẢ');
  assert.equal(eventsToFx(demoFx.jail_expired.events, ctx).find(cue => cue.kind === 'escape')!.label, 'ĐƯỢC THẢ!');
  const ended = eventsToFx(demoFx.dynamite_end.events, ctx);
  assert.equal(ended.length, 1); assert.equal(ended[0].kind, 'extinguish');
  assert.equal(ended[0].from, 'equipment-2'); assert.equal(ended[0].to, 'discard'); assert.equal(ended[0].label, 'HẾT VÒNG');
  assert.equal(eventsToFx(demoFx.dynamite_pass.events, ctx).find(cue => cue.kind === 'card')!.fuse, true);
  const checkedEnd = scheduleFx(eventsToFx([{ type: 'draw_revealed', player: 2, reason: 'dynamite', card: 37 }, ...demoFx.dynamite_end.events], ctx));
  const smoke = checkedEnd.find(cue => cue.kind === 'extinguish')!;
  assert.equal(checkedEnd.find(cue => cue.kind === 'check')!.result, 'good');
  assert.ok(smoke.start >= 850 && smoke.start + smoke.duration <= 1400, 'Round-end smoke waits for the revealed result');
  assert.ok(scheduleFx(eventsToFx(demoFx.jail_good.events, ctx)).filter(cue => cue.kind === 'card').every(cue => cue.start >= 850), 'The departing Jail cannot spoil the unrevealed check');
});

test('Lucky pairs use only recipient-visible choices, retain the chosen slot and mask every other viewer', () => {
  const fixture = demoFx.lucky_offer;
  const own = eventsToFx(fixture.events, { ...ctx, waiting: fixture.waiting })[0];
  assert.deepEqual(own.cards, [37, 27]);
  const lucky = { player: 0, cards: own.cards!, waiting: fixture.waiting };
  const chosen = eventsToFx(demoFx.lucky_chosen.events, { ...ctx, waiting: demoFx.lucky_chosen.waiting, lucky })[0];
  assert.equal(chosen.selected, 0); assert.deepEqual(chosen.cards, [37, 27]); assert.equal(chosen.result, 'good');
  for (const you of [1, null]) {
    const offered = eventsToFx(fixture.events, { ...ctx, you, waiting: fixture.waiting })[0];
    assert.deepEqual(offered.cards, [undefined, undefined], 'Even accidental private events cannot enrich another viewer');
    const result = eventsToFx(demoFx.lucky_chosen.events, { ...ctx, you, waiting: demoFx.lucky_chosen.waiting, lucky })[0];
    assert.deepEqual(result.cards, [37, undefined], 'Only the selected public draw is revealed');
  }
  assert.deepEqual(eventsToFx([{ type: 'choice_offered', player: 0, cards: [27, 37] }], ctx), [], 'An unrelated private choice is not a draw animation');
});

test('reducer keeps only fresh filtered events; setup/join/rejoin/gaps never replay FX', () => {
  let state = receiveGameState(initialGameState, { v: PROTOCOL_VERSION, type: 'game_started', seq: 0, seats: demoGame.seats, view: demoGame.view });
  const update = (seq: number, events: EventKind[] = demoFx.shot.events): ServerMessage => ({ v: PROTOCOL_VERSION, type: 'game_update', seq, view: demoGame.view, events });
  state = receiveGameState(state, update(0)); assert.equal(state.fxBatch, null);
  state = receiveGameState(state, update(1));
  assert.equal(state.fxBatch?.id, 1); assert.deepEqual(state.fxBatch?.events, demoFx.shot.events);
  const first = state.fxBatch;
  assert.equal(receiveGameState(state, update(1)), state);
  assert.equal(receiveGameState(state, update(0)), state);
  assert.equal(receiveGameState(state, { v: PROTOCOL_VERSION, type: 'pong', nonce: 1 }).fxBatch, first);
  state = receiveGameState(state, update(2, demoFx.heal.events));
  assert.deepEqual(state.fxBatch?.events, demoFx.heal.events);
  const gap = receiveGameState(state, update(4)); assert.equal(gap.fxBatch, null); assert.equal(gap.desynced, true);
  const joined: ServerMessage = { v: PROTOCOL_VERSION, type: 'joined', voice_enabled: false, room_code: 'ABCDE', token: 'private', room: demoRoom, game: demoGame };
  state = receiveGameState(gap, joined); assert.equal(state.fxBatch, null);
  assert.equal(receiveGameState(state, update(17)), state);
  state = receiveGameState(state, update(18)); assert.equal(state.fxBatch?.id, 18);
  assert.equal(receiveGameState(state, { v: PROTOCOL_VERSION, type: 'left' }).fxBatch, null);
});

test('cowboy style is stable by id across six variants with a safe original fallback', () => {
  for (let id = 0; id < 50; id++) {
    assert.equal(cowboyFile(id, cowboyVariants), cowboyVariants[id % 6]);
    assert.equal(cowboyFile(id, []), sceneFiles.cowboy);
  }
});

test('optional art: validate supplied WebP files and report missing files without failing', async t => {
  const present: string[] = [], missing: string[] = [];
  for (const url of Object.values(optionalSceneFiles)) {
    let data: Buffer;
    try { data = await readFile(new URL(`../../../../../../assets${url}`, import.meta.url)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; missing.push(url); continue; }
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', url);
    assert.ok(data.length > 1024, url); present.push(url);
  }
  t.diagnostic(`Optional scene files present (${present.length}): ${present.join(', ') || 'none'}`);
  t.diagnostic(`Optional scene files missing (${missing.length}), CSS/original fallback: ${missing.join(', ') || 'none'}`);
});


test('eight delivered FX images are required and retain their calibrated dimensions', async () => {
  assert.equal(Object.keys(fxFiles).length, 8);
  for (const [kind, url] of Object.entries(fxFiles)) {
    const data = await readFile(new URL(`../../../../../../assets${url}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', url);
    assert.equal(data.toString('ascii', 12, 16), 'VP8X', url);
    const dimensions = [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1];
    assert.deepEqual(dimensions, kind === 'bullet' ? [2172, 724] : kind === 'jail' ? [1086, 1448] : [1254, 1254], url);
  }
});

test('muzzle origin follows the near hand on either firing direction, preserving the viewer anchor', () => {
  const actor = { x: 20, y: 30, width: 100, height: 200 }, from = { x: 70, y: 100 };
  assert.deepEqual(shotOrigin(from, { x: 300, y: 80 }, actor), { x: 92, y: 154 });
  assert.deepEqual(shotOrigin(from, { x: 0, y: 80 }, actor), { x: 48, y: 154 });
  assert.equal(shotOrigin(from, { x: 300, y: 80 }), from);
});


test('angled muzzle stays on the inward hand regardless of the target side', () => {
  const from = { x: 50, y: 50 };
  for (const handX of [.82, .18]) for (const handY of [.78, .92]) {
    const actor = { x: 10, y: 30, width: 100, height: 200, handX, handY };
    const expected = { x: 10 + 100 * handX, y: 30 + 200 * handY };
    assert.deepEqual(shotOrigin(from, { x: 0, y: 0 }, actor), expected);
    assert.deepEqual(shotOrigin(from, { x: 300, y: 300 }, actor), expected);
  }
});

test('blind store FX flip only the recipient private face during the claimed card flight', () => {
  const opened = eventsToFx([{ type: 'store_opened', count: 7 }], ctx);
  assert.equal(opened.length, 7);
  assert.ok(opened.every(cue => cue.card === undefined && cue.from === 'draw' && cue.to === 'table'));
  const events: EventKind[] = [{ type: 'store_card_claimed', player: 0, slot: 2 }, { type: 'store_card_received', card: 37 }];
  const own = eventsToFx(events, ctx);
  assert.equal(own[0].card, 37);
  assert.equal(own[0].from, 'store-0');
  assert.equal(own.length, 1); assert.equal(own[0].to, 'hand');
  for (const you of [1, null]) {
    const other = eventsToFx(events.slice(0, 1), { ...ctx, you });
    assert.ok(other.every(cue => cue.card === undefined));
    assert.equal(other[0].to, 0);
  }
});

test('blind hand open/claim add no duplicate flight and only filtered recipient details reveal the result', () => {
  const open: EventKind[] = [{ type: 'hand_slots_opened', actor: 0, target: 1, count: 3 }];
  assert.deepEqual(eventsToFx(open, ctx), []);
  for (const kind of ['panic', 'cat_balou'] as const) {
    const publicEvents: EventKind[] = [{ type: 'hand_slot_claimed', actor: 0, target: 1, slot: 2 }, { type: 'hand_affected', source: 0, target: 1, kind, count: 1 }];
    const privateEvents: EventKind[] = [...publicEvents, { type: 'hand_card_affected', source: 0, target: 1, kind, card: 26 }];
    const own = eventsToFx(privateEvents, ctx);
    assert.equal(own.length, 1);
    assert.equal(own[0].card, 26);
    assert.equal(own[0].to, kind === 'panic' ? 'hand' : 'discard');
    for (const you of [1, 2, null]) {
      const other = eventsToFx(publicEvents, { ...ctx, you });
      assert.equal(other.length, 1);
      assert.equal(other[0].card, undefined);
    }
  }
});
