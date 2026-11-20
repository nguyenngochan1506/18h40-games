import { availableSoundFiles, defaultSoundSettings, loadSoundSettings, saveSoundSettings, SoundLimiter, soundCues } from './soundCatalog.ts';
import type { SoundKind, SoundSettings } from './soundCatalog.ts';
import { synthesize } from './soundSynth.ts';

export function createSoundPlayer() {
  let context: AudioContext | null = null, master: GainNode | null = null;
  let settings = { ...defaultSoundSettings }, generation = 0;
  const cache = new Map<string, Promise<AudioBuffer | null>>(), active = new Set<AudioScheduledSourceNode>(), limiter = new SoundLimiter();
  const listeners = new Set<() => void>();
  const disconnects = new Map<number, GainNode>();
  const stop = () => { for (const [timer, gain] of disconnects) { clearTimeout(timer); gain.disconnect(); } disconnects.clear(); generation++; for (const node of active) { try { node.stop(); } catch { /* An already ended source needs no stop. */ } } active.clear(); limiter.clear(); };
  const ready = () => !!context && context.state === 'running' && settings.enabled && settings.volume > 0 && !document.hidden;
  const unlock = async () => {
    try {
      if (!context) { context = new AudioContext(); master = context.createGain(); master.gain.value = settings.enabled ? settings.volume : 0; master.connect(context.destination); }
      if (context.state === 'suspended') await context.resume();
    } catch { /* Autoplay and device failures must never block the game. */ }
  };
  const load = (url: string) => {
    if (!cache.has(url)) cache.set(url, (async () => {
      try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (!response.ok) return null; return await context!.decodeAudioData(await response.arrayBuffer()); } catch { return null; }
    })());
    return cache.get(url)!;
  };
  const play = async (kind: SoundKind) => {
    if (!ready()) return;
    const epoch = generation, started = performance.now(), config = soundCues[kind];
    try {
      let buffer: AudioBuffer | null = null;
      for (const url of config.files.filter(url => availableSoundFiles.includes(url))) { buffer = await load(url); if (buffer) break; }
      // Decode once for the next event, but never catch up with an obsolete or late sound.
      if (epoch !== generation || !ready() || performance.now() - started > 250) return;
      const duration = buffer ? Math.min(config.duration, buffer.duration - config.offset) : Math.min(config.duration, config.synth === 'jail' ? .8 : config.synth === 'hit' ? .2 : .12);
      if (duration <= 0 || !limiter.admit(kind, performance.now(), duration * 1000)) return;
      const gain = context!.createGain(), now = context!.currentTime;
      gain.gain.setValueAtTime(config.gain, now); gain.gain.setValueAtTime(config.gain, now + Math.max(0, duration - config.fadeOut));
      gain.gain.linearRampToValueAtTime(0, now + duration); gain.connect(master!);
      let sources: AudioScheduledSourceNode[];
      if (buffer) {
        const source = context!.createBufferSource(); source.buffer = buffer; source.playbackRate.value = 1 + (Math.random() * 2 - 1) * config.rate;
        source.connect(gain); source.start(now, config.offset, duration); source.stop(now + duration); sources = [source];
      } else sources = synthesize(context!, gain, config.synth, duration);
      for (const node of sources) { active.add(node); node.addEventListener('ended', () => { active.delete(node); node.disconnect(); }, { once: true }); }
      const timer = window.setTimeout(() => { gain.disconnect(); disconnects.delete(timer); }, duration * 1000 + 100);
      disconnects.set(timer, gain);
    } catch { /* Missing/invalid media and unavailable output are non-fatal. */ }
  };
  const setSettings = (next: SoundSettings) => {
    settings = { enabled: !!next.enabled, volume: Number.isFinite(next.volume) ? Math.max(0, Math.min(1, next.volume)) : settings.volume };
    if (master) master.gain.value = settings.enabled ? settings.volume : 0;
    if (!settings.enabled || settings.volume === 0) stop();
    try { saveSoundSettings(window.localStorage, settings); } catch { /* Accessing localStorage itself may throw. */ }
    listeners.forEach(fn => fn());
  };
  return {
    dispose() { stop(); const previous = context; context = null; master = null; cache.clear(); void previous?.close().catch(() => undefined); },
    play, stop, unlock, setSettings, getSettings: () => settings,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    listen() {
      try { settings = loadSoundSettings(window.localStorage); } catch { settings = { ...defaultSoundSettings }; }
      const gesture = () => { void unlock(); }, hidden = () => { if (document.hidden) stop(); };
      for (const event of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(event, gesture, { passive: true });
      document.addEventListener('visibilitychange', hidden);
      return () => { for (const event of ['pointerdown', 'keydown', 'touchend']) document.removeEventListener(event, gesture); document.removeEventListener('visibilitychange', hidden); stop(); };
    },
  };
}
export const sound = createSoundPlayer();
