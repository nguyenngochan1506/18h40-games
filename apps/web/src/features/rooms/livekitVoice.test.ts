import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteParticipant, RemoteTrackPublication, Room, RoomEvent, Track } from 'livekit-client';
import { createLiveKitVoice } from './livekitVoice.ts';

test('LiveKit speaker updates only keep current participants with an enabled mic', t => {
  const on = t.mock.method(Room.prototype, 'on');
  let speakers: string[] = [];
  let micOn: string[] = [];
  const voice = createLiveKitVoice({
    connection() {},
    playback() {},
    speakers(ids) { speakers = ids; },
    micOn(ids) { micOn = ids; },
  });
  t.after(() => voice.close());
  const room = on.mock.calls[0].this as Room;
  const first = new RemoteParticipant(room.engine.client, 'PA_old', 'm-2-a-1');
  const trackInfo = {
    sid: 'TR_mic',
    name: 'microphone',
    source: Track.sourceToProto(Track.Source.Microphone),
    muted: false,
  } as ConstructorParameters<typeof RemoteTrackPublication>[1];
  const mic = new RemoteTrackPublication(Track.Kind.Audio, trackInfo, true);
  first.trackPublications.set(mic.trackSid, mic);

  room.remoteParticipants.set(first.identity, first);
  room.emit(RoomEvent.TrackPublished, mic, first);
  room.emit(RoomEvent.ActiveSpeakersChanged, [first]);
  assert.deepEqual(micOn, ['2']);
  assert.deepEqual(speakers, ['2']);
  room.remoteParticipants.delete(first.identity);
  room.emit(RoomEvent.ParticipantDisconnected, first);
  assert.deepEqual(micOn, []);
  assert.deepEqual(speakers, [], 'Leaving clears the speaking indicator immediately');

  const rejoined = new RemoteParticipant(room.engine.client, 'PA_new', 'm-2-a-2');
  room.remoteParticipants.set(rejoined.identity, rejoined);
  room.emit(RoomEvent.ParticipantConnected, rejoined);
  room.emit(RoomEvent.ActiveSpeakersChanged, [first]);
  assert.deepEqual(speakers, [], 'A stale speaker from the previous lease cannot mark the rejoined member');

  rejoined.trackPublications.set(mic.trackSid, mic);
  room.emit(RoomEvent.TrackPublished, mic, rejoined);
  room.emit(RoomEvent.ActiveSpeakersChanged, [rejoined]);
  assert.deepEqual(speakers, ['2']);
  trackInfo.muted = true;
  mic.updateInfo(trackInfo);
  room.emit(RoomEvent.TrackMuted, mic, rejoined);
  assert.deepEqual(micOn, []);
  assert.deepEqual(speakers, [], 'Muting clears the speaking indicator without waiting for another speaker update');
  room.emit(RoomEvent.ActiveSpeakersChanged, [rejoined]);
  assert.deepEqual(speakers, []);
  trackInfo.muted = false;
  mic.updateInfo(trackInfo);
  room.emit(RoomEvent.TrackUnmuted, mic, rejoined);
  assert.deepEqual(micOn, ['2']);
  assert.deepEqual(speakers, [], 'Unmuting does not restore the pruned speaker');
});
