import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { soundCues, userSoundIds, bangSoundIds, defaultSoundSettings, loadSoundSettings, saveSoundSettings, SOUND_POLYPHONY, SOUND_BATCH_LIMIT, SoundLimiter } from './soundCatalog.ts';
import type { SoundKind } from './soundCatalog.ts';
import { eventsToSounds, shouldPlaySound } from './soundEvents.ts';
import { eventsToFx, scheduleFx } from './fx.ts';
import { initialGameState, receiveGameState, selectGameView } from './state.ts';
import { demoGame, demoRoom } from './demo.ts';
import { demoFx } from './demoFx.ts';
import { cardCatalog } from './cardCatalog.ts';
import type { EventKind, ServerMessage } from '../../generated/protocol.ts';

const ctx = { players: selectGameView(demoGame.view).table.players, seats: demoGame.seats, you: 0 };
const kinds = (events: EventKind[], you: number | null = 0) => eventsToSounds(events, { ...ctx, you }).map(j => j.kind);
const card = (kind: string) => cardCatalog.findIndex(c => c.kind === kind);
test('sound maps every public cue, including equipment, shuffle, start and local turn', () => {
  for (const [fixture, kind] of [['shot', 'shot'], ['gatling', 'gatling'], ['missed', 'missed'], ['damage', 'hit'], ['heal', 'clink'], ['explosion', 'explosion'], ['jail', 'jail'], ['eliminate', 'death'], ['duel', 'duel'], ['win', 'victory']] as const) assert.ok(kinds(demoFx[fixture].events).includes(kind), fixture);
  assert.ok(kinds(demoFx.duel.events).includes('indians'));
  assert.equal(kinds(demoFx.gatling.events).filter(k => k === 'gatling').length, 1);
  assert.equal(kinds(demoFx.gatling.events).includes('shot'), false);
  for (const [face, sound] of [['volcanic', 'reload'], ['winchester', 'reload'], ['mustang', 'neigh'], ['barrel', 'tap'], ['scope', 'tap'], ['dynamite', 'dynamite'], ['jail', 'jail']] as const) assert.ok(kinds([{ type: 'card_equipped', player: 1, card: card(face) }]).includes(sound), face);
  assert.deepEqual(kinds([{ type: 'game_started', sheriff: 0 }]), ['gamestart']);
  assert.deepEqual(kinds([{ type: 'game_started', sheriff: 0 }, { type: 'turn_started', player: 0 }]), ['gamestart', 'turn']);
  assert.deepEqual(kinds([{ type: 'deck_reshuffled', count: 40 }]), ['shuffle']);
  assert.ok(kinds([{ type: 'store_opened', count: 1 }]).includes('generalstore'));
  assert.ok(kinds([{ type: 'card_passed', source: 0, target: 1, card: card('dynamite') }]).includes('dynamite'));
  assert.deepEqual(kinds([{ type: 'turn_started', player: 1 }]), []);
  assert.deepEqual(kinds([{ type: 'turn_started', player: 0 }]), ['turn']);
  assert.deepEqual(kinds([{ type: 'turn_started', player: 0 }], null), []);
  assert.ok(kinds([{ type: 'draw_revealed', player: 1, reason: 'barrel', card: 37 }]).includes('missed'));
});

test('hidden draws and thefts sound identical regardless of private card faces', () => {
  const draw: EventKind[] = [{ type: 'cards_drawn', player: 0, count: 2 }];
  for (const cards of [[1, 26], [37, 65], [68, 79]]) {
    const events: EventKind[] = [...draw, { type: 'cards_received', player: 0, cards }];
    assert.deepEqual(kinds(events), ['draw', 'draw']);
    assert.deepEqual(kinds(events, null), ['card', 'card']);
    for (const you of [0, 1, 2, null]) assert.deepEqual(kinds([{ type: 'cards_stolen', source: 0, target: 1, count: 2 }, { type: 'stolen_cards', source: 0, target: 1, cards }], you), ['card', 'card']);
  }
  assert.deepEqual(kinds([{ type: 'choice_offered', player: 0, cards: [1] }]), []);
  assert.deepEqual(kinds([{ type: 'stolen_cards', source: 0, target: 1, cards: [1] }]), []);
});

test('audio timing follows the visual scheduler and batch size stays bounded', () => {
  const events = demoFx.shot.events;
  assert.equal(eventsToSounds(events, ctx).find(j => j.kind === 'shot')!.start, scheduleFx(eventsToFx(events, ctx)).find(j => j.kind === 'shot')!.start);
  const draws: EventKind[] = Array.from({ length: 50 }, () => ({ type: 'cards_drawn', player: 0, count: 3 }));
  assert.ok(eventsToSounds(draws, ctx).length <= SOUND_BATCH_LIMIT);
  assert.ok(eventsToSounds(draws, ctx, true).every(j => j.start <= 2400));
});

