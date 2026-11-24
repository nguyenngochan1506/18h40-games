import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import type { ClientMessage, ServerMessage, VoiceError, VoiceTokenResult } from '../../generated/protocol.ts';

type Grant = Extract<VoiceTokenResult, { status: 'ok' }>;
type Connection = Pick<WebSocket, 'send' | 'readyState'>;
type VoiceMessage = {
  type: Extract<ServerMessage, { type: 'voice_token_result' | 'voice_leave_result' }>['type'];
  v?: unknown;
  nonce?: unknown;
  result?: unknown;
  error?: unknown;
};
export type MediaEvents = {
  connection(state: 'reconnecting' | 'connected' | 'disconnected'): void;
  playback(allowed: boolean): void;
  speakers(ids: string[]): void;
};
export type VoiceMedia = {
  connect(grant: Grant): Promise<void>;
  close(): void;
  publish(track: MediaStreamTrack): Promise<void>;
  unpublish(track: MediaStreamTrack): void;
  startAudio(): Promise<void>;
};

type VoiceState = {
  available: boolean;
  resumeOnReconnect: boolean;
  phase: 'offline' | 'idle' | 'joining' | 'listening' | 'reconnecting';
  mode: 'toggle' | 'hold';
  shortcut: boolean;
  mic: 'off' | 'starting' | 'on';
  playbackBlocked: boolean;
  speakers: string[];
  error: string | null;
};
type Membership = { socket: Connection; id: string };
type VoiceAttempt = { membership: Membership; nonce?: number; timer?: ReturnType<typeof setTimeout>; media?: VoiceMedia; connected: boolean };
type HeldInput = { owner: symbol; input: string };
type MicAttempt = { held: HeldInput | null; track?: MediaStreamTrack; timer?: ReturnType<typeof setTimeout>; ended: () => void };
type GiveUp = { socket: Connection; nonce: number; timer: ReturnType<typeof setTimeout> };

const REQUEST_MS = 5_000;
const CONNECT_MS = 15_000;
const HOLD_MS = 60_000;
const malformedResponse = 'Máy chủ gửi phản hồi thoại không hợp lệ. Hãy thử lại.';
const errors: Record<VoiceError, string> = {
  voice_disabled: 'Phòng này chưa bật thoại.',
  not_in_room: 'Hãy vào lại phòng để dùng thoại.',
  voice_unavailable: 'Chưa kết nối được thoại. Hãy thử lại.',
  rate_limited: 'Thoại đang bận. Hãy chờ vài giây rồi thử lại.',
};

function isVoiceError(value: unknown): value is VoiceError {
  return typeof value === 'string' && Object.hasOwn(errors, value);
}

