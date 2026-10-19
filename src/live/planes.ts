import type { FeedSpec } from './feed';
import { M_PER_DEG_LAT, M_PER_DEG_LON } from '../core/geo';

export interface Plane {
  id: string;
  label: string;
  lat: number;
  lon: number;
  alt: number;
  track: number;
  speed: number;
  climb: number;
  bank: number;
  wide: boolean;
  livery: number;
  landing: boolean;
}

export interface Traffic {
  time: number;
  planes: Plane[];
}

export const BBOX = { lamin: 37.45, lomin: -122.65, lamax: 37.95, lomax: -122.05 };

export const planeSpec: FeedSpec<Traffic> = {
  id: 'planes',
  label: 'Planes',
  url: () => `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`,
  parse: parseOpenSky,
  ttl: 60_000,
  maxAge: 3 * 60_000,
  minInterval: 60_000,
  failBackoff: 6 * 3600_000,
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function parseOpenSky(json: unknown): Traffic {
  const j = json as { time?: unknown; states?: unknown } | null;
  if (!j || typeof j.time !== 'number' || !(j.states === null || Array.isArray(j.states))) throw new Error('opensky: bad payload');
  const planes: Plane[] = [];
  for (const s of (j.states ?? []) as unknown[][]) {
    const [id, callsign, , , , lon, lat, baro, ground, speed, track, climb, , geo] = s;
    if (ground || typeof id !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const alt = typeof geo === 'number' ? geo : typeof baro === 'number' ? baro : null;
    if (alt === null) continue;
    const r = hash(id);
    planes.push({
      id,
      label: typeof callsign === 'string' && callsign.trim() ? callsign.trim() : id.toUpperCase(),
      lat,
      lon,
      alt,
      track: typeof track === 'number' ? track : 0,
      speed: typeof speed === 'number' ? speed : 0,
      climb: typeof climb === 'number' ? climb : 0,
      bank: 0,
      wide: r < 0.25,
      livery: Math.floor(r * 1000) % 6,
      landing: alt < 3000,
    });
  }
  return { time: j.time * 1000, planes };
}

export function extrapolate(t: Traffic, ms: number): Plane[] {
  const dt = Math.min(120, Math.max(0, (ms - t.time) / 1000));
  return t.planes.map((p) => {
    const r = (p.track * Math.PI) / 180;
    return { ...p, lat: p.lat + (Math.cos(r) * p.speed * dt) / M_PER_DEG_LAT, lon: p.lon + (Math.sin(r) * p.speed * dt) / M_PER_DEG_LON, alt: Math.max(0, p.alt + p.climb * dt) };
  });
}

interface Leg {
  turn?: number;
  dist: number;
  alt: number;
}

export interface Flow {
  id: string;
  label: string;
  start: { lat: number; lon: number; alt: number };
  heading: number;
  legs: Leg[];
  speed: number;
  interval: number;
  offset: number;
}

const GLIDE = Math.tan((3 * Math.PI) / 180);

function arrival(id: string, label: string, threshold: { lat: number; lon: number }, course: number, interval: number, offset: number): Flow {
  const out = 30000;
  const back = ((course + 180) * Math.PI) / 180;
  const start = { lat: threshold.lat + (Math.cos(back) * out) / M_PER_DEG_LAT, lon: threshold.lon + (Math.sin(back) * out) / M_PER_DEG_LON, alt: 15 + out * GLIDE };
  return { id, label, start, heading: course, legs: [{ dist: out, alt: 15 }, { dist: 400, alt: 2 }, { dist: 1400, alt: 2 }], speed: 72, interval, offset };
}

function departure(id: string, label: string, threshold: { lat: number; lon: number }, course: number, turn: number, interval: number, offset: number): Flow {
  return {
    id,
    label,
    start: { ...threshold, alt: 2 },
    heading: course,
    legs: [{ dist: 2200, alt: 2 }, { dist: 9000, alt: 900 }, { turn, dist: 6000, alt: 1500 }, { dist: 30000, alt: 4200 }],
    speed: 85,
    interval,
    offset,
  };
}

export const FLOWS: Flow[] = [
  arrival('sfo-28l', 'SFO arrival, runway 28L', { lat: 37.611712, lon: -122.358349 }, 298, 240, 0),
  arrival('sfo-28r', 'SFO arrival, runway 28R', { lat: 37.613534, lon: -122.357141 }, 298, 240, 120),
  departure('sfo-01l', 'SFO departure, runway 1L', { lat: 37.607898, lon: -122.382929 }, 28, 70, 220, 40),
  departure('sfo-01r', 'SFO departure, runway 1R', { lat: 37.60633, lon: -122.381041 }, 28, 70, 220, 150),
  arrival('oak-30', 'OAK arrival, runway 30', { lat: 37.701493, lon: -122.214258 }, 310, 480, 60),
  departure('oak-30-dep', 'OAK departure, runway 30', { lat: 37.701493, lon: -122.214258 }, 310, 45, 480, 300),
];

export interface Path {
  x: Float64Array;
  z: Float64Array;
  y: Float64Array;
  h: Float64Array;
  d: Float64Array;
  length: number;
}

const paths = new Map<string, Path>();

export function flowPath(f: Flow): Path {
  const hit = paths.get(f.id);
  if (hit) return hit;
  const pts: [number, number, number, number][] = [[0, 0, f.start.alt, f.heading]];
  let heading = f.heading;
  for (const leg of f.legs) {
    const steps = leg.turn ? 12 : 1;
    const y0 = pts[pts.length - 1][2];
    for (let i = 1; i <= steps; i++) {
      heading += (leg.turn ?? 0) / steps;
      const r = (heading * Math.PI) / 180;
      const [px, pz] = pts[pts.length - 1];
      pts.push([px + (Math.sin(r) * leg.dist) / steps, pz - (Math.cos(r) * leg.dist) / steps, y0 + ((leg.alt - y0) * i) / steps, heading]);
    }
  }
  const n = pts.length;
  const p: Path = { x: new Float64Array(n), z: new Float64Array(n), y: new Float64Array(n), h: new Float64Array(n), d: new Float64Array(n), length: 0 };
  pts.forEach(([x, z, y, h], i) => {
    p.x[i] = x;
    p.z[i] = z;
    p.y[i] = y;
    p.h[i] = h;
    p.d[i] = i ? p.d[i - 1] + Math.hypot(x - p.x[i - 1], z - p.z[i - 1]) : 0;
  });
  p.length = p.d[n - 1];
  paths.set(f.id, p);
  return p;
}

export function alongPath(p: Path, dist: number): { x: number; z: number; y: number; heading: number; grade: number; turn: number } {
  let i = 1;
  while (i < p.d.length - 1 && p.d[i] < dist) i++;
  const seg = p.d[i] - p.d[i - 1] || 1;
  const k = Math.min(1, Math.max(0, (dist - p.d[i - 1]) / seg));
  return {
    x: p.x[i - 1] + (p.x[i] - p.x[i - 1]) * k,
    z: p.z[i - 1] + (p.z[i] - p.z[i - 1]) * k,
    y: p.y[i - 1] + (p.y[i] - p.y[i - 1]) * k,
    heading: p.h[i],
    grade: (p.y[i] - p.y[i - 1]) / seg,
    turn: p.h[i] - p.h[i - 1],
  };
}

export function simulate(ms: number, localHour: number): Plane[] {
  const t = ms / 1000;
  const night = localHour >= 1 && localHour < 6;
  const out: Plane[] = [];
  for (const f of FLOWS) {
    const p = flowPath(f);
    const dur = p.length / f.speed;
    const first = Math.floor((t - dur - f.offset) / f.interval) - 1;
    const last = Math.floor((t - f.offset) / f.interval) + 1;
    for (let k = first; k <= last; k++) {
      const id = `${f.id}-${k}`;
      const r = hash(id);
      if (night && r < 0.75) continue;
      const t0 = k * f.interval + f.offset + (r - 0.5) * 0.3 * f.interval;
      const dist = (t - t0) * f.speed;
      if (dist < 0 || dist > p.length) continue;
      const a = alongPath(p, dist);
      const lat = f.start.lat - a.z / M_PER_DEG_LAT;
      const lon = f.start.lon + a.x / M_PER_DEG_LON;
      out.push({
        id,
        label: f.label,
        lat,
        lon,
        alt: a.y,
        track: ((a.heading % 360) + 360) % 360,
        speed: f.speed,
        climb: a.grade * f.speed,
        bank: Math.max(-0.45, Math.min(0.45, a.turn * 0.08)),
        wide: r > 0.75,
        livery: Math.floor(r * 997) % 6,
        landing: a.y < 3000,
      });
    }
  }
  return out;
}
