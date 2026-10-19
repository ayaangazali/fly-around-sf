import type { SfTime } from './sf-time';

export type Mode = 'cable' | 'streetcar' | 'bus' | 'ferry';
export type DayType = 'wkd' | 'sat' | 'sun';

export interface Stop {
  name: string;
  at: number;
  x: number;
  z: number;
}

export interface Shape {
  x: Float32Array;
  z: Float32Array;
  d: Float32Array;
  length: number;
  stops: Stop[];
}

export interface Route {
  id: string;
  name: string;
  mode: Mode;
  agency: string;
  color: string;
  shapes: Shape[];
  days: Record<DayType, number[][]>;
}

export interface TransitData {
  generated: string;
  sources: string[];
  routes: Route[];
}

export interface Vehicle {
  key: string;
  route: Route;
  shape: Shape;
  dist: number;
  moving: boolean;
}

const MODES: Mode[] = ['cable', 'streetcar', 'bus', 'ferry'];
const DAYS: DayType[] = ['wkd', 'sat', 'sun'];

export function parseTransit(json: unknown): TransitData {
  const j = json as { v?: number; generated?: string; sources?: string[]; stopNames?: string[]; routes?: unknown[] } | null;
  if (!j || j.v !== 1 || !Array.isArray(j.routes) || !Array.isArray(j.stopNames)) throw new Error('transit: bad file');
  const names = j.stopNames;
  const routes = (j.routes as Record<string, unknown>[]).map((r) => {
    if (!MODES.includes(r.mode as Mode) || !Array.isArray(r.shapes)) throw new Error(`transit: bad route ${String(r.id)}`);
    const shapes = (r.shapes as { pts: number[]; stops: number[] }[]).map((s) => {
      const n = s.pts.length / 2;
      if (n < 2 || !Number.isInteger(n)) throw new Error(`transit: bad shape in ${String(r.id)}`);
      const shape: Shape = { x: new Float32Array(n), z: new Float32Array(n), d: new Float32Array(n), length: 0, stops: [] };
      for (let i = 0; i < n; i++) {
        shape.x[i] = s.pts[2 * i];
        shape.z[i] = s.pts[2 * i + 1];
        shape.d[i] = i ? shape.d[i - 1] + Math.hypot(shape.x[i] - shape.x[i - 1], shape.z[i] - shape.z[i - 1]) : 0;
      }
      shape.length = shape.d[n - 1];
      for (let i = 0; i < s.stops.length; i += 2) {
        const at = Math.min(shape.length, s.stops[i + 1]);
        const p = pointAt(shape, at);
        shape.stops.push({ name: names[s.stops[i]] ?? 'Stop', at, x: p.x, z: p.z });
      }
      return shape;
    });
    const days = r.days as Record<DayType, number[][]>;
    for (const d of DAYS) {
      if (!Array.isArray(days?.[d])) throw new Error(`transit: ${String(r.id)} missing ${d}`);
      for (const b of days[d]) if (b.length % 3 || b.some((v, i) => i % 3 === 0 && !shapes[v])) throw new Error(`transit: bad block in ${String(r.id)}`);
    }
    return { id: String(r.id), name: String(r.name), mode: r.mode as Mode, agency: String(r.agency), color: String(r.color), shapes, days };
  });
  return { generated: j.generated ?? '', sources: j.sources ?? [], routes };
}

export function dayType(dow: number): DayType {
  return dow === 0 ? 'sun' : dow === 6 ? 'sat' : 'wkd';
}

export function pointAt(s: Shape, dist: number): { x: number; z: number; heading: number } {
  const d = Math.min(s.length, Math.max(0, dist));
  let lo = 1;
  let hi = s.d.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.d[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const seg = s.d[lo] - s.d[lo - 1] || 1;
  const k = (d - s.d[lo - 1]) / seg;
  const dx = s.x[lo] - s.x[lo - 1];
  const dz = s.z[lo] - s.z[lo - 1];
  return { x: s.x[lo - 1] + dx * k, z: s.z[lo - 1] + dz * k, heading: Math.atan2(-dx, -dz) };
}

export function blockState(b: number[], secs: number): { shape: number; frac: number; moving: boolean } | null {
  if (!b.length || secs < b[1]) return null;
  for (let i = 0; i < b.length; i += 3) {
    const start = b[i + 1];
    const end = start + b[i + 2];
    if (secs < start) return { shape: b[i - 3], frac: 1, moving: false };
    if (secs <= end) return { shape: b[i], frac: (secs - start) / b[i + 2], moving: true };
  }
  return null;
}

export function vehiclesAt(route: Route, t: SfTime): Vehicle[] {
  const out: Vehicle[] = [];
  const add = (day: DayType, secs: number, tag: string) =>
    route.days[day].forEach((b, i) => {
      const s = blockState(b, secs);
      if (!s) return;
      const shape = route.shapes[s.shape];
      out.push({ key: `${route.id}:${tag}:${i}`, route, shape, dist: s.frac * shape.length, moving: s.moving });
    });
  add(dayType(t.dow), t.secs, 't');
  add(dayType((t.dow + 6) % 7), t.secs + 86400, 'y');
  return out;
}

export function nextPass(route: Route, shapeIndex: number, at: number, t: SfTime): number | null {
  const shape = route.shapes[shapeIndex];
  let best = Infinity;
  const scan = (day: DayType, secs: number) => {
    for (const b of route.days[day]) {
      for (let i = 0; i < b.length; i += 3) {
        if (b[i] !== shapeIndex) continue;
        const pass = b[i + 1] + (b[i + 2] * at) / shape.length - secs;
        if (pass >= 0 && pass < best) best = pass;
      }
    }
  };
  scan(dayType(t.dow), t.secs);
  scan(dayType((t.dow + 6) % 7), t.secs + 86400);
  scan(dayType((t.dow + 1) % 7), t.secs - 86400);
  return Number.isFinite(best) ? best : null;
}

export function nearestStop(routes: Route[], x: number, z: number): { route: Route; shape: number; stop: Stop; dist: number } | null {
  let best: { route: Route; shape: number; stop: Stop; dist: number } | null = null;
  for (const route of routes) {
    route.shapes.forEach((s, si) => {
      for (const stop of s.stops) {
        const d = Math.hypot(stop.x - x, stop.z - z);
        if (!best || d < best.dist) best = { route, shape: si, stop, dist: d };
      }
    });
  }
  return best;
}
