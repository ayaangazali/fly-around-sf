import type { ActivityDef, ActivityKind } from '../types';
import type { Game } from '../../game';
import { FLIGHT, type Vec3 } from '../../player/flight';
import { lift, spot } from '../minigame';

export type Landing = 'roof' | 'ground' | 'ring';

export interface TrailParams {
  order: number;
  land: Landing;
  clue: string;
  fact: string;
  radius: number;
  heading?: number;
  sources: string[];
}

const LANDINGS: Landing[] = ['roof', 'ground', 'ring'];
export const SLOW = 12;
export const LOW = 20;
const ON_ROOF = 4;
const SCAN = 400;

export const trailParams = (def: ActivityDef): TrailParams => def.params as unknown as TrailParams;

const cache = new WeakMap<Game, { size: number; stops: ActivityDef[] }>();

export function trailStops(game: Game): ActivityDef[] {
  const size = game.activities.defs.size;
  let c = cache.get(game);
  if (c?.size !== size) {
    const stops = game.activities
      .list()
      .filter((d) => d.kind === 'trail')
      .sort((a, b) => trailParams(a).order - trailParams(b).order);
    cache.set(game, (c = { size, stops }));
  }
  return c.stops;
}

export function currentStop(game: Game): ActivityDef | null {
  return trailStops(game).find((d) => !game.save.isDone(d.id)) ?? null;
}

export function trailPoint(def: ActivityDef, game: Game): Vec3 {
  const { land } = trailParams(def);
  if (land === 'ground') return spot(game, def.at, 0);
  const { x, z } = game.world.toLocal(def.at.lat, def.at.lon);
  if (land === 'ring') return { x, y: Math.max(0, game.world.surfaceAt(x, z)) + (def.at.alt ?? 0), z };
  const ground = game.world.groundAt(x, z);
  for (let y = ground + SCAN; y > ground; y -= 2) if (game.world.collide({ x, y, z }, 0.05)) return lift(game, x, y, z, 0);
  return { x, y: ground, z };
}

export function arrived(game: Game, def: ActivityDef, target: Vec3): boolean {
  const { land, radius } = trailParams(def);
  const { pos, vel } = game.flight;
  if (land === 'ring') return Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z) <= radius;
  if (Math.hypot(pos.x - target.x, pos.z - target.z) > radius || Math.hypot(vel.x, vel.z) > SLOW) return false;
  const floor = game.world.surfaceAt(pos.x, pos.z);
  const feet = pos.y - FLIGHT.radius;
  if (land === 'ground') return feet - floor < LOW;
  const resting = feet - floor < 0.6 || game.world.collide({ x: pos.x, y: pos.y - 0.5, z: pos.z }, FLIGHT.radius);
  return resting && feet > Math.min(target.y, floor + ON_ROOF) - 1;
}

export const kind: ActivityKind = {
  kind: 'trail',
  label: 'Founder Trail',
  icon: '⭐',
  passive: true,
  validate(def) {
    const p = def.params as Partial<TrailParams> | undefined;
    const errors: string[] = [];
    if (!Number.isInteger(p?.order) || (p?.order as number) < 1) errors.push('params.order must be a positive integer');
    if (!LANDINGS.includes(p?.land as Landing)) errors.push('params.land must be roof, ground or ring');
    for (const key of ['clue', 'fact'] as const) if (typeof p?.[key] !== 'string' || p[key].length < 20) errors.push(`params.${key} must be a sentence`);
    if (!(typeof p?.radius === 'number' && p.radius >= 5 && p.radius <= 80)) errors.push('params.radius must be 5..80 m');
    if (p?.heading !== undefined && !Number.isFinite(p.heading)) errors.push('params.heading must be degrees');
    if (!Array.isArray(p?.sources) || !p.sources.length || p.sources.some((s) => typeof s !== 'string' || !s.startsWith('https://'))) errors.push('params.sources needs https links');
    if (p?.land === 'ring' && !((def.at.alt ?? 0) > 0)) errors.push('a ring stop needs at.alt');
    if (!def.card) errors.push('a trail stop grants a card');
    return errors;
  },
  position: trailPoint,
  start(def, game) {
    const target = game.activities.position(def);
    let done = false;
    return {
      update() {
        done ||= arrived(game, def, target);
        return done ? 'done' : 'running';
      },
      progress: () => (done ? 1 : 0),
      hud: () => def.title,
      targets: () => [target],
    };
  },
  solve(def, game) {
    const t = game.activities.position(def);
    const lift = trailParams(def).land === 'ring' ? 0 : FLIGHT.radius + 0.1;
    return [{ teleport: { ...t, y: t.y + lift } }, { wait: 0.2 }];
  },
};
