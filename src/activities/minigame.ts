import type { Game } from '../game';
import type { SaveStore } from '../core/save';
import type { Vec3 } from '../player/flight';
import type { ActivityDef, ActivityInstance, GeoPoint } from './types';

export type PropType =
  | 'cable-car'
  | 'streetcar'
  | 'ferry'
  | 'jet'
  | 'sailboat'
  | 'seagull'
  | 'pelican'
  | 'falcon'
  | 'parrot'
  | 'raven'
  | 'fortune-cookie'
  | 'fog-wisp'
  | 'sourdough'
  | 'coffee'
  | 'leaf'
  | 'parcel'
  | 'pad'
  | 'zone';

export const PROP_EMOJI: Record<PropType, string> = {
  'cable-car': '🚋',
  streetcar: '🚃',
  ferry: '⛴️',
  jet: '✈️',
  sailboat: '⛵',
  seagull: '🐦',
  pelican: '🐦',
  falcon: '🦅',
  parrot: '🦜',
  raven: '🐦‍⬛',
  'fortune-cookie': '🥠',
  'fog-wisp': '🌫️',
  sourdough: '🍞',
  coffee: '☕',
  leaf: '🍃',
  parcel: '📦',
  pad: '🛬',
  zone: '🌀',
};

export interface Prop {
  type: PropType;
  pos: Vec3;
  yaw: number;
  scale: number;
  on: boolean;
}

export interface MinigameInstance extends ActivityInstance {
  props(): readonly Prop[];
}

export interface MinigameResult {
  id: string;
  medal: number;
  time: number;
  score?: string;
  fail?: string;
}

declare module '../core/bus' {
  interface GameEvents {
    'minigame:result': MinigameResult;
    'photo:scored': { id: string; stars: number; hint: string };
  }
}

export const MEDAL_NAMES = ['No medal', 'Bronze', 'Silver', 'Gold'] as const;

export type Medals = [number, number, number];

export function isMedals(m: unknown): m is Medals {
  return Array.isArray(m) && m.length === 3 && m.every((v) => typeof v === 'number' && v > 0) && m[0] < m[1] && m[1] < m[2];
}

export function medalFor(medals: unknown, time: number): number {
  if (!isMedals(medals)) return 0;
  return time <= medals[0] ? 3 : time <= medals[1] ? 2 : time <= medals[2] ? 1 : 0;
}

export function bestMedal(save: SaveStore, id: string): number {
  const m = save.data.flags[`medal:${id}`];
  return typeof m === 'number' ? m : 0;
}

export function saveMedal(save: SaveStore, id: string, medal: number): boolean {
  if (medal <= bestMedal(save, id)) return false;
  save.data.flags[`medal:${id}`] = medal;
  save.persist();
  return true;
}

export function isGeo(g: unknown): g is GeoPoint {
  const p = g as GeoPoint | undefined;
  return !!p && typeof p.lat === 'number' && typeof p.lon === 'number' && (p.alt === undefined || typeof p.alt === 'number');
}

export function isRange(r: unknown): r is [number, number] {
  return Array.isArray(r) && r.length === 2 && r.every((v) => typeof v === 'number') && r[0] < r[1];
}

export function validateTimed(p: Record<string, unknown> | undefined, errors: string[], needsLimit = true): void {
  const limit = p?.timeLimit;
  if (limit === undefined ? needsLimit : !(typeof limit === 'number' && limit > 0)) errors.push('params.timeLimit must be > 0');
  if (p?.medals !== undefined && !isMedals(p.medals)) errors.push('params.medals must be 3 ascending times [gold, silver, bronze]');
  else if (isMedals(p?.medals) && typeof limit === 'number' && p.medals[2] > limit) errors.push('params.medals bronze must fit inside timeLimit');
}

export function report(game: Game, def: ActivityDef, result: Omit<MinigameResult, 'id'>): void {
  game.bus.emit('minigame:result', { id: def.id, ...result });
}

export function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return m > 0 ? `${m}:${rest.toFixed(1).padStart(4, '0')}` : `${rest.toFixed(1)}s`;
}

export function clock(t: number, limit: number | undefined): string {
  const s = limit ? Math.max(0, limit - t) : t;
  const text = s < 10 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return limit ? `${text} left` : text;
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function meters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function prop(type: PropType, pos: Vec3, yaw = 0, scale = 1): Prop {
  return { type, pos: { ...pos }, yaw, scale, on: true };
}
