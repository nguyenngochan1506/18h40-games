export const SOUND_COMMIT = 'b95d4b84f8182efd852629c1518e1de3c500b164';
export const bangSoundIds = ['gamestart', 'victory', 'draw', 'death', 'bang', 'gatling', 'indians', 'duel', 'dynamite', 'generalstore', 'shuffle', 'invalid'] as const;
export const userSoundIds = ['shot', 'gatling', 'missed', 'explosion', 'card', 'shuffle', 'clink', 'reload', 'neigh', 'tap'] as const;
export type SynthKind = 'hit' | 'jail' | 'click' | 'ding';
export type SoundConfig = { files: string[]; synth: SynthKind; gain: number; offset: number; duration: number; fadeOut: number; cooldown: number; rate: number };
const cue = (files: string[], synth: SynthKind, duration: number, gain = .7, cooldown = 100): SoundConfig => ({ files, synth, gain, offset: 0, duration, fadeOut: Math.min(.18, duration / 3), cooldown, rate: .03 });
const own = (id: string, fallback?: string) => [`/sfx/${id}.mp3`, ...(fallback ? [`/bang/sounds/${fallback}.mp3`] : [])];
const bang = (id: string) => [`/bang/sounds/${id}.mp3`];
export const soundCues = {
  shot: cue(own('shot', 'bang'), 'hit', .9, .8, 130),
  gatling: cue(own('gatling', 'gatling'), 'hit', 2.2, .65, 900),
  missed: cue(own('missed'), 'ding', .8), explosion: cue(own('explosion', 'dynamite'), 'hit', 1.7, .7, 500),
  card: cue(own('card'), 'click', .8, .55, 100), draw: cue(own('card'), 'click', .7, .6, 110),
  shuffle: cue(own('shuffle', 'shuffle'), 'click', 1.8, .6, 1000),
  clink: cue(own('clink'), 'ding', 1, .65, 150), reload: cue(own('reload'), 'click', 1),
  neigh: cue(own('neigh'), 'ding', 1.6, .6, 400), tap: cue(own('tap'), 'click', .7, .55, 160),
  hit: cue([], 'hit', .2, .75), jail: cue([], 'jail', .8, .65, 400),
  gamestart: { ...cue(bang('gamestart'), 'ding', 2.2, .5, 2000), offset: 2 }, victory: cue(bang('victory'), 'ding', 3.9, .6, 2000),
  death: cue(bang('death'), 'hit', 1.7, .5, 600), duel: cue(bang('duel'), 'ding', 1.6, .55, 600),
  indians: cue(bang('indians'), 'ding', 1.6, .55, 600), generalstore: cue(bang('generalstore'), 'ding', 1.2, .55, 500),
  invalid: cue(bang('invalid'), 'hit', .4, .5, 400), dynamite: cue(bang('dynamite'), 'click', 1, .55, 400),
} satisfies Record<string, SoundConfig>;
export type SoundKind = keyof typeof soundCues;
declare const __SOUND_FILES__: string[];
export const availableSoundFiles: readonly string[] = typeof __SOUND_FILES__ === 'undefined' ? [] : __SOUND_FILES__;
export type SoundSettings = { enabled: boolean; volume: number };
export const SOUND_SETTINGS_KEY = 'bang-sound';
export const defaultSoundSettings: SoundSettings = { enabled: true, volume: .6 };
export function loadSoundSettings(storage: Pick<Storage, 'getItem'>): SoundSettings {
  try {
    const v = JSON.parse(storage.getItem(SOUND_SETTINGS_KEY) ?? 'null');
    if (v && typeof v.enabled === 'boolean' && typeof v.volume === 'number' && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1) return { enabled: v.enabled, volume: v.volume };
  } catch { /* Storage can be unavailable in private browsing. */ }
  return { ...defaultSoundSettings };
}
export function saveSoundSettings(storage: Pick<Storage, 'setItem'>, settings: SoundSettings) {
  try { storage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Keep session settings when storage is unavailable. */ }
}
export const SOUND_POLYPHONY = 8;
export const SOUND_BATCH_LIMIT = 8;
export class SoundLimiter {
  private active: number[] = [];
  private last = new Map<SoundKind, number>();
  admit(kind: SoundKind, now: number, duration: number) {
    this.active = this.active.filter(end => end > now);
    if (this.active.length >= SOUND_POLYPHONY || now - (this.last.get(kind) ?? -Infinity) < soundCues[kind].cooldown) return false;
    this.last.set(kind, now); this.active.push(now + duration); return true;
  }
  clear() { this.active = []; }
}
