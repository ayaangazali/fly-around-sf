import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fakeGame, walk } from './helpers';
import { Terrain } from '../../src/world/terrain';
import { CityData } from '../../src/world/city-data';
import { World } from '../../src/world/world';
import { collectPoints } from '../../src/activities/kinds/collect';
import { buildRoute, along } from '../../src/activities/kinds/follow';
import { isMedals } from '../../src/activities/minigame';
import { kind as photo, lineBlocked, scoreShot, subjectPoint, viewfinder, type PhotoParams } from '../../src/activities/kinds/photo';
import type { SolverStep } from '../../src/activities/types';
import type { ActivityDef, GeoPoint } from '../../src/activities/types';
import type { Game } from '../../src/game';

type Def = ActivityDef & { sources?: string[] };

const files = walk(join(ROOT, 'src/content/activities'), '.json').filter((f) => /mini-[a-z]+\.json$/.test(f));
const defs: Def[] = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Def[]);
const byKind = (k: string) => defs.filter((d) => d.kind === k);

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

function realWorld(): { world: World; city: CityData; terrain: Terrain; game: Game } {
  const buf = (f: string) => {
    const b = readFileSync(join(ROOT, f));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const terrain = Terrain.parse(buf('public/data/terrain.bin'));
  const city = new CityData(buf('public/data/city.bin'), (x, z) => Math.max(0, terrain.heightAt(x, z)));
  const world = new World(terrain, city);
  const game = fakeGame();
  (game as unknown as { world: World }).world = world;
  return { world, city, terrain, game };
}

describe('minigame content', () => {
  it('[R-MINI-CONTENT] ships the promised number of minigames per kind', () => {
    const want: Record<string, number> = { rings: 30, photo: 25, delivery: 20, landing: 15, collect: 15, follow: 10, chase: 10, hover: 8 };
    for (const [k, n] of Object.entries(want)) expect(byKind(k).length, k).toBeGreaterThanOrEqual(n);
  });

  it('[R-MINI-CONTENT] every minigame cites sources and visible text has no em dashes', () => {
    for (const d of defs) {
      expect(d.sources?.length, d.id).toBeGreaterThan(0);
      for (const s of d.sources ?? []) expect(s, d.id).toMatch(/^https:\/\/(en\.wikipedia\.org|www\.openstreetmap\.org)\//);
      for (const s of strings({ title: d.title, blurb: d.blurb, neighborhood: d.neighborhood, params: d.params })) expect(s, d.id).not.toMatch(/—|–/);
      expect(d.id.startsWith(`${d.kind}-`), d.id).toBe(true);
    }
  });

  it('[R-MEDALS] every timed minigame has ordered medals that fit its time limit', () => {
    for (const d of defs.filter((x) => x.kind !== 'photo' && x.kind !== 'follow')) {
      const p = d.params as { medals?: unknown; timeLimit?: number };
      expect(isMedals(p.medals), d.id).toBe(true);
      expect((p.medals as number[])[2], d.id).toBeLessThanOrEqual(p.timeLimit as number);
    }
  });
});

describe('minigame flyability against the real city', () => {
  const { world, city, terrain, game } = realWorld();
  const clear = (p: { x: number; y: number; z: number }, r: number) => !world.collide({ ...p }, r);

  it('[R-FLYABLE] no ring, start, stop or hover spot sits inside a building', () => {
    for (const d of defs) {
      expect(clear(world.point(d.at, 30), 2), `${d.id} start`).toBe(true);
      const p = d.params as Record<string, unknown>;
      if (d.kind === 'rings') for (const g of p.rings as GeoPoint[]) expect(clear(world.point({ alt: 25, ...g }), ((p.radius as number) ?? 14) * 0.6), `${d.id} ring`).toBe(true);
      if (d.kind === 'delivery') for (const g of [p.pickup, p.dropoff] as GeoPoint[]) expect(clear(world.point(g, 10), 3), `${d.id} stop`).toBe(true);
      if (d.kind === 'hover') expect(clear(world.point(p.spot as GeoPoint, 40), ((p.tolerance as number) ?? 4) + 1), d.id).toBe(true);
      if (d.kind === 'collect') for (const q of collectPoints(d, game)) expect(clear(q, 1.5), `${d.id} item`).toBe(true);
    }
  });

  it('[R-FLYABLE] landing pads sit fully on a real rooftop', () => {
    for (const d of byKind('landing')) {
      const p = d.params as { pad: GeoPoint; padRadius?: number };
      const { x, z } = world.toLocal(p.pad.lat, p.pad.lon);
      const roof = city.roofAt(x, z);
      expect(roof - terrain.heightAt(x, z), d.id).toBeGreaterThan(4);
      const r = p.padRadius ?? 5;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        expect(city.roofAt(x + Math.cos(a) * r, z + Math.sin(a) * r), d.id).toBeCloseTo(roof, 0);
      }
    }
  });

  it('[R-PHOTO] every photo challenge has an open viewpoint that scores three stars in the real city', () => {
    const sun = { day: 40, golden: 4, night: -20 };
    for (const d of byKind('photo')) {
      const p = d.params as unknown as PhotoParams;
      const [go, aim] = photo.solve(d, game) as [Extract<SolverStep, { teleport: unknown }>, Extract<SolverStep, { call: unknown }>];
      aim.call(game);
      const s = subjectPoint(game, p);
      expect(clear(go.teleport, 2), d.id).toBe(true);
      expect(scoreShot(p, { ...go.teleport, yaw: go.yaw ?? 0, pitch: viewfinder.tilt }, s, sun[p.time ?? 'day'], lineBlocked(game, go.teleport, s, p.clear ?? 30)).stars, d.id).toBe(3);
    }
  });

  it('[R-FLYABLE] boats stay on water and ground vehicles stay on the street', () => {
    for (const d of byKind('follow')) {
      const p = d.params as { route: GeoPoint[]; vehicle: string; alt?: number };
      const route = buildRoute(game, p.route);
      const o = { x: 0, z: 0, yaw: 0 };
      let blocked = 0;
      for (let s = 0; s <= route.length; s += 8) {
        along(route, s, o);
        if (p.vehicle === 'ferry' || p.vehicle === 'sailboat') expect(terrain.heightAt(o.x, o.z), `${d.id} at ${s} m`).toBeLessThan(-1);
        if (!clear({ x: o.x, y: world.surfaceAt(o.x, o.z) + (p.alt ?? 0) + 3, z: o.z }, 1.2)) blocked++;
      }
      expect(blocked, d.id).toBeLessThanOrEqual(1);
    }
  });
});
