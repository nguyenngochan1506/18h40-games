import { LocalAudioTrack, Room, RoomEvent, Track, setLogLevel } from 'livekit-client';
import type { Participant, RemoteTrack } from 'livekit-client';
import type { MediaEvents, VoiceMedia } from './voice.ts';

setLogLevel('silent');

export function createLiveKitVoice(events: MediaEvents): VoiceMedia {
  const room = new Room();
  const audio = new Map<RemoteTrack, HTMLMediaElement>();
  let closed = false;
  let micWork = Promise.resolve();
  let published: { raw: MediaStreamTrack; track: LocalAudioTrack } | undefined;

  function detach(track: RemoteTrack) {
    const element = audio.get(track);
    if (!element) return;
    audio.delete(track);
    track.detach(element);
    element.pause();
    element.remove();
  }
  function queueMic(work: () => Promise<void>) {
    const task = micWork.then(work);
    micWork = task.catch(() => undefined);
    return task;
  }

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (closed || track.kind !== Track.Kind.Audio || audio.has(track)) return;
      const element = track.attach();
      element.hidden = true;
      audio.set(track, element);
      document.body.append(element);
    })
    .on(RoomEvent.TrackUnsubscribed, detach)
    .on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!closed) events.playback(room.canPlaybackAudio); })
    .on(RoomEvent.ActiveSpeakersChanged, (participants: Participant[]) => {
      if (closed) return;
      events.speakers(participants.flatMap(({ identity }) => {
        const id = /^m-(\d+)-a-\d+$/.exec(identity)?.[1];
        return id ? [id] : [];
      }));
    })
    .on(RoomEvent.SignalReconnecting, () => { if (!closed) events.connection('reconnecting'); })
    .on(RoomEvent.Reconnecting, () => { if (!closed) events.connection('reconnecting'); })
    .on(RoomEvent.Reconnected, () => { if (!closed) events.connection('connected'); })
    .on(RoomEvent.Disconnected, () => { if (!closed) events.connection('disconnected'); });

  return {
    async connect({ url, token }) {
      await room.connect(url, token, { maxRetries: 0 });
      if (closed) await room.disconnect();
      else events.playback(room.canPlaybackAudio);
    },
    close() {
      closed = true;
      for (const track of audio.keys()) detach(track);
      void room.disconnect().catch(() => undefined);
    },
    publish(raw) {
      const live = () => !closed && raw.readyState === 'live';
      return queueMic(async () => {
        if (!live()) return;
        const track = new LocalAudioTrack(raw, undefined, true);
        track.source = Track.Source.Microphone;
        try {
          await track.mute();
          if (!live()) { track.stop(); return; }
          await room.localParticipant.publishTrack(track);
          published = { raw, track };
          if (live()) await track.unmute();
        } catch (error) {
          track.stop();
          throw error;
        }
      });
    },
    unpublish(raw) {
      void queueMic(async () => {
        if (published?.raw !== raw) return;
        const { track } = published;
        published = undefined;
        await room.localParticipant.unpublishTrack(track);
      }).catch(() => undefined);
    },
    startAudio: () => room.startAudio(),
  };
}
