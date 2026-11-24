import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import type { ClientMessage } from '../../generated/protocol.ts';
import { createVoice } from './voice.ts';
import type { MediaEvents, VoiceMedia } from './voice.ts';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function microphone() {
  const track = Object.assign(new EventTarget(), {
    enabled: true, readyState: 'live',
    stop() { this.readyState = 'ended'; },
  });
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { track, stream };
}
function socket() {
  const sent: ClientMessage[] = [];
  return { readyState: 1 as const, send: (message: string) => { sent.push(JSON.parse(message)); }, sent };
}
type Socket = ReturnType<typeof socket>;

function harness(capture: () => Promise<MediaStream>, publish = async (_track: MediaStreamTrack) => {}) {
  let events!: MediaEvents;
  let opened = 0, closed = 0;
  const media: VoiceMedia = {
    async connect() { opened++; }, close() { closed++; }, publish, unpublish() {}, async startAudio() {},
  };
  const voice = createVoice(async () => handlers => { events = handlers; return media; }, capture);
  const grant = (connection: Socket, request = connection.sent.at(-1)) => {
    assert.ok(request?.type === 'voice_token');
    voice.receive(connection, { v: PROTOCOL_VERSION, type: 'voice_token_result', nonce: request.nonce,
      result: { status: 'ok', url: 'wss://example.test', token: 'test.header.signature', expires_at: Math.ceil(Date.now() / 1000) + 60 },
    });
  };
  return { voice, grant, opened: () => opened, closed: () => closed, net: () => events };
}

test('PTT ignores late permissions and stops a track before a pending publication completes', async () => {
  const late = deferred<MediaStream>();
  const publishing = deferred<void>();
  const first = microphone(), second = microphone();
  let captures = 0;
  const tracks: MediaStreamTrack[] = [];
  const { voice, grant, net } = harness(() => ++captures === 1 ? late.promise : Promise.resolve(second.stream), track => {
    tracks.push(track);
    return publishing.promise;
  });
  const ws = socket();
  const owner = Symbol(), other = Symbol();
  voice.attach(ws, 'member-A', true);
  voice.join();
  grant(ws);
  await settle();
  assert.equal(captures, 0);
  voice.setMode('hold');

  assert.equal(voice.startHold(owner, 'pointer:1'), true);
  assert.equal(voice.startHold(other, 'key:KeyV'), false);
  assert.equal(voice.endHold(other), false);
  assert.equal(voice.endHold(owner, 'pointer:1'), true);
  late.resolve(first.stream);
  await settle();
  assert.equal(first.track.readyState, 'ended');
  assert.equal(tracks.length, 0);

  assert.equal(voice.startHold(owner, 'key:KeyV'), true);
  await settle();
  assert.equal(tracks.length, 1);
  assert.equal(second.track.enabled, false);
  net().connection('reconnecting');
  assert.equal(second.track.readyState, 'ended');
  net().connection('connected');
  publishing.resolve();
  await settle();
  assert.equal(voice.snapshot().mic, 'off');
  assert.equal(captures, 2);
  voice.detach(ws, false);
});

test('a listening membership resumes muted after two socket drops and ignores the middle grant', async () => {
  const mic = microphone();
  const { voice, grant, opened, closed } = harness(async () => mic.stream);
  const first = socket(), second = socket(), third = socket(), fourth = socket();
  voice.attach(first, 'member-A', true);
  const initialRequest = first.sent.at(-1);
  grant(first);
  await settle();
  voice.toggleMic();
  await settle();
  assert.equal(voice.snapshot().mic, 'on');
  voice.detach(first, true);
  assert.equal(mic.track.readyState, 'ended');
  assert.equal(closed(), 1);
  voice.attach(second, 'member-A', true);
  const secondRequest = second.sent[0];
  assert.equal(secondRequest?.type, 'voice_token');
  voice.detach(second, true);
  voice.attach(third, 'member-A', true);
  const thirdRequest = third.sent[0];
  assert.equal(thirdRequest?.type, 'voice_token');
  assert.notEqual(thirdRequest.nonce, secondRequest.nonce);
  grant(first, initialRequest);
  grant(second, secondRequest);
  await settle();
  assert.equal(opened(), 1);
  assert.equal(voice.snapshot().phase, 'joining');
  grant(third);
  await settle();
  assert.equal(opened(), 2);
  assert.equal(voice.snapshot().mic, 'off');

  voice.leave();
  assert.equal(third.sent.at(-1)?.type, 'voice_leave');
  voice.detach(third, true);
  voice.attach(fourth, 'member-A', true);
  assert.equal(fourth.sent.length, 0);
  voice.join();
  const unusedGrant = fourth.sent.at(-1);
  voice.detach(fourth, false);
  grant(fourth, unusedGrant);
  await settle();
  assert.equal(opened(), 2);
  assert.equal(voice.snapshot().available, false);

  const nextRoom = socket();
  voice.attach(nextRoom, 'member-B', true);
  assert.equal(nextRoom.sent[0]?.type, 'voice_token');
  assert.equal(voice.snapshot().mic, 'off');
  voice.detach(nextRoom, false);
});