function isVoiceResult(value: unknown): value is VoiceTokenResult {
  if (!value || typeof value !== 'object' || !('status' in value)) return false;
  if (value.status === 'error') return 'code' in value && isVoiceError(value.code);
  if (value.status !== 'ok' ||
      !('token' in value) || typeof value.token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(value.token) ||
      !('expires_at' in value) || typeof value.expires_at !== 'number' ||
      !Number.isSafeInteger(value.expires_at) || value.expires_at <= 0 ||
      !('url' in value) || typeof value.url !== 'string') return false;
  try {
    const url = new URL(value.url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'wss:' || local && url.protocol === 'ws:') &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

export function createVoice(
  loadMedia: () => Promise<(events: MediaEvents) => VoiceMedia> = () => import('./livekitVoice.ts').then(module => module.createLiveKitVoice),
  capture = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }),
) {
  let state: VoiceState = { available: false, resumeOnReconnect: false, phase: 'offline', mode: 'toggle', shortcut: false, mic: 'off', playbackBlocked: false, speakers: [], error: null };
  const listeners = new Set<() => void>();
  let membership: Membership | null = null;
  let intent: { id: string; join: boolean } | null = null;
  let run: VoiceAttempt | null = null;
  let left: GiveUp | null = null;
  let mic: MicAttempt | null = null;
  let nextNonce = 0;
  const send = (socket: Connection, type: 'voice_leave' | 'voice_token', nonce: number) => {
    if (socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, nonce } satisfies ClientMessage));
      return true;
    } catch { return false; }
  };

  function update(patch: Partial<VoiceState>) {
    state = { ...state, ...patch, resumeOnReconnect: intent?.join === true };
    for (const notify of listeners) notify();
  }
  function clearLeave() {
    clearTimeout(left?.timer);
    left = null;
  }
  function stopMic() {
    if (!mic) return;
    const old = mic;
    mic = null;
    clearTimeout(old.timer);
    if (old.track) {
      old.track.removeEventListener('ended', old.ended);
      old.track.enabled = false;
      old.track.stop();
      run?.media?.unpublish(old.track);
    }
    update({ mic: 'off' });
  }
  function closeRun() {
    stopMic();
    const old = run;
    run = null;
    clearTimeout(old?.timer);
    old?.media?.close();
    update({ phase: membership ? 'idle' : 'offline', speakers: [], playbackBlocked: false });
  }
  function signalLeave(socket: Connection) {
    clearLeave();
    const nonce = nextNonce = (nextNonce + 1) >>> 0;
    if (!send(socket, 'voice_leave', nonce)) return;
    left = { socket, nonce, timer: setTimeout(() => {
      left = null;
      if (!run && !state.error) update({ error: 'Đã ngắt thoại. Máy chủ chưa xác nhận rời kênh.' });
    }, REQUEST_MS) };
  }
  function fail(attempt: VoiceAttempt, error: string, release = true) {
    if (run !== attempt) return;
    // LiveKit can disconnect before the game socket notices the same loss.
    closeRun();
    if (release) signalLeave(attempt.membership.socket);
    update({ error });
  }
  function join() {
    if (!membership || run) return;
    intent = { id: membership.id, join: true };
    clearLeave();
    const nonce = nextNonce = (nextNonce + 1) >>> 0;
    const attempt: VoiceAttempt = { membership, nonce, connected: false };
    run = attempt;
    update({ phase: 'joining', error: null });
    if (send(membership.socket, 'voice_token', nonce)) {
      attempt.timer = setTimeout(() => fail(attempt, 'Máy chủ chưa cấp quyền thoại. Hãy thử lại.'), REQUEST_MS);
    } else fail(attempt, errors.voice_unavailable, false);
  }
  async function connect(attempt: VoiceAttempt, grant: Grant) {
    try {
      const createMedia = await loadMedia();
      if (run !== attempt || membership !== attempt.membership) return;
      const media = attempt.media = createMedia({
        connection(phase) {
          if (run !== attempt) return;
          if (phase === 'disconnected') {
            fail(attempt, 'Kết nối thoại đã ngắt. Hãy vào lại thoại.');
          } else if (phase === 'reconnecting') {
            stopMic();
            update({ phase, speakers: [] });
          } else if (attempt.connected) update({ phase: 'listening', error: null });
        },
        playback(allowed) {
          if (run === attempt) update({ playbackBlocked: !allowed });
        },
        speakers(speakers) {
          if (run === attempt && state.phase === 'listening') update({ speakers });
        },
      });
      await media.connect(grant);
      if (run !== attempt) return;
      clearTimeout(attempt.timer);
      attempt.connected = true;
      update({ phase: 'listening' });
    } catch { fail(attempt, errors.voice_unavailable); }
  }
  function startMic(held: HeldInput | null) {
    const media = run?.media;
    if (!media || mic || state.phase !== 'listening') return false;
    const attempt: MicAttempt = {
      held,
      ended: () => {
        if (mic !== attempt) return;
        stopMic();
        update({ error: 'Mic đã ngắt. Hãy kiểm tra thiết bị và thử lại.' });
      },
    };
    mic = attempt;
    if (held) attempt.timer = setTimeout(() => { if (mic === attempt) stopMic(); }, HOLD_MS);
    update({ mic: 'starting', error: null });
    void (async () => {
      try {
        const stream = await capture();
        if (mic !== attempt) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        const [track] = stream.getAudioTracks();
        for (const other of stream.getTracks()) if (other !== track) other.stop();
        if (!track || track.readyState !== 'live') throw new Error('Microphone unavailable');
        track.enabled = false;
        attempt.track = track;
        track.addEventListener('ended', attempt.ended, { once: true });
        await media.publish(track);
        if (mic === attempt) update({ mic: 'on' });
      } catch {
        if (mic !== attempt) return;
        stopMic();
        update({ error: 'Không dùng được mic. Hãy kiểm tra quyền truy cập và thử lại.' });
      }
    })();
    return true;
  }
  return {
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    snapshot: () => state,
    attach(socket: Connection, id: string, available: boolean) {
      if (available && membership?.socket === socket && membership.id === id) return;
      membership = available ? { socket, id } : null;
      if (intent?.id !== id) intent = null;
      clearLeave();
      closeRun();
      update({ available, error: null });
      if (available && intent?.join !== false) join();
    },
    detach(socket: Connection, mayResume: boolean) {
      if (membership && membership.socket !== socket) return;
      if (!mayResume) intent = null;
      membership = null;
      clearLeave();
      closeRun();
      if (!mayResume) update({ available: false, error: null });
    },
    receive(socket: Connection, message: VoiceMessage) {
      if (membership?.socket !== socket || typeof message.nonce !== 'number' ||
          !Number.isInteger(message.nonce) || message.nonce < 0 || message.nonce > 0xffffffff) return;
      if (message.type === 'voice_leave_result') {
        if (left?.socket !== socket || left.nonce !== message.nonce) return;
        clearLeave();
        if (run || state.error) return;
        if (message.v !== PROTOCOL_VERSION || message.error !== null && !isVoiceError(message.error)) {
          update({ error: malformedResponse });
        } else if (message.error !== null) update({ error: errors[message.error] });
        return;
      }
      const attempt = run;
      if (!attempt || state.phase !== 'joining' || attempt.nonce !== message.nonce) return;
      const result = message.result;
      if (message.v !== PROTOCOL_VERSION || !isVoiceResult(result)) {
        fail(attempt, malformedResponse);
        return;
      }
      clearTimeout(attempt.timer);
      attempt.nonce = undefined;
      if (result.status === 'error') {
        fail(attempt, errors[result.code], false);
      } else {
        attempt.timer = setTimeout(() => fail(attempt, errors.voice_unavailable), CONNECT_MS);
        void connect(attempt, result);
      }
    },
    join,
    leave() {
      const attempt = run;
      const id = membership?.id ?? intent?.id;
      intent = id === undefined ? null : { id, join: false };
      closeRun();
      update({ error: null });
      if (attempt) signalLeave(attempt.membership.socket);
    },
    stopMic,
    toggleMic() {
      if (state.mode !== 'toggle') return;
      if (mic) stopMic(); else startMic(null);
    },
    startHold(owner: symbol, input: string) {
      return state.mode === 'hold' && startMic({ owner, input });
    },
    endHold(owner: symbol, input?: string) {
      if (mic?.held?.owner !== owner || input !== undefined && mic.held.input !== input) return false;
      stopMic();
      return true;
    },
    setMode(mode: VoiceState['mode']) { stopMic(); update({ mode, error: null }); },
    setShortcut(shortcut: boolean) { stopMic(); update({ shortcut }); },
    startAudio() {
      const attempt = run;
      void attempt?.media?.startAudio().then(
        () => { if (run === attempt) update({ playbackBlocked: false }); },
        () => { if (run === attempt) update({ playbackBlocked: true }); },
      );
    },
  };
}
export type Voice = ReturnType<typeof createVoice>;
