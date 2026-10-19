import { midiHz } from './mix';

export class Kit {
  readonly noise: AudioBuffer;
  readonly brown: AudioBuffer;
  voices = 0;
  peakVoices = 0;
  readonly wow: GainNode;

  constructor(readonly ctx: BaseAudioContext) {
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.noise.getChannelData(0);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.45;
    this.wow = ctx.createGain();
    this.wow.gain.value = 9;
    lfo.connect(this.wow);
    lfo.start();
  }

  wobble(o: OscillatorNode): void {
    this.wow.connect(o.detune);
    o.addEventListener('ended', () => this.wow.disconnect(o.detune));
  }

  track(src: AudioScheduledSourceNode): void {
    this.voices++;
    this.peakVoices = Math.max(this.peakVoices, this.voices);
    src.onended = () => this.voices--;
  }

  osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  gain(v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  noiseSource(brown = false, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = loop;
    return s;
  }
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): number {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay / 4);
  return t + attack + decay;
}

function run(kit: Kit, srcs: AudioScheduledSourceNode[], t: number, end: number): void {
  for (const s of srcs) {
    s.start(t);
    s.stop(end);
  }
  kit.track(srcs[srcs.length - 1]);
}

function noiseAt(kit: Kit, t: number, dur: number, brown = false): AudioBufferSourceNode {
  const s = kit.noiseSource(brown);
  s.start(t, Math.random() * 1.5, Math.min(dur, 2));
  return s;
}

export function keys(kit: Kit, out: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const f = midiHz(midi);
  const a = kit.osc('sine', f);
  const b = kit.osc('triangle', f * 2);
  const bg = kit.gain(0.18);
  const g = kit.gain();
  kit.wobble(a);
  kit.wobble(b);
  a.connect(g);
  b.connect(bg).connect(g);
  g.connect(out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.012);
  g.gain.setTargetAtTime(vel * 0.07, t + 0.012, 0.25);
  g.gain.setTargetAtTime(0, t + dur, 0.18);
  run(kit, [a, b], t, t + dur + 1);
}

export function bass(kit: Kit, out: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const o = kit.osc('triangle', midiHz(midi));
  const lp = kit.filter('lowpass', 420);
  const g = kit.gain();
  o.connect(lp).connect(g).connect(out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.42, t + 0.015);
  g.gain.setTargetAtTime(vel * 0.25, t + 0.02, 0.2);
  g.gain.setTargetAtTime(0, t + dur, 0.08);
  run(kit, [o], t, t + dur + 0.5);
}

export function lead(kit: Kit, out: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const o = kit.osc('sine', midiHz(midi));
  const vib = kit.osc('sine', 5.2);
  const vg = kit.gain(6);
  vib.connect(vg).connect(o.detune);
  kit.wobble(o);
  const g = kit.gain();
  o.connect(g).connect(out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.09, t + 0.04);
  g.gain.setTargetAtTime(0, t + dur, 0.15);
  run(kit, [vib, o], t, t + dur + 0.8);
}

export function kick(kit: Kit, out: AudioNode, t: number, vel: number): void {
  const o = kit.osc('sine', 120);
  const g = kit.gain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  o.connect(g).connect(out);
  env(g, t, vel * 0.55, 0.004, 0.35);
  run(kit, [o], t, t + 0.45);
}

export function snare(kit: Kit, out: AudioNode, t: number, vel: number, soft: boolean): void {
  const n = noiseAt(kit, t, 0.3);
  const bp = kit.filter('bandpass', soft ? 2400 : 1800, soft ? 1.4 : 0.9);
  const g = kit.gain();
  n.connect(bp).connect(g).connect(out);
  env(g, t, vel * (soft ? 0.12 : 0.22), 0.003, soft ? 0.12 : 0.2);
  const body = kit.osc('triangle', soft ? 330 : 190);
  const bg = kit.gain();
  body.connect(bg).connect(out);
  env(bg, t, vel * 0.1, 0.002, 0.08);
  body.start(t);
  body.stop(t + 0.15);
  kit.track(n);
}

export function hat(kit: Kit, out: AudioNode, t: number, vel: number): void {
  const n = noiseAt(kit, t, 0.08);
  const hp = kit.filter('highpass', 7200);
  const g = kit.gain();
  n.connect(hp).connect(g).connect(out);
  env(g, t, vel * 0.1, 0.002, 0.05);
  kit.track(n);
}

const BELL_PARTIALS: [number, number, number][] = [
  [0.5, 0.5, 1.4],
  [1, 1, 1],
  [1.2, 0.45, 0.6],
  [1.5, 0.3, 0.45],
  [2, 0.35, 0.35],
  [2.74, 0.18, 0.2],
];

export function bell(kit: Kit, out: AudioNode, t: number, midi: number, vel: number, decay: number): void {
  const f = midiHz(midi);
  const g = kit.gain(vel * 0.22);
  g.connect(out);
  const srcs: OscillatorNode[] = [];
  for (const [ratio, amp, life] of BELL_PARTIALS) {
    const o = kit.osc('sine', f * ratio * (1 + (Math.random() - 0.5) * 0.002));
    const pg = kit.gain();
    o.connect(pg).connect(g);
    env(pg, t, amp, 0.004, decay * life);
    srcs.push(o);
  }
  run(kit, srcs, t, t + decay * 1.4 + 0.2);
}

