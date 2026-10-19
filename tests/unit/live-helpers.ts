import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { fakeGame, ROOT } from './helpers';
import type { Game } from '../../src/game';

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/live', name), 'utf8'));
}

export function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) });
}

export function liveGame(at: string, test = false): Game & { toasts: string[] } {
  const g = fakeGame() as Game & { toasts: string[] };
  const toasts: string[] = [];
  Object.assign(g, {
    toasts,
    opts: { test, base: './' },
    env: { groundAt: () => 0, collide: () => false },
    sky: { fogDensity: 1, night: 0 },
    chase: { shake: 0 },
    scene: new THREE.Scene(),
    simTime: 0,
    date: () => new Date(Date.parse(at) + g.simTime * 1000),
    toast: (t: string) => void toasts.push(t),
  });
  return g;
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