test('snapshot, duplicate, out-of-order, desync and rejoin cannot produce audio batches', () => {
  const start = { v: 1, type: 'game_started', seq: 0, seats: demoGame.seats, view: demoGame.view } satisfies ServerMessage;
  const setup = { v: 1, type: 'game_update', seq: 0, events: [{ type: 'game_started', sheriff: 0 }], view: demoGame.view } satisfies ServerMessage;
  let state = receiveGameState(initialGameState, start);
  assert.equal(state.soundBatch, null);
  state = receiveGameState(state, setup); assert.deepEqual(kinds(state.soundBatch!.events), ['gamestart']);
  assert.equal(receiveGameState(state, setup), state);
  const gap = receiveGameState(state, { ...setup, seq: 2 }); assert.equal(gap.soundBatch, null);
  const joined = receiveGameState(gap, { v: 1, type: 'joined', room_code: 'ABCDE', token: 'secret', room: demoRoom, game: { ...demoGame, seq: 0 } });
  assert.equal(joined.soundBatch, null); assert.equal(receiveGameState(joined, setup), joined);
  const batch = { id: 3, events: demoFx.shot.events, waiting: null };
  const ready = { enabled: true, hidden: false, muted: false };
  assert.equal(shouldPlaySound(batch, null, ready), true);
  assert.equal(shouldPlaySound(batch, 3, ready), false);
  assert.equal(shouldPlaySound(null, null, ready), false);
  for (const flags of [{ enabled: false }, { hidden: true }, { muted: true }]) assert.equal(shouldPlaySound(batch, null, { ...ready, ...flags }), false);
});

test('cooldown and polyphony reject excess voices; replacing a batch preserves cooldown', () => {
  const limiter = new SoundLimiter();
  assert.equal(limiter.admit('gatling', 0, 2200), true);
  assert.equal(limiter.admit('gatling', 899, 2200), false);
  limiter.clear(); assert.equal(limiter.admit('gatling', 899, 2200), false);
  assert.equal(limiter.admit('gatling', 900, 2200), true);
  const busy = new SoundLimiter();
  for (const kind of Object.keys(soundCues).slice(0, SOUND_POLYPHONY) as SoundKind[]) assert.equal(busy.admit(kind, 0, 1000), true);
  assert.equal(busy.admit('neigh', 1, 1000), false);
  assert.equal(busy.admit('neigh', 1001, 1000), true);
});

test('settings validate storage values and tolerate denied/corrupt storage', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSoundSettings(denied), defaultSoundSettings);
  assert.doesNotThrow(() => saveSoundSettings(denied, defaultSoundSettings));
  for (const value of ['bad', 'null', '{"enabled":true,"volume":2}', '{"enabled":1,"volume":0.6}']) assert.deepEqual(loadSoundSettings({ getItem: () => value }), defaultSoundSettings);
  let saved = ''; const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  saveSoundSettings(storage, { enabled: false, volume: .25 }); assert.deepEqual(loadSoundSettings(storage), { enabled: false, volume: .25 });
});

test('ten user MP3s are required, small and covered; bangweb remains optional with synthesis', async () => {
  let bytes = 0; assert.equal(userSoundIds.length, 10); assert.equal(bangSoundIds.length, 12);
  for (const id of userSoundIds) {
    const data = await readFile(new URL(`../../../../../assets/sfx/${id}.mp3`, import.meta.url));
    assert.ok(data.length >= 128); assert.ok(data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 255 && (data[1] & 224) === 224)); bytes += data.length;
    assert.ok(soundCues[id].files.includes(`/sfx/${id}.mp3`));
  }
  assert.ok(bytes <= 1024 * 1024);
  for (const config of Object.values(soundCues)) {
    assert.ok(config.synth && config.duration > 0 && config.gain > 0 && config.gain <= 1);
    assert.ok(config.fadeOut <= config.duration && config.cooldown > 0 && config.rate <= .03 && config.offset >= 0);
  }
  assert.ok(soundCues.gamestart.duration <= 3 && soundCues.death.duration <= 2 && soundCues.duel.duration <= 2);
  assert.equal(soundCues.hit.synth, 'hit'); assert.equal(soundCues.jail.synth, 'jail');
});

test('the synthesized fallback starts sources without any AudioBuffer', async () => {
  const { synthesize } = await import('./soundSynth.ts');
  let starts = 0, stops = 0;
  const parameter = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 });
  const node = () => ({ connect() {}, disconnect() {}, start() { starts++; }, stop() { stops++; }, frequency: parameter(), gain: parameter(), type: '', buffer: null });
  const ctx = { currentTime: 0, sampleRate: 44100, createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node, createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }) };
  for (const [kind, expected] of [['hit', 2], ['jail', 5], ['click', 2], ['ding', 1]] as const) {
    starts = 0; stops = 0;
    const sources = synthesize(ctx as unknown as AudioContext, node() as unknown as AudioNode, kind, kind === 'jail' ? .8 : .2);
    assert.equal(sources.length, expected); assert.equal(starts, expected); assert.equal(stops, expected);
  }
});
