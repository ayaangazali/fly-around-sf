import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import { inBounds } from '../core/geo';
import type { ActivityInstance, GeoPoint } from './types';

export const NORTON = 'Emperor Norton';
export const HINT_TIMES = [60, 120];

export interface Line {
  who: string;
  text: string;
  share?: string;
}

export type MarkerStyle = 'beacon' | 'token' | 'shard';

export interface Marker {
  p: Vec3;
  style: MarkerStyle;
}

export type Trend = 'warmer' | 'colder' | 'steady';

export interface QuestInstance extends ActivityInstance {
  markers(): Marker[];
  heat?(): number;
  trend?(): Trend;
}

export interface Waypoint extends Vec3 {
  label: string;
  quest?: boolean;
}

declare module '../core/bus' {
  interface GameEvents {
    'quest:say': { id: string; lines: Line[] };
    'quest:objective': { id: string; title: string; text: string; hint?: string; icon: string };
    'quest:daily': { date: string; share: string };
  }
}

export function geoErrors(g: unknown, label: string): string[] {
  const p = g as GeoPoint | undefined;
  if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return [`${label} needs lat/lon`];
  return inBounds(p.lat, p.lon) ? [] : [`${label} is outside San Francisco`];
}

export function textErrors(v: unknown, label: string, min = 3): string[] {
  return typeof v === 'string' && v.trim().length >= min ? [] : [`${label} must be text`];
}

export function hintErrors(h: unknown, label: string): string[] {
  return Array.isArray(h) && h.length === HINT_TIMES.length && h.every((s) => typeof s === 'string' && s.length > 3) ? [] : [`${label} needs ${HINT_TIMES.length} hints`];
}

export function hintsUnlocked(t: number): number {
  return HINT_TIMES.filter((s) => t >= s).length;
}

export function reached(pos: Vec3, target: Vec3, radius: number, above = 150): boolean {
  return Math.hypot(pos.x - target.x, pos.z - target.z) <= radius && pos.y - target.y <= above && target.y - pos.y <= radius;
}

export function touched(pos: Vec3, target: Vec3, radius: number): boolean {
  return Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z) <= radius;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function say(game: Game, id: string, who: string, texts: string[]): void {
  if (texts.length) game.bus.emit('quest:say', { id, lines: texts.map((text) => ({ who, text })) });
}

export function questWaypoint(game: Game): Waypoint | null {
  const w = game.waypoint as Waypoint | null;
  return w?.quest ? w : null;
}

export function pointTo(game: Game, target: Vec3, label: string): void {
  const w: Waypoint = { x: target.x, y: target.y, z: target.z, label, quest: true };
  game.waypoint = w;
}

export function guide(game: Game, target: Vec3 | null, label: string): void {
  if (game.waypoint && !questWaypoint(game)) return;
  if (target) pointTo(game, target, label);
  else game.waypoint = null;
}
