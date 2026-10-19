import type { Game } from '../game';
import { FLIGHT } from '../player/flight';
import { Ambience, type Conditions } from './ambience';
import { AudioEngine, type Graph } from './engine';
import { altitudeMix, droneSound, readMix } from './mix';
import { MOODS, MusicPlayer, type MoodId } from './music';
import { crossedHour, graceHour, sfClock, westminsterHour } from './schedule';
import { bell, burst, cableBell, tone, type Kit } from './synth';

export type SfxName =
  | 'ring'
  | 'sparkle'
  | 'fanfare'
  | 'complete'
  | 'fail'
  | 'start'
  | 'crash'
  | 'splash'
  | 'open'
  | 'close'
  | 'info'
  | 'reward'
  | 'warn'
  | 'shutter'
  | 'battery'
  | 'nearby';

declare module '../core/bus' {
  interface GameEvents {
    sfx: { name: SfxName; amount?: number };
  }
}

interface Layers {
  motor: OscillatorNode[];
  motorTone: BiquadFilterNode;
  motorAmp: GainNode;
  chop: OscillatorNode;
  whine: OscillatorNode;
  whineAmp: GainNode;
  windTone: BiquadFilterNode;
  windAmp: GainNode;
  hum: GainNode;
  high: GainNode;
  water: GainNode;
  vinyl: GainNode;
}

const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;

export class GameAudio {
  readonly engine: AudioEngine;
  ambience: Ambience | null = null;
  music: MusicPlayer | null = null;
  readonly counts: Record<string, number> = {};
  private layers: Layers | null = null;
  private lastClock = 0;
  private lastSfx = -1;
  private pendingToast: SfxName | null = null;
  private ambienceTimer = 0;
  private prevVel = { x: 0, y: 0, z: 0 };
  private accel = 0;
  private progress = { id: '', value: 0 };
  private nearbyId: string | null = null;
  private battery = 1;
  private iconDirty = true;

