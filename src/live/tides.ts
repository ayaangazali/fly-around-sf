import type { FeedSpec } from './feed';

export interface TideEvent {
  t: number;
  h: number;
  high: boolean;
}

export const STATION = '9414290';
const MSL_ABOVE_MLLW = 2.773 - 1.822;

export const tideSpec: FeedSpec<TideEvent[]> = {
  id: 'tides',
  label: 'Tides',
  url: (now) => {
    const d = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
    return `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=fly_around_sf&begin_date=${d}&range=96&datum=MLLW&station=${STATION}&time_zone=gmt&units=metric&interval=hilo&format=json`;
  },
  parse: parseTides,
  ttl: 6 * 3600_000,
  maxAge: 2 * 86400_000,
  minInterval: 60 * 60_000,
  failBackoff: 15 * 60_000,
};

export function parseTides(json: unknown): TideEvent[] {
  const list = (json as { predictions?: unknown } | null)?.predictions;
  if (!Array.isArray(list)) throw new Error('tides: no predictions');
  const out = (list as { t?: unknown; v?: unknown; type?: unknown }[])
    .map((p) => ({ t: Date.parse(`${String(p.t).replace(' ', 'T')}:00Z`), h: Number(p.v), high: p.type === 'H' }))
    .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.h));
  if (out.length < 2) throw new Error('tides: too few events');
  return out.sort((a, b) => a.t - b.t);
}

export function heightBetween(events: TideEvent[], ms: number): number | null {
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (ms >= a.t && ms <= b.t) return a.h + ((b.h - a.h) * (1 - Math.cos((Math.PI * (ms - a.t)) / (b.t - a.t)))) / 2;
  }
  return null;
}

type Args = { T: number; s: number; h: number; p: number; N: number; p1: number };
interface Constituent {
  amp: number;
  phase: number;
  v(a: Args): number;
  node(N: number): [number, number];
}

const R = Math.PI / 180;
const cos = (d: number) => Math.cos(d * R);
const sin = (d: number) => Math.sin(d * R);
const one = (): [number, number] => [1, 0];
const m2 = (N: number): [number, number] => [1.0004 - 0.0373 * cos(N) + 0.0002 * cos(2 * N), -2.14 * sin(N)];
const k1 = (N: number): [number, number] => [1.006 + 0.115 * cos(N) - 0.0088 * cos(2 * N) + 0.0006 * cos(3 * N), -8.86 * sin(N) + 0.68 * sin(2 * N) - 0.07 * sin(3 * N)];
const o1 = (N: number): [number, number] => [1.0089 + 0.1871 * cos(N) - 0.0147 * cos(2 * N) + 0.0014 * cos(3 * N), 10.8 * sin(N) - 1.34 * sin(2 * N) + 0.19 * sin(3 * N)];
const k2 = (N: number): [number, number] => [1.0241 + 0.2863 * cos(N) + 0.0083 * cos(2 * N) - 0.0015 * cos(3 * N), -17.74 * sin(N) + 0.68 * sin(2 * N) - 0.04 * sin(3 * N)];
const j1 = (N: number): [number, number] => [1.1029 + 0.1676 * cos(N) - 0.017 * cos(2 * N) + 0.0016 * cos(3 * N), -12.94 * sin(N) + 1.34 * sin(2 * N) - 0.19 * sin(3 * N)];
const oo1 = (N: number): [number, number] => [1.1027 + 0.6504 * cos(N) + 0.0317 * cos(2 * N) - 0.0014 * cos(3 * N), -36.68 * sin(N) + 4.02 * sin(2 * N) - 0.57 * sin(3 * N)];
const mf = (N: number): [number, number] => [1.043 + 0.414 * cos(N), -23.7 * sin(N) + 2.7 * sin(2 * N) - 0.4 * sin(3 * N)];
const mul = (...fs: [(N: number) => [number, number], number][]) => (N: number): [number, number] =>
  fs.reduce<[number, number]>(([f, u], [g, k]) => {
    const [gf, gu] = g(N);
    return [f * gf ** Math.abs(k), u + k * gu];
  }, [1, 0]);

const VM2 = (a: Args) => 2 * a.T - 2 * a.s + 2 * a.h;
const VK1 = (a: Args) => a.T + a.h - 90;
const VS2 = (a: Args) => 2 * a.T;
const VN2 = (a: Args) => 2 * a.T - 3 * a.s + 2 * a.h + a.p;

