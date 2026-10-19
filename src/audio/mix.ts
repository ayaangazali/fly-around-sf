export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export const DEFAULT_MIX = { volMaster: 0.8, volMusic: 0.5, volSfx: 0.8, volVoice: 1 } as const;

export interface Mix {
  volMaster: number;
  volMusic: number;
  volSfx: number;
  volVoice: number;
  muted: boolean;
}

export function readMix(settings: Record<string, unknown>): Mix {
  const vol = (k: keyof typeof DEFAULT_MIX) => {
    const v = settings[k];
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v) : DEFAULT_MIX[k];
  };
  return { volMaster: vol('volMaster'), volMusic: vol('volMusic'), volSfx: vol('volSfx'), volVoice: vol('volVoice'), muted: settings.muted === true };
}

export function volumeGain(v: number): number {
  return clamp(v) ** 2;
}

export interface BusLevels {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export function busLevels(m: Mix): BusLevels {
  return { master: m.muted ? 0 : volumeGain(m.volMaster), music: volumeGain(m.volMusic), sfx: volumeGain(m.volSfx), ambience: volumeGain(m.volSfx) };
}

export interface DroneSound {
  freq: number;
  cutoff: number;
  gain: number;
  chop: number;
  whine: number;
  whineFreq: number;
  wind: number;
  windFreq: number;
}

export function droneSound(speed: number, climb: number, accel: number, boost: boolean): DroneSound {
  const s = clamp(speed / 62, 0, 1.2);
  const load = clamp(accel / 12 + Math.abs(climb) / 28);
  const freq = 92 + 70 * s + 38 * load;
  return {
    freq,
    cutoff: 600 + 2600 * s + 1800 * load,
    gain: 0.1 + 0.1 * s + 0.08 * load,
    chop: freq / 3,
    whine: boost ? 0.05 + 0.04 * s : 0,
    whineFreq: 1500 + 900 * s,
    wind: 0.22 * s * s,
    windFreq: 300 + 1400 * s,
  };
}

export function altitudeMix(agl: number, overWater: boolean): { hum: number; high: number; water: number } {
  const low = 1 - smoothstep(40, 320, agl);
  return { hum: low * (overWater ? 0.15 : 1), high: smoothstep(120, 600, agl), water: overWater ? 1 - smoothstep(10, 120, agl) : 0 };
}

export function edgeFade(d: number, radius: number): number {
  return 1 - smoothstep(radius * 0.75, radius, d);
}

export function gate(d: number, radius: number, wasOn: boolean): boolean {
  return d < (wasOn ? radius * 1.1 : radius);
}

export interface XZ {
  x: number;
  z: number;
}

export function closestOnLines(lines: XZ[][], x: number, z: number): XZ & { d: number } {
  let best = { x: NaN, z: NaN, d: Infinity };
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      const b = line[Math.min(i + 1, line.length - 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / len2) : 0;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { x: px, z: pz, d };
    }
  }
  return best;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