for (const mediaFirst of [true, false]) {
  test(`voice resumes muted when ${mediaFirst ? 'LiveKit' : 'the game socket'} disconnects first`, async () => {
    const mic = microphone();
    const { voice, grant, opened, closed, net } = harness(async () => mic.stream);
    const first = socket(), second = socket();
    voice.attach(first, 'member-A', true);
    voice.join();
    grant(first);
    await settle();
    const oldMedia = net();
    voice.toggleMic();
    await settle();
    assert.equal(voice.snapshot().mic, 'on');

    if (mediaFirst) {
      oldMedia.connection('disconnected');
      assert.equal(voice.snapshot().phase, 'idle');
      assert.equal(voice.snapshot().resumeOnReconnect, true);
      voice.attach(first, 'member-A', true);
      assert.equal(first.sent.filter(message => message.type === 'voice_token').length, 1);
    } else {
      voice.detach(first, true);
      oldMedia.connection('disconnected');
    }
    assert.equal(mic.track.readyState, 'ended');
    assert.equal(closed(), 1);
    if (mediaFirst) voice.detach(first, true);

    voice.attach(second, 'member-A', true);
    assert.equal(second.sent[0]?.type, 'voice_token');
    oldMedia.connection('disconnected');
    grant(second);
    await settle();
    assert.equal(opened(), 2);
    assert.equal(voice.snapshot().phase, 'listening');
    assert.equal(voice.snapshot().mic, 'off');
    net().connection('disconnected');
    if (mediaFirst) voice.leave();
    voice.detach(second, mediaFirst);
    const third = socket();
    voice.attach(third, 'member-A', true);
    assert.deepEqual(third.sent.map(message => message.type), mediaFirst ? [] : ['voice_token']);
    voice.detach(third, false);
  });
}

test('a grant reaches LiveKit even when the device clock is ahead of its expiry', async t => {
  const serverTime = 1_800_000_000;
  t.mock.timers.enable({ apis: ['Date'], now: (serverTime + 90) * 1000 });
  const { voice, opened } = harness(async () => microphone().stream);
  const ws = socket();
  voice.attach(ws, 'member-A', true);
  voice.join();
  const request = ws.sent.at(-1);
  assert.equal(request?.type, 'voice_token');
  voice.receive(ws, { v: PROTOCOL_VERSION, type: 'voice_token_result', nonce: request.nonce,
    result: { status: 'ok', url: 'wss://example.test', token: 'test.header.signature', expires_at: serverTime + 60 },
  });
  await settle();
  assert.equal(opened(), 1);
  assert.equal(voice.snapshot().phase, 'listening');
  voice.detach(ws, false);
});

test('only a correlated, valid voice response can reach the media adapter', async () => {
  const { voice, opened } = harness(async () => microphone().stream);
  const ws = socket();
  voice.attach(ws, 'member-A', true);
  const valid = { status: 'ok', url: 'wss://example.test', token: 'test.header.signature', expires_at: Math.ceil(Date.now() / 1000) + 60 };
  for (const result of [
    { status: 'unknown' }, { status: 'error', code: 'constructor' },
    { ...valid, url: 'https://example.test' }, { ...valid, url: 'wss://example.test/?token=secret' },
    { ...valid, token: 'invalid' }, { ...valid, expires_at: null }, { ...valid, expires_at: 0 },
    { ...valid, expires_at: -1 }, { ...valid, expires_at: 1.5 }, { ...valid, expires_at: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    voice.join();
    const request = ws.sent.at(-1);
    assert.equal(request?.type, 'voice_token');
    const response = { type: 'voice_token_result', v: PROTOCOL_VERSION, nonce: request.nonce, result } as const;
    voice.receive(ws, { ...response, nonce: String(request.nonce) });
    assert.equal(voice.snapshot().phase, 'joining');
    voice.receive(ws, response);
    assert.equal(voice.snapshot().phase, 'idle');
    assert.match(voice.snapshot().error ?? '', /thoại không hợp lệ/);
    assert.equal(ws.sent.at(-1)?.type, 'voice_leave');
  }
  await settle();
  assert.equal(opened(), 0);
  voice.detach(ws, false);
});
