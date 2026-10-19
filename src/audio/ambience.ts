import { toLocal } from '../core/geo';
import type { Vec3 } from '../player/flight';
import { closestOnLines, edgeFade, gate, type XZ } from './mix';
import { ALCATRAZ_HORN, GGB_MIDSPAN, GGB_SOUTH_TOWER, blastsBetween, graceRings, hourLabel, type HornPattern, type Strike } from './schedule';
import { SPOTS, type SoundSpot, type SpotWhen } from './spots';
import { bark, bell, cableBell, gull, horn, wave, type Kit } from './synth';

export interface Conditions {
  fog: number;
  night: number;
  hour: number;
}

export const FOG_HORN_DENSITY = 1.6;

export function audible(when: SpotWhen, c: Conditions): boolean {
  if (when === 'fog') return c.fog >= FOG_HORN_DENSITY;
  if (when === 'day') return c.night < 0.6;
  if (when === 'awake') return c.hour >= 7 && c.hour < 23;
  return true;
}

export interface PlacedSpot extends SoundSpot {
  local: XZ[][];
}

export const PLACED: PlacedSpot[] = SPOTS.map((s) => ({ ...s, local: (s.lines ?? [[s.at as [number, number]]]).map((l) => l.map(([lat, lon]) => toLocal(lat, lon))) }));

export function spotPoint(spot: PlacedSpot, at: Vec3, groundAt: (x: number, z: number) => number): Vec3 & { d: number } {
  const p = closestOnLines(spot.local, at.x, at.z);
  const y = Math.max(0, groundAt(p.x, p.z)) + spot.alt;
  return { x: p.x, y, z: p.z, d: Math.hypot(p.d, at.y - y) };
}