  constructor(private game: Game) {
    this.engine = new AudioEngine(game.save);
    this.lastClock = game.date().getTime();
    const unlock = () => this.unlock();
    for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      this.toggleMute();
    });
    document.addEventListener('visibilitychange', () => this.engine.setHidden(document.hidden));
    game.save.onChange(() => (this.iconDirty = true));
    this.listen();
  }

  get graph(): Graph | null {
    return this.engine.graph;
  }

  unlock(): void {
    const had = !!this.engine.graph;
    const g = this.engine.unlock();
    if (!g || had) return;
    this.layers = buildLayers(g);
    this.ambience = new Ambience(g.kit, g.buses.ambience);
    this.music = new MusicPlayer(g.kit, g.musicTone);
  }

  toggleMute(): void {
    const muted = !this.engine.muted;
    this.engine.setMuted(muted);
    this.game.toast(muted ? 'Sound off. Press N to turn it back on.' : 'Sound on', 'info');
  }

  conditions(): Conditions {
    const sky = this.game.sky;
    return { fog: sky?.fogDensity ?? 1, night: sky?.night ?? 0, hour: sfClock(this.game.date()).hour };
  }

  mood(): MoodId {
    return (this.game.sky?.night ?? 0) > 0.5 ? 'night' : 'day';
  }

  stats(): { state: string; ambience: number; voices: number; peakVoices: number; notes: number } {
    const kit = this.graph?.kit;
    return {
      state: this.graph?.ctx.state ?? 'none',
      ambience: this.ambience?.nodes ?? 0,
      voices: kit?.voices ?? 0,
      peakVoices: kit?.peakVoices ?? 0,
      notes: this.music?.notes ?? 0,
    };
  }

  update(dt: number): void {
    if (this.iconDirty) this.syncIcon();
    const g = this.graph;
    const nowMs = this.game.date().getTime();
    const crossed = crossedHour(this.lastClock, nowMs);
    this.lastClock = nowMs;
    if (!g || !this.layers || g.ctx.state !== 'running') return;
    const game = this.game;
    const now = g.ctx.currentTime;
    const f = game.flight;
    const cam = game.camera;
    cam.updateMatrixWorld();
    const m = cam.matrixWorld.elements;
    setListener(g.ctx.listener, m[12], m[13], m[14], -m[8], -m[9], -m[10], m[4], m[5], m[6]);

    const dv = Math.hypot(f.vel.x - this.prevVel.x, f.vel.y - this.prevVel.y, f.vel.z - this.prevVel.z) / Math.max(dt, 1e-3);
    this.accel += (dv - this.accel) * Math.min(1, dt * 6);
    this.prevVel = { ...f.vel };
    const boost = Math.hypot(f.vel.x, f.vel.z) > FLIGHT.cruise + 3;
    applyDrone(this.layers, droneSound(f.speed, f.vel.y, this.accel, boost), now);

    const world = game.world;
    const agl = f.pos.y - world.groundAt(f.pos.x, f.pos.z);
    const alt = altitudeMix(agl, world.isWater(f.pos.x, f.pos.z));
    const night = game.sky?.night ?? 0;
    this.layers.hum.gain.setTargetAtTime(alt.hum * (0.45 - 0.2 * night), now, 0.4);
    this.layers.high.gain.setTargetAtTime(alt.high * 0.32, now, 0.6);
    this.layers.water.gain.setTargetAtTime(alt.water * 0.3, now, 0.4);

    this.ambienceTimer -= dt;
    if (this.ambience && this.ambienceTimer <= 0) {
      this.ambienceTimer = 0.2;
      this.ambience.update({ x: m[12], y: m[13], z: m[14] }, this.conditions(), (x, z) => world.groundAt(x, z));
    }
    if (crossed !== null && this.ambience) {
      const hour = sfClock(new Date(crossed)).hour;
      if (night < 0.5 && this.ambience.ring('ferry-building-clock', westminsterHour(hour))) this.count('ferry-chime');
      const grace = graceHour(hour);
      if (grace.length && this.ambience.ring('grace-cathedral-bells', grace)) this.count(grace.length > 30 ? 'grace-angelus' : 'grace-hour');
    }

    const active = game.activities.active;
    const mood = this.mood();
    const energy = active ? 1 : 0;
    if (this.music && readMix(game.save.data.settings).volMusic > 0) this.music.update(now, mood, energy);
    g.musicTone.frequency.setTargetAtTime(MOODS[mood].cutoff * (energy ? 1.8 : 1), now, 1.5);
    this.layers.vinyl.gain.setTargetAtTime(MOODS[mood].crackle, now, 2);

    if (active) {
      const p = active.inst.progress();
      if (this.progress.id !== active.def.id) this.progress = { id: active.def.id, value: p };
      else {
        if (p - this.progress.value >= 0.02 && p < 1) this.play('ring', p);
        this.progress.value = p;
      }
    } else this.progress.id = '';
    const near = game.activities.nearby?.id ?? null;
    if (near && near !== this.nearbyId) this.play('nearby');
    this.nearbyId = near;
    if ((this.battery > 0.2 && f.battery <= 0.2) || (this.battery > 0.1 && f.battery <= 0.1)) this.play('battery');
    this.battery = f.battery;
    if (this.pendingToast && now - this.lastSfx > 0.3) this.play(this.pendingToast);
    this.pendingToast = null;
  }

  play(name: SfxName, amount = 0): void {
    const g = this.graph;
    if (!g || g.ctx.state !== 'running') return;
    this.pendingToast = null;
    const t = g.ctx.currentTime + 0.01;
    this.lastSfx = t;
    this.count(name);
    sfx(g.kit, g.buses.sfx, t, name, amount);
    if (name === 'fanfare') this.engine.duck(0.3, 2.2);
    else if (name === 'complete' || name === 'sparkle' || name === 'fail') this.engine.duck(0.5, 1.2);
  }

  private count(name: string): void {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
  }

  private listen(): void {
    const bus = this.game.bus;
    bus.on('activity:start', () => this.play('start'));
    bus.on('activity:complete', ({ id }) => {
      const def = this.game.activities.defs.get(id);
      this.play(def && this.game.activities.kinds.get(def.kind)?.passive ? 'sparkle' : 'complete');
    });
    bus.on('activity:fail', () => this.play('fail'));
    bus.on('card:unlock', () => this.play('fanfare'));
    bus.on('player:crash', ({ speed }) => this.play('crash', speed));
    bus.on('player:splash', () => this.play('splash'));
    bus.on('panel:open', () => this.play('open'));
    bus.on('panel:close', () => this.play('close'));
    bus.on('photo', () => this.play('shutter'));
    bus.on('sfx', ({ name, amount }) => this.play(name, amount));
    bus.on('toast', ({ kind }) => {
      if (this.graph && this.graph.ctx.currentTime - this.lastSfx > 0.3) this.pendingToast = kind ?? 'info';
    });
  }

  private syncIcon(): void {
    const btn = this.game.panels?.bar.querySelector('[data-panel="sound"]');
    if (!btn) return;
    const muted = this.engine.muted;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', muted ? 'Sound (muted)' : 'Sound');
    this.iconDirty = false;
  }
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function setListener(l: AudioListener, x: number, y: number, z: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
  if (l.positionX) {
    l.positionX.value = x;
    l.positionY.value = y;
    l.positionZ.value = z;
    l.forwardX.value = fx;
    l.forwardY.value = fy;
    l.forwardZ.value = fz;
    l.upX.value = ux;
    l.upY.value = uy;
    l.upZ.value = uz;
  } else {
    l.setPosition(x, y, z);
    l.setOrientation(fx, fy, fz, ux, uy, uz);
  }
}

