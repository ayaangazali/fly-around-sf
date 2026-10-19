import { describe, expect, it } from 'vitest';
import { kind, track, along } from '../../src/activities/kinds/ride-along';
import { loadDefs } from './helpers';
import { liveGame } from './live-helpers';
import type { ActivityDef, ActivityInstance } from '../../src/activities/types';

const rides = loadDefs().filter((d) => d.kind === 'ride-along');
const base: ActivityDef = { id: 'ride-along-test', kind: 'ride-along', title: 'Test ride', blurb: 'a test ride', neighborhood: 'Test', at: { lat: 37.8, lon: -122.42 }, params: { path: [[37.8, -122.42], [37.8009, -122.42]], speed: 5, model: 'powell' } };

function run(game: ReturnType<typeof liveGame>, def: ActivityDef, follow: boolean, seconds: number): { status: string; inst: ActivityInstance } {
  const inst = kind.start(def, game);
  let status = 'running';
  for (let t = 0; t < seconds && status === 'running'; t += 0.1) {
    if (follow) {
      const v = inst.targets!()[0];
      game.flight.pos = { x: v.x + 3, y: v.y - 2, z: v.z };
    }
    status = inst.update(0.1);
  }
  return { status, inst };
}

describe('ride-along activities', () => {
  it('[R-LIVE-TRANSIT] every ride follows a real GTFS route segment between 300 m and 3 km', () => {
    expect(rides.length).toBeGreaterThanOrEqual(12);
    for (const d of rides) {
      expect(kind.validate(d), d.id).toEqual([]);
      const t = track((d.params as { path: [number, number][] }).path);
      expect(t.length, d.id).toBeGreaterThan(300);
      expect(t.length, d.id).toBeLessThan(3000);
      expect(d.id.startsWith('ride-along-')).toBe(true);
      expect(d.at.lat).toBe((d.params as { path: number[][] }).path[0][0]);
    }
  });

  it('[R-KINDS] ride-along rejects bad params', () => {
    expect(kind.validate({ ...base, params: {} })).toHaveLength(3);
    expect(kind.validate({ ...base, params: { path: [[1, 'x'], [2, 3]], speed: 50, model: 'zeppelin', radius: 2 } })).toHaveLength(4);
    expect(kind.validate(base)).toEqual([]);
  });

  it('[R-RUNNER] staying on the vehicle tail completes the ride and the vehicle leaves the scene', () => {
    const game = liveGame('2026-10-19T19:30:00Z');
    const { status, inst } = run(game, base, true, 60);
    expect(status).toBe('done');
    expect(inst.progress()).toBe(1);
    expect(inst.elapsed!()).toBeGreaterThan(19);
    expect(inst.hud()).toContain('right on its tail');
    expect(game.scene.getObjectByName('ride-along-vehicle')).toBeDefined();
    inst.dispose!();
    expect(game.scene.getObjectByName('ride-along-vehicle')).toBeUndefined();
  });

  it('[R-RUNNER] falling behind for four seconds fails the ride', () => {
    const game = liveGame('2026-10-19T19:30:00Z');
    game.flight.pos = { x: 5000, y: 50, z: 5000 };
    const { status, inst } = run(game, base, false, 60);
    expect(status).toBe('failed');
    expect(inst.progress()).toBeLessThan(0.3);
    expect(inst.hud()).toContain('catch up!');
  });

  it('[R-ACT-ALL] the ride-along solver keeps the drone on the vehicle until the end', () => {
    const game = liveGame('2026-10-19T19:30:00Z');
    const def = rides.find((d) => d.id === 'ride-along-oakland-ferry')!;
    const inst = kind.start(def, game);
    Object.assign(game.activities, { active: { def, inst, t: 0 } });
    Object.assign(game, { teleport: (p: { x: number; y: number; z: number }) => (game.flight.pos = { ...p }) });
    let status = 'running';
    for (const step of kind.solve(def, game)) {
      if ('call' in step) step.call(game);
      if ('wait' in step) for (let t = 0; t < step.wait && status === 'running'; t += 1 / 30) status = inst.update(1 / 30);
      if (status !== 'running') break;
    }
    expect(status).toBe('done');
    const v = inst.targets!()[0];
    expect(v.y).toBe(0.05 + 8);
    expect(along(track([[37.8, -122.42], [37.8, -122.41]]), -5)).toEqual(along(track([[37.8, -122.42], [37.8, -122.41]]), 0));
  });
});
