import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Bus } from '../../src/core/bus';
import { SaveStore } from '../../src/core/save';
import { createFlight } from '../../src/player/flight';
import { toLocal } from '../../src/core/geo';
import { ActivityRunner } from '../../src/activities/runner';
import type { ActivityDef, ActivityKind, GeoPoint } from '../../src/activities/types';
import type { Game } from '../../src/game';

export const ROOT = new URL('../../', import.meta.url).pathname;

export function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

export function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

export function loadDefs(): ActivityDef[] {
  return walk(join(ROOT, 'src/content/activities'), '.json').flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as ActivityDef[]);
}

export async function loadKinds(): Promise<ActivityKind[]> {
  const files = walk(join(ROOT, 'src/activities/kinds'), '.ts');
  return Promise.all(files.map(async (f) => (await import(f)).kind as ActivityKind));
}

export function fakeGame(ground = 0): Game {
  const point = (g: GeoPoint, alt = 30) => {
    const { x, z } = toLocal(g.lat, g.lon);
    return { x, y: ground + (g.alt ?? alt), z };
  };
  const game = {
    bus: new Bus(),
    save: new SaveStore(memoryStorage()),
    flight: createFlight(0, 50, 0),
    world: { toLocal, groundAt: () => ground, surfaceAt: () => ground, heightAt: () => ground, point, isWater: () => false },
    input: { press() {}, consume: () => false },
    panels: { openId: null },
    toast() {},
  } as unknown as Game;
  (game as unknown as { activities: ActivityRunner }).activities = new ActivityRunner(game);
  return game;
}