export function spotStatus(spot: SoundSpot, c: Conditions, distance: number, playing: boolean, off = ''): string {
  if (off && audible(spot.when, c) && distance < spot.radius) return `In earshot, ${off}`;
  const next = (c.hour + 1) % 24;
  if (spot.id === 'grace-cathedral-bells') return `Next ring ${graceRings(next) ? hourLabel(next) : '9 AM'}${playing ? ', in earshot' : ''}`;
  if (playing) return 'Playing now';
  if (!audible(spot.when, c)) return { fog: 'Waiting for thick fog', day: 'Sunrise to sunset', awake: 'Quiet from 11 PM to 7 AM', always: '', clock: '' }[spot.when];
  return `Fly closer, ${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`} away`;
}

const HORNS: Record<string, HornPattern> = { 'ggb-south-horn': GGB_SOUTH_TOWER, 'ggb-midspan-horn': GGB_MIDSPAN, 'alcatraz-horn': ALCATRAZ_HORN };

const BELL_RHYTHMS = [[0, 0.22], [0, 0.18, 0.36], [0, 0.3, 0.45, 0.75], [0, 0.2, 0.4, 0.6, 0.8, 1.3]];

interface Live {
  spot: PlacedSpot;
  gain: GainNode;
  panner: PannerNode;
  next: number;
  queue: Strike[];
  bed: GainNode[];
  stops: AudioScheduledSourceNode[];
  nodes: number;
  until: number;
}

export class Ambience {
  readonly live = new Map<string, Live>();
  private dying: Live[] = [];

  constructor(
    private kit: Kit,
    private out: AudioNode,
  ) {}

  get nodes(): number {
    let n = 0;
    for (const l of this.live.values()) n += l.nodes;
    for (const l of this.dying) n += l.nodes;
    return n;
  }

  update(listener: Vec3, c: Conditions, groundAt: (x: number, z: number) => number): void {
    const now = this.kit.ctx.currentTime;
    for (const spot of PLACED) {
      const p = spotPoint(spot, listener, groundAt);
      let l = this.live.get(spot.id);
      const on = audible(spot.when, c) && gate(p.d, spot.radius, !!l);
      if (!on) {
        if (l) this.close(l, now);
        continue;
      }
      l ??= this.open(spot, now);
      setPosition(l.panner, p.x, p.y, p.z);
      l.gain.gain.setTargetAtTime(edgeFade(p.d, spot.radius) * spot.gain, now, 0.4);
      this.tick(l, now);
    }
    this.dying = this.dying.filter((l) => {
      if (now < l.until) return true;
      for (const s of l.stops) s.stop();
      l.gain.disconnect();
      l.panner.disconnect();
      return false;
    });
  }

  ring(id: string, strikes: Strike[]): boolean {
    const l = this.live.get(id);
    if (!l) return false;
    const t0 = this.kit.ctx.currentTime + 0.1;
    l.queue.push(...strikes.map((s) => ({ ...s, t: t0 + s.t })));
    return true;
  }

  private open(spot: PlacedSpot, now: number): Live {
    const { kit } = this;
    const panner = kit.ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = spot.ref;
    panner.rolloffFactor = 1;
    const gain = kit.gain();
    gain.connect(panner).connect(this.out);
    const l: Live = { spot, gain, panner, next: now + Math.random() * 0.4, queue: [], bed: [], stops: [], nodes: 2, until: 0 };
    const loop = (brown: boolean, type: BiquadFilterType, freq: number, q: number, level: number) => {
      const src = kit.noiseSource(brown, true);
      const g = kit.gain(level);
      src.connect(kit.filter(type, freq, q)).connect(g).connect(gain);
      src.start(now, Math.random() * 1.5);
      l.stops.push(src);
      l.bed.push(g);
      l.nodes += 3;
    };
    if (spot.id === 'cable-car-bells') loop(true, 'bandpass', 140, 0.8, 0.35);
    else if (spot.id === 'oracle-park-crowd') {
      loop(true, 'bandpass', 520, 0.5, 0.6);
      loop(false, 'bandpass', 1500, 1.1, 0.08);
    } else if (spot.id === 'ocean-beach-surf') loop(false, 'lowpass', 650, 0.5, 0.1);
    if (HORNS[spot.id]) l.next = now;
    this.live.set(spot.id, l);
    return l;
  }

  private close(l: Live, now: number): void {
    l.gain.gain.cancelScheduledValues(now);
    l.gain.gain.setTargetAtTime(0, now, 0.15);
    l.until = now + 0.8;
    this.live.delete(l.spot.id);
    this.dying.push(l);
  }

  private tick(l: Live, now: number): void {
    const { kit } = this;
    const out = l.gain;
    const ahead = now + 0.5;
    const r = Math.random;
    l.queue = l.queue.filter((s) => {
      if (s.t >= ahead) return true;
      bell(kit, out, Math.max(now, s.t), s.midi, s.vel, s.decay);
      return false;
    });
    const pattern = HORNS[l.spot.id];
    if (pattern) {
      for (const b of blastsBetween(pattern, l.next, ahead)) horn(kit, out, b.t, b.freq, b.dur);
      l.next = Math.max(l.next, ahead);
      return;
    }
    while (l.next < ahead) {
      const t = Math.max(now, l.next);
      switch (l.spot.id) {
        case 'cable-car-bells':
          for (const o of BELL_RHYTHMS[Math.floor(r() * BELL_RHYTHMS.length)]) cableBell(kit, out, t + o, 0.7 + r() * 0.3);
          l.next = t + 3 + r() * 9;
          break;
        case 'pier-39-sea-lions':
          bark(kit, out, t, 0.8 + r() * 0.4, 2 + Math.floor(r() * 5));
          l.next = t + 1.2 + r() * 4;
          break;
        case 'waterfront-gulls':
          gull(kit, out, t, 0.9 + r() * 0.25, 1 + Math.floor(r() * 4));
          l.next = t + 2.5 + r() * 7;
          break;
        case 'ocean-beach-surf':
          wave(kit, out, t, r());
          l.next = t + 5 + r() * 6;
          break;
        case 'oracle-park-crowd': {
          const cheer = r() < 0.12;
          l.bed[0].gain.setTargetAtTime(0.4 + r() * 0.4, t, 1.2);
          l.bed[1].gain.setTargetAtTime(cheer ? 0.55 : 0.05 + r() * 0.08, t, cheer ? 0.25 : 1.5);
          if (cheer) l.bed[1].gain.setTargetAtTime(0.08, t + 2.5, 1.2);
          l.next = t + (cheer ? 5 : 2 + r() * 3);
          break;
        }
        default:
          l.next = Infinity;
      }
    }
  }
}

function setPosition(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}
