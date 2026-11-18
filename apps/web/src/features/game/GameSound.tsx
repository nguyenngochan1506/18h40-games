import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { FxBatch, FxContext } from './fx';
import { sound } from './sound';
import { eventsToSounds, shouldPlaySound } from './soundEvents';

export function SoundControls() {
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings);
  return <fieldset className="sound-controls"><legend>Âm thanh</legend>
    <button type="button" className="action secondary" aria-pressed={settings.enabled} onClick={() => sound.setSettings({ ...settings, enabled: !settings.enabled })}>{settings.enabled ? 'Tắt âm thanh' : 'Bật âm thanh'}</button>
    <label htmlFor="sound-volume">Âm lượng · {Math.round(settings.volume * 100)}%</label>
    <input id="sound-volume" type="range" min="0" max="1" step="0.05" value={settings.volume} aria-valuetext={`${Math.round(settings.volume * 100)} phần trăm`} onChange={event => { sound.setSettings({ ...settings, volume: Number(event.target.value) }); void sound.play('tap'); }} />
  </fieldset>;
}

export default function GameSound({ batch, ctx, enabled }: { batch: FxBatch | null; ctx: FxContext; enabled: boolean }) {
  const seen = useRef<number | null>(null), lastTime = useRef(-Infinity);
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings);
  const muted = !settings.enabled || settings.volume === 0;
  useEffect(() => {
    const state = { enabled, hidden: document.hidden, muted };
    const play = shouldPlaySound(batch, seen.current, state); seen.current = batch?.id ?? null;
    sound.stop();
    if (!play || !batch) return;
    const now = performance.now(), jobs = eventsToSounds(batch.events, { ...ctx, waiting: batch.waiting }, now - lastTime.current < 400);
    lastTime.current = now;
    const timers = jobs.map(job => window.setTimeout(() => { if (!document.hidden) void sound.play(job.kind); }, job.start));
    const clear = () => { timers.forEach(clearTimeout); sound.stop(); };
    const hidden = () => { if (document.hidden) clear(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); clear(); };
  }, [batch, enabled, muted]);
  return null;
}
