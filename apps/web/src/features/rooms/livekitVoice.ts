import { LocalAudioTrack, Room, RoomEvent, Track, setLogLevel } from 'livekit-client';
import type { Participant, RemoteTrack } from 'livekit-client';
import type { MediaEvents, VoiceMedia } from './voice.ts';

setLogLevel('silent');

function memberIds(participants: Iterable<Participant>) {
  const ids = [];
  for (const { identity } of participants) {
    const id = /^m-(\d+)-a-\d+$/.exec(identity)?.[1];
    if (id) ids.push(id);
  }
  return ids;
}

export function createLiveKitVoice(events: MediaEvents): VoiceMedia {
  // Separate send and receive negotiation to avoid Chromium errors during simultaneous muted joins.
  const room = new Room({ singlePeerConnection: false });
  const audio = new Map<RemoteTrack, HTMLMediaElement>();
  let closed = false;
  let activeSpeakers: Participant[] = [];
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
  function syncSpeakers(participants = activeSpeakers) {
    if (closed) return;
    activeSpeakers = participants.filter(participant => participant.isMicrophoneEnabled &&
      (participant === room.localParticipant || room.remoteParticipants.get(participant.identity) === participant));
    events.speakers(memberIds(activeSpeakers));
  }
  function syncMicrophones() {
    if (closed) return;
    events.micOn(memberIds([...room.remoteParticipants.values()].filter(participant => participant.isMicrophoneEnabled)));
    syncSpeakers();
  }
  function reconnecting() {
    if (closed) return;
    activeSpeakers = [];
    events.connection('reconnecting');
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
    .on(RoomEvent.ActiveSpeakersChanged, syncSpeakers)
    .on(RoomEvent.ParticipantConnected, syncMicrophones)
    .on(RoomEvent.ParticipantDisconnected, syncMicrophones)
    .on(RoomEvent.TrackPublished, syncMicrophones)
    .on(RoomEvent.TrackUnpublished, syncMicrophones)
    .on(RoomEvent.LocalTrackUnpublished, () => syncSpeakers())
    .on(RoomEvent.TrackMuted, syncMicrophones)
    .on(RoomEvent.TrackUnmuted, syncMicrophones)
    .on(RoomEvent.SignalReconnecting, reconnecting)
    .on(RoomEvent.Reconnecting, reconnecting)
    .on(RoomEvent.Reconnected, () => {
      if (closed) return;
      events.connection('connected');
      syncMicrophones();
    })
    .on(RoomEvent.Disconnected, () => { if (!closed) events.connection('disconnected'); });

  return {
    async connect({ url, token }) {
      await room.connect(url, token, { maxRetries: 0 });
      if (closed) await room.disconnect();
      else {
        events.playback(room.canPlaybackAudio);
        syncMicrophones();
      }
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