export function cableBell(kit: Kit, out: AudioNode, t: number, vel: number): void {
  const f = 1046 * (1 + (Math.random() - 0.5) * 0.04);
  const g = kit.gain(vel * 0.3);
  g.connect(out);
  const srcs: OscillatorNode[] = [];
  for (const [ratio, amp, life] of [
    [1, 1, 0.9],
    [2.76, 0.5, 0.4],
    [5.4, 0.25, 0.18],
  ]) {
    const o = kit.osc('sine', f * ratio);
    const pg = kit.gain();
    o.connect(pg).connect(g);
    env(pg, t, amp, 0.002, life);
    srcs.push(o);
  }
  run(kit, srcs, t, t + 1.1);
}

export function horn(kit: Kit, out: AudioNode, t: number, freq: number, dur: number, vel = 1): void {
  const a = kit.osc('sawtooth', freq);
  const b = kit.osc('square', freq * 1.004);
  const lp = kit.filter('lowpass', 700, 1.2);
  const g = kit.gain();
  a.connect(lp);
  b.connect(lp);
  lp.connect(g).connect(out);
  const end = t + dur;
  for (const o of [a, b]) {
    o.frequency.setValueAtTime(o.frequency.value, end - 0.3);
    o.frequency.linearRampToValueAtTime(o.frequency.value * 0.78, end + 0.25);
  }
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(900, t + 0.25);
  lp.frequency.setValueAtTime(900, end - 0.2);
  lp.frequency.linearRampToValueAtTime(350, end + 0.3);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.18);
  g.gain.setValueAtTime(vel * 0.5, end);
  g.gain.linearRampToValueAtTime(0, end + 0.35);
  run(kit, [a, b], t, end + 0.4);
}

export function gull(kit: Kit, out: AudioNode, t: number, pitch: number, calls: number): void {
  const o = kit.osc('sawtooth', 1600);
  const bp = kit.filter('bandpass', 2300 * pitch, 2.5);
  const g = kit.gain();
  o.connect(bp).connect(g).connect(out);
  let s = t;
  for (let i = 0; i < calls; i++) {
    const len = 0.22 + Math.random() * 0.1;
    const top = (1700 + Math.random() * 300) * pitch;
    o.frequency.setValueAtTime(top * 0.75, s);
    o.frequency.linearRampToValueAtTime(top, s + len * 0.3);
    o.frequency.linearRampToValueAtTime(top * 0.62, s + len);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.12, s + 0.03);
    g.gain.linearRampToValueAtTime(0, s + len);
    s += len + 0.06 + Math.random() * 0.12;
  }
  run(kit, [o], t, s + 0.1);
}

export function bark(kit: Kit, out: AudioNode, t: number, pitch: number, barks: number): void {
  const o = kit.osc('sawtooth', 240 * pitch);
  const n = kit.noiseSource(false, true);
  const ng = kit.gain(0.6);
  const bp = kit.filter('bandpass', 650 * pitch, 1.3);
  const g = kit.gain();
  o.connect(bp);
  n.connect(ng).connect(bp);
  bp.connect(g).connect(out);
  let s = t;
  for (let i = 0; i < barks; i++) {
    const len = 0.16 + Math.random() * 0.1;
    o.frequency.setValueAtTime(260 * pitch, s);
    o.frequency.linearRampToValueAtTime(170 * pitch, s + len);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.35, s + 0.02);
    g.gain.setTargetAtTime(0, s + len * 0.5, 0.05);
    s += len + 0.12 + Math.random() * 0.25;
  }
  run(kit, [n, o], t, s + 0.2);
}

export function wave(kit: Kit, out: AudioNode, t: number, size: number): void {
  const n = kit.noiseSource(false, true);
  const lp = kit.filter('lowpass', 300, 0.5);
  const g = kit.gain();
  n.connect(lp).connect(g).connect(out);
  const rise = 1.4 + size;
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(1800 + 900 * size, t + rise);
  lp.frequency.setTargetAtTime(450, t + rise, 1.2);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3 + 0.3 * size, t + rise);
  g.gain.setTargetAtTime(0, t + rise, 1.3);
  run(kit, [n], t, t + rise + 6);
}

export function tone(kit: Kit, out: AudioNode, t: number, freq: number, dur: number, vel: number, type: OscillatorType = 'sine', glide = 1): void {
  const o = kit.osc(type, freq);
  if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  const g = kit.gain();
  o.connect(g).connect(out);
  env(g, t, vel, 0.006, dur);
  run(kit, [o], t, t + dur + 0.05);
}

export function burst(kit: Kit, out: AudioNode, t: number, type: BiquadFilterType, from: number, to: number, dur: number, vel: number): void {
  const n = noiseAt(kit, t, dur + 0.1);
  const f = kit.filter(type, from, 0.9);
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = kit.gain();
  n.connect(f).connect(g).connect(out);
  env(g, t, vel, 0.004, dur);
  kit.track(n);
}