function buildLayers(g: Graph): Layers {
  const { kit, buses } = g;
  const ctx = kit.ctx;
  const motorTone = kit.filter('lowpass', 800, 1.6);
  const motorAmp = kit.gain(0);
  const chopAmp = kit.gain(0.8);
  motorTone.connect(motorAmp).connect(chopAmp).connect(buses.sfx);
  const motor = [kit.osc('sawtooth', 100), kit.osc('sawtooth', 100), kit.osc('square', 50)];
  motor[1].detune.value = 9;
  const sub = kit.gain(0.35);
  motor[0].connect(motorTone);
  motor[1].connect(motorTone);
  motor[2].connect(sub).connect(motorTone);
  const chop = kit.osc('sine', 33);
  const chopDepth = kit.gain(0.2);
  chop.connect(chopDepth).connect(chopAmp.gain);

  const whine = kit.osc('triangle', 1600);
  const whineAmp = kit.gain(0);
  whine.connect(kit.filter('bandpass', 2000, 3)).connect(whineAmp).connect(buses.sfx);

  const loop = (brown: boolean, out: AudioNode) => {
    const s = kit.noiseSource(brown, true);
    s.connect(out);
    s.start(0, Math.random() * 1.5);
  };
  const windTone = kit.filter('bandpass', 500, 0.6);
  const windAmp = kit.gain(0);
  loop(false, windTone);
  windTone.connect(windAmp).connect(buses.sfx);

  const bed = (brown: boolean, type: BiquadFilterType, freq: number, lfoHz: number, depth: number) => {
    const amp = kit.gain(0);
    const swell = kit.gain(1);
    const f = kit.filter(type, freq, 0.5);
    loop(brown, f);
    f.connect(swell).connect(amp).connect(buses.ambience);
    if (lfoHz) {
      const lfo = kit.osc('sine', lfoHz);
      const d = kit.gain(depth);
      lfo.connect(d).connect(swell.gain);
      lfo.start();
    }
    return amp;
  };
  const hum = bed(true, 'lowpass', 240, 0, 0);
  const high = bed(false, 'bandpass', 1800, 0.13, 0.45);
  const water = bed(true, 'lowpass', 520, 0.35, 0.6);

  const vinyl = kit.gain(0);
  const crackle = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = crackle.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.04 + (Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 0.9 : 0);
  const vs = ctx.createBufferSource();
  vs.buffer = crackle;
  vs.loop = true;
  vs.connect(kit.filter('highpass', 900)).connect(vinyl).connect(g.duck);
  vs.start();

  for (const o of [...motor, chop, whine]) o.start();
  return { motor, motorTone, motorAmp, chop, whine, whineAmp, windTone, windAmp, hum, high, water, vinyl };
}