export const HARMONICS: Record<string, Constituent> = {
  M2: { amp: 0.576, phase: 208.2, v: VM2, node: m2 },
  S2: { amp: 0.137, phase: 216.2, v: VS2, node: one },
  N2: { amp: 0.122, phase: 183.2, v: VN2, node: m2 },
  K1: { amp: 0.37, phase: 225.4, v: VK1, node: k1 },
  O1: { amp: 0.23, phase: 208.4, v: (a) => a.T - 2 * a.s + a.h + 90, node: o1 },
  P1: { amp: 0.114, phase: 222.1, v: (a) => a.T - a.h + 90, node: one },
  Q1: { amp: 0.041, phase: 202.4, v: (a) => a.T - 3 * a.s + a.h + a.p + 90, node: o1 },
  K2: { amp: 0.04, phase: 206.0, v: (a) => 2 * a.T + 2 * a.h, node: k2 },
  NU2: { amp: 0.026, phase: 189.9, v: (a) => 2 * a.T - 3 * a.s + 4 * a.h - a.p, node: m2 },
  '2N2': { amp: 0.013, phase: 153.3, v: (a) => 2 * a.T - 4 * a.s + 2 * a.h + 2 * a.p, node: m2 },
  MU2: { amp: 0.007, phase: 100.2, v: (a) => 2 * a.T - 4 * a.s + 4 * a.h, node: m2 },
  L2: { amp: 0.018, phase: 229.6, v: (a) => 2 * a.T - a.s + 2 * a.h - a.p + 180, node: m2 },
  LAM2: { amp: 0.007, phase: 214.3, v: (a) => 2 * a.T - a.s + a.p + 180, node: m2 },
  T2: { amp: 0.009, phase: 204.6, v: (a) => 2 * a.T - a.h + a.p1, node: one },
  J1: { amp: 0.019, phase: 244.3, v: (a) => a.T + a.s + a.h - a.p - 90, node: j1 },
  OO1: { amp: 0.012, phase: 260.0, v: (a) => a.T + 2 * a.s + a.h - 90, node: oo1 },
  RHO: { amp: 0.009, phase: 200.0, v: (a) => a.T - 3 * a.s + 3 * a.h - a.p + 90, node: o1 },
  M4: { amp: 0.022, phase: 136.8, v: (a) => 2 * VM2(a), node: mul([m2, 2]) },
  MS4: { amp: 0.01, phase: 149.0, v: (a) => VM2(a) + VS2(a), node: m2 },
  MN4: { amp: 0.008, phase: 112.0, v: (a) => VM2(a) + VN2(a), node: mul([m2, 2]) },
  MK3: { amp: 0.018, phase: 124.1, v: (a) => VM2(a) + VK1(a), node: mul([m2, 1], [k1, 1]) },
  '2MK3': { amp: 0.014, phase: 92.2, v: (a) => 2 * VM2(a) - VK1(a), node: mul([m2, 2], [k1, -1]) },
  MF: { amp: 0.015, phase: 153.1, v: (a) => 2 * a.s, node: mf },
  SA: { amp: 0.044, phase: 200.2, v: (a) => a.h, node: one },
  SSA: { amp: 0.03, phase: 272.3, v: (a) => 2 * a.h, node: one },
};

export function astro(ms: number): Args {
  const T = (ms / 86400_000 + 2440587.5 - 2451545) / 36525;
  const ut = ((ms % 86400_000) + 86400_000) % 86400_000 / 3600_000;
  return {
    T: 15 * ut + 180,
    s: 218.3164477 + 481267.88123421 * T,
    h: 280.46646 + 36000.76983 * T,
    p: 83.3532465 + 4069.0137287 * T,
    N: 125.04452 - 1934.136261 * T,
    p1: 282.93735 + 1.71946 * T,
  };
}

export function harmonicHeight(ms: number): number {
  const a = astro(ms);
  let h = MSL_ABOVE_MLLW;
  for (const c of Object.values(HARMONICS)) {
    const [f, u] = c.node(a.N);
    h += f * c.amp * cos(c.v(a) + u - c.phase);
  }
  return h;
}

export function harmonicEvents(from: number, to: number, step = 6 * 60_000): TideEvent[] {
  const out: TideEvent[] = [];
  let a = harmonicHeight(from - step);
  let b = harmonicHeight(from);
  for (let t = from; t <= to; t += step) {
    const c = harmonicHeight(t + step);
    if ((b > a && b >= c) || (b < a && b <= c)) {
      const denom = a - 2 * b + c;
      const off = denom ? (0.5 * (a - c)) / denom : 0;
      out.push({ t: Math.round(t + off * step), h: b - 0.25 * (a - c) * off, high: b > a });
    }
    a = b;
    b = c;
  }
  return out;
}

export interface TideNow {
  height: number;
  rising: boolean;
  next: TideEvent | null;
  after: TideEvent | null;
}

export function tideNow(events: TideEvent[], ms: number): TideNow {
  const height = heightBetween(events, ms) ?? harmonicHeight(ms);
  const i = events.findIndex((e) => e.t > ms);
  const next = i < 0 ? null : events[i];
  return { height, rising: next ? next.high : harmonicHeight(ms + 600_000) > height, next, after: i < 0 ? null : (events[i + 1] ?? null) };
}
