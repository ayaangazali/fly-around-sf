import type { Vec3 } from '../player/flight';

export const VOICE_NEAR = 12;
export const VOICE_FAR = 350;
export const MAX_EXTRAPOLATE = 0.3;
export const SNAP_DISTANCE = 80;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function voiceGain(distance: number, volume: number): number {
  if (!(volume > 0) || !(distance < VOICE_FAR)) return 0;
  if (distance <= VOICE_NEAR) return volume;
  const k = 1 - (distance - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR);
  return volume * k * k;
}

export function voiceVolume(settings: Record<string, unknown>, peerMuted = false): number {
  if (peerMuted || settings.muted === true) return 0;
  const v = typeof settings.volVoice === 'number' ? settings.volVoice : 1;
  const m = typeof settings.volMaster === 'number' ? settings.volMaster : 0.8;
  return clamp01(v) * clamp01(m);
}

export function predict(p: Vec3, v: Vec3, age: number): Vec3 {
  const t = Math.min(MAX_EXTRAPOLATE, Math.max(0, age));
  return { x: p.x + v.x * t, y: p.y + v.y * t, z: p.z + v.z * t };
}

export function approach(cur: Vec3, target: Vec3, dt: number, rate = 10): Vec3 {
  if (Math.hypot(target.x - cur.x, target.y - cur.y, target.z - cur.z) > SNAP_DISTANCE) return { ...target };
  const k = 1 - Math.exp(-rate * dt);
  return { x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k, z: cur.z + (target.z - cur.z) * k };
}

export function approachAngle(cur: number, target: number, dt: number, rate = 10): number {
  const d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
  return cur + d * (1 - Math.exp(-rate * dt));
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function rayToGround(origin: Vec3, dir: Vec3, groundAt: (x: number, z: number) => number, max = 1500, step = 4): Vec3 {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  for (let s = step; s <= max; s += step) {
    const x = origin.x + d.x * s;
    const z = origin.z + d.z * s;
    const g = groundAt(x, z);
    if (origin.y + d.y * s <= g) return { x, y: g, z };
  }
  const x = origin.x + d.x * Math.min(max, 300);
  const z = origin.z + d.z * Math.min(max, 300);
  return { x, y: groundAt(x, z), z };
}