function applyDrone(l: Layers, s: ReturnType<typeof droneSound>, now: number): void {
  const k = 0.06;
  l.motor[0].frequency.setTargetAtTime(s.freq, now, k);
  l.motor[1].frequency.setTargetAtTime(s.freq, now, k);
  l.motor[2].frequency.setTargetAtTime(s.freq / 2, now, k);
  l.motorTone.frequency.setTargetAtTime(s.cutoff, now, k);
  l.motorAmp.gain.setTargetAtTime(s.gain, now, k);
  l.chop.frequency.setTargetAtTime(s.chop, now, k);
  l.whine.frequency.setTargetAtTime(s.whineFreq, now, 0.2);
  l.whineAmp.gain.setTargetAtTime(s.whine, now, 0.15);
  l.windTone.frequency.setTargetAtTime(s.windFreq, now, 0.3);
  l.windAmp.gain.setTargetAtTime(s.wind, now, 0.3);
}

const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];

function sfx(kit: Kit, out: AudioNode, t: number, name: SfxName, amount: number): void {
  const note = (m: number) => 440 * 2 ** ((m - 69) / 12);
  switch (name) {
    case 'ring': {
      const step = Math.round(amount * 6);
      tone(kit, out, t, note(79 + step), 0.5, 0.18);
      tone(kit, out, t + 0.06, note(86 + step), 0.6, 0.12);
      break;
    }
    case 'sparkle':
      PENTA.slice(2, 8).forEach((m, i) => tone(kit, out, t + i * 0.06, note(m), 0.7, 0.1, 'sine'));
      bell(kit, out, t + 0.4, 96, 0.4, 1.6);
      break;
    case 'fanfare':
      [60, 64, 67, 72].forEach((m, i) => tone(kit, out, t + i * 0.11, note(m), 0.35, 0.16, 'triangle'));
      for (const m of [72, 76, 79, 84]) tone(kit, out, t + 0.48, note(m), 1.6, 0.09, 'triangle');
      PENTA.forEach((m, i) => tone(kit, out, t + 0.5 + i * 0.05, note(m + 12), 0.4, 0.04));
      break;
    case 'complete':
      [67, 72, 76, 79].forEach((m, i) => tone(kit, out, t + i * 0.09, note(m), 0.5, 0.15, 'triangle'));
      bell(kit, out, t + 0.36, 84, 0.5, 2);
      break;
    case 'fail':
      [67, 63, 58].forEach((m, i) => tone(kit, out, t + i * 0.16, note(m), 0.4, 0.14, 'triangle', 0.97));
      break;
    case 'start':
      tone(kit, out, t, note(72), 0.12, 0.14);
      tone(kit, out, t + 0.14, note(79), 0.25, 0.16);
      break;
    case 'crash': {
      const v = Math.min(1, 0.4 + amount / 40);
      tone(kit, out, t, 90, 0.35, 0.6 * v, 'sine', 0.4);
      burst(kit, out, t, 'lowpass', 1800, 120, 0.4, 0.5 * v);
      break;
    }
    case 'splash':
      burst(kit, out, t, 'bandpass', 2600, 300, 0.9, 0.5);
      for (let i = 0; i < 6; i++) tone(kit, out, t + 0.15 + Math.random() * 0.6, 500 + Math.random() * 700, 0.08, 0.05, 'sine', 1.8);
      break;
    case 'open':
      tone(kit, out, t, 1400, 0.05, 0.08, 'sine', 1.3);
      break;
    case 'close':
      tone(kit, out, t, 1100, 0.05, 0.07, 'sine', 0.75);
      break;
    case 'info':
      tone(kit, out, t, note(84), 0.18, 0.06);
      break;
    case 'reward':
      cableBell(kit, out, t, 0.25);
      tone(kit, out, t + 0.05, note(91), 0.5, 0.05);
      break;
    case 'warn':
      tone(kit, out, t, note(62), 0.12, 0.1, 'triangle');
      tone(kit, out, t + 0.15, note(58), 0.18, 0.1, 'triangle');
      break;
    case 'shutter':
      burst(kit, out, t, 'highpass', 3000, 5000, 0.03, 0.35);
      burst(kit, out, t + 0.08, 'highpass', 2500, 4000, 0.05, 0.25);
      break;
    case 'battery':
      tone(kit, out, t, note(81), 0.1, 0.1, 'square');
      tone(kit, out, t + 0.18, note(81), 0.1, 0.1, 'square');
      break;
    case 'nearby':
      tone(kit, out, t, note(76), 0.3, 0.06);
      tone(kit, out, t + 0.08, note(83), 0.4, 0.05);
      break;
  }
}
