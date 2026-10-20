import type { Vec3 } from '../player/flight';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 16;

export const LIMITS = {
  name: 20,
  chat: 140,
  id: 64,
  roster: 12,
  coord: 40000,
  altMin: -50,
  altMax: 3000,
  speed: 150,
  score: 1e6,
  save: 200_000,
  message: 4096,
};

export const DEFAULT_COLOR = '#f2f2ee';

export const MODE_IDS = ['race', 'tag', 'hide', 'formation'] as const;
export type ModeId = (typeof MODE_IDS)[number];
export type Mic = 0 | 1 | 2;

export type Msg =
  | { t: 'hi'; name: string; color: string }
  | { t: 'st'; p: Vec3; v: Vec3; yaw: number; mic: Mic }
  | { t: 'chat'; text: string }
  | { t: 'ping'; p: Vec3 }
  | { t: 'start'; id: string; mode: ModeId; roster: string[]; duration: number; activity: string; role: string }
  | { t: 'score'; id: string; s: number; x: number; d: boolean }
  | { t: 'tag'; id: string; to: string; n: number }
  | { t: 'end'; id: string }
  | { t: 'in'; id: string; on: boolean }
  | { t: 'claim'; key: string }
  | { t: 'save'; code: string }
  | { t: 'ack'; added: number };

export type MsgType = Msg['t'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function makeCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  return s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ');
}

export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const flat = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(flat).slice(0, max).join('').trim();
}

export function cleanColor(raw: unknown): string {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : DEFAULT_COLOR;
}

function vec(raw: unknown, speed = false): Vec3 | null {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(num)) return null;
  const [x, y, z] = raw as number[];
  if (speed) return { x: clamp(x, -LIMITS.speed, LIMITS.speed), y: clamp(y, -LIMITS.speed, LIMITS.speed), z: clamp(z, -LIMITS.speed, LIMITS.speed) };
  return { x: clamp(x, -LIMITS.coord, LIMITS.coord), y: clamp(y, LIMITS.altMin, LIMITS.altMax), z: clamp(z, -LIMITS.coord, LIMITS.coord) };
}

export function wireVec(v: Vec3): [number, number, number] {
  return [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function encode(m: Msg): Record<string, unknown> {
  if (m.t === 'st') return { t: 'st', p: wireVec(m.p), v: wireVec(m.v), y: Math.round(m.yaw * 1000) / 1000, m: m.mic };
  if (m.t === 'ping') return { t: 'ping', p: wireVec(m.p) };
  return m;
}

export function parse(raw: unknown): Msg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  switch (r.t) {
    case 'hi': {
      const name = cleanText(r.name, LIMITS.name);
      return name ? { t: 'hi', name, color: cleanColor(r.color) } : null;
    }
    case 'st': {
      const p = vec(r.p);
      const v = vec(r.v, true);
      if (!p || !v || !num(r.y)) return null;
      return { t: 'st', p, v, yaw: wrapAngle(r.y), mic: r.m === 1 || r.m === 2 ? r.m : 0 };
    }
    case 'chat': {
      const text = cleanText(r.text, LIMITS.chat);
      return text ? { t: 'chat', text } : null;
    }
    case 'ping': {
      const p = vec(r.p);
      return p ? { t: 'ping', p } : null;
    }
    case 'start': {
      const roster = Array.isArray(r.roster) ? r.roster : [];
      if (!str(r.id, LIMITS.id) || !MODE_IDS.includes(r.mode as ModeId) || !num(r.duration)) return null;
      if (roster.length < 2 || roster.length > LIMITS.roster || !roster.every((x) => str(x, LIMITS.id)) || new Set(roster).size !== roster.length) return null;
      if (!str(r.role, LIMITS.id) || !roster.includes(r.role)) return null;
      const activity = typeof r.activity === 'string' && r.activity.length <= LIMITS.id ? r.activity : '';
      return { t: 'start', id: r.id, mode: r.mode as ModeId, roster: roster as string[], duration: clamp(Math.round(r.duration), 20, 600), activity, role: r.role };
    }
    case 'score':
      if (!str(r.id, LIMITS.id) || !num(r.s) || !num(r.x)) return null;
      return { t: 'score', id: r.id, s: clamp(r.s, 0, LIMITS.score), x: clamp(r.x, 0, LIMITS.score), d: r.d === true };
    case 'tag':
      if (!str(r.id, LIMITS.id) || !str(r.to, LIMITS.id) || !num(r.n) || !Number.isInteger(r.n) || r.n < 1 || r.n > 10_000) return null;
      return { t: 'tag', id: r.id, to: r.to, n: r.n };
    case 'end':
      return str(r.id, LIMITS.id) ? { t: 'end', id: r.id } : null;
    case 'in':
      return str(r.id, LIMITS.id) ? { t: 'in', id: r.id, on: r.on === true } : null;
    case 'claim':
      return str(r.key, 8) && /^[A-Z2-9]+$/.test(r.key) ? { t: 'claim', key: r.key } : null;
    case 'save':
      return str(r.code, LIMITS.save) && /^[A-Za-z0-9_-]+$/.test(r.code) ? { t: 'save', code: r.code } : null;
    case 'ack':
      return num(r.added) ? { t: 'ack', added: clamp(Math.round(r.added), 0, 100_000) } : null;
    default:
      return null;
  }
}

const RATES: Record<MsgType, [perSecond: number, burst: number]> = {
  hi: [1, 4],
  st: [20, 40],
  chat: [1, 4],
  ping: [0.5, 3],
  start: [0.5, 2],
  score: [8, 16],
  tag: [4, 6],
  end: [1, 3],
  in: [1, 4],
  claim: [1, 3],
  save: [0.2, 1],
  ack: [1, 2],
};

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private rates: Record<string, [number, number]> = RATES) {}

  allow(peer: string, type: string, now: number): boolean {
    const rate = this.rates[type];
    if (!rate) return false;
    const key = `${peer}|${type}`;
    const b = this.buckets.get(key) ?? { tokens: rate[1], at: now };
    b.tokens = Math.min(rate[1], b.tokens + ((now - b.at) / 1000) * rate[0]);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }

  forget(peer: string): void {
    for (const k of this.buckets.keys()) if (k.startsWith(`${peer}|`)) this.buckets.delete(k);
  }
}
