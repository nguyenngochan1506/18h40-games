import type { SynthKind } from './soundCatalog';

// Short envelopes avoid clicks; inharmonic partials approximate a steel door.
export function synthesize(ctx: AudioContext, output: AudioNode, kind: SynthKind, duration: number) {
  const nodes: AudioScheduledSourceNode[] = [];
  const envelope = (level: number) => {
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + .006);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
    gain.connect(output); return gain;
  };
  const tone = (frequency: number, end: number, level: number, type: OscillatorType = 'sine') => {
    const oscillator = ctx.createOscillator(), gain = envelope(level);
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + duration);
    oscillator.connect(gain); oscillator.start(); oscillator.stop(ctx.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); }; nodes.push(oscillator);
  };
  if (kind === 'jail') for (const [frequency, level] of [[173, .3], [431, .15], [719, .1], [1123, .05]]) tone(frequency, frequency * .94, level, 'triangle');
  else if (kind === 'ding') tone(720, 480, .25);
  else tone(kind === 'hit' ? 125 : 260, 45, .5);
  if (kind === 'hit' || kind === 'jail' || kind === 'click') {
    const noiseDuration = Math.min(duration, kind === 'click' ? .04 : .18);
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDuration), ctx.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = envelope(.3);
    noise.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = kind === 'jail' ? 2200 : 500;
    noise.connect(filter); filter.connect(gain); noise.start(); noise.stop(ctx.currentTime + noiseDuration);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); }; nodes.push(noise);
  }
  return nodes;
}
