import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { blockState, dayType, nearestStop, nextPass, parseTransit, pointAt, vehiclesAt, type Route, type Shape } from '../../src/live/transit';
import { sfTime } from '../../src/live/sf-time';
import { EXTENT, toLocal } from '../../src/core/geo';
import { modelFor, place, system } from '../../src/systems/live-transit';
import { liveState } from '../../src/live/state';
import { MODELS } from '../../src/live/models';
import { nextCableCar } from '../../src/ui/panels/live';
import { ROOT } from './helpers';
import { liveGame, respond, tick } from './live-helpers';

const raw = JSON.parse(readFileSync(join(ROOT, 'public/data/transit.json'), 'utf8'));
const data = parseTransit(raw);
const route = (id: string) => data.routes.find((r) => r.id === id)!;
const at = (iso: string) => sfTime(new Date(iso));

const line: Shape = { x: new Float32Array([0, 100, 100]), z: new Float32Array([0, 0, -50]), d: new Float32Array([0, 100, 150]), length: 150, stops: [] };
const toy: Route = { id: 'T', name: 'Toy', mode: 'cable', agency: 'Test', color: '#fff', shapes: [line, line], days: { wkd: [[0, 3600, 600, 1, 4800, 600]], sat: [], sun: [[0, 86000, 1200]] } };

afterEach(() => vi.unstubAllGlobals());

describe('live transit', () => {
  it('[R-LIVE-TRANSIT] the baked GTFS file has the cable cars, the F-line, Muni lines and ferries', () => {
    expect(data.routes.map((r) => r.id)).toEqual(expect.arrayContaining(['PH', 'PM', 'CA', 'F', '1', '5', '14', '22', '30', '38', 'LSSF-271', 'SSSF-271', '11114', '11110']));
    expect(new Set(data.routes.map((r) => r.mode))).toEqual(new Set(['cable', 'streetcar', 'bus', 'ferry']));
    expect(data.sources.every((s) => s.startsWith('https://'))).toBe(true);
    for (const r of data.routes.filter((r) => r.mode !== 'ferry')) {
      for (const s of r.shapes) {
        for (let i = 0; i < s.x.length; i++) {
          expect(s.x[i]).toBeGreaterThan(EXTENT.minX);
          expect(s.x[i]).toBeLessThan(EXTENT.maxX);
          expect(s.z[i]).toBeGreaterThan(EXTENT.minZ);
          expect(s.z[i]).toBeLessThan(EXTENT.maxZ);
        }
      }
    }
    expect(route('PH').shapes.some((s) => s.stops.some((st) => /Hyde St/.test(st.name)))).toBe(true);
  });

  it('[R-LIVE-TRANSIT] cable car runs average a believable speed under the 9.5 mph cable', () => {
    for (const id of ['PH', 'PM', 'CA']) {
      const r = route(id);
      const speeds = r.days.wkd.flatMap((b) => {
        const out: number[] = [];
        for (let i = 0; i < b.length; i += 3) out.push(r.shapes[b[i]].length / b[i + 2]);
        return out;
      });
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      expect(mean, id).toBeGreaterThan(1);
      expect(mean, id).toBeLessThan(4.25);
    }
  });

  it('[R-LIVE-TRANSIT] vehicles follow SF time: cable cars at lunchtime, owl buses only at 3 am', () => {
    const lunch = at('2026-10-19T19:30:00Z');
    expect(lunch).toMatchObject({ dow: 1, hour: 12 });
    expect(vehiclesAt(route('PH'), lunch).length).toBeGreaterThanOrEqual(5);
    expect(vehiclesAt(route('F'), lunch).length).toBeGreaterThanOrEqual(5);
    const owl = at('2026-10-19T10:00:00Z');
    expect(owl.hour).toBe(3);
    expect(vehiclesAt(route('PH'), owl)).toEqual([]);
    expect(vehiclesAt(route('14'), owl).length).toBeGreaterThan(0);
    expect(vehiclesAt(route('LSSF-271'), owl)).toEqual([]);
    const sat = at('2026-10-24T20:00:00Z');
    expect(dayType(sat.dow)).toBe('sat');
    expect(vehiclesAt(route('PH'), sat).length).toBeGreaterThan(0);
  });

  it('[R-LIVE-TRANSIT] block math moves, parks at layovers and carries trips past midnight', () => {
    const b = toy.days.wkd[0];
    expect(blockState(b, 3000)).toBeNull();
    expect(blockState(b, 3900)).toEqual({ shape: 0, frac: 0.5, moving: true });
    expect(blockState(b, 4500)).toEqual({ shape: 0, frac: 1, moving: false });
    expect(blockState(b, 5100)).toEqual({ shape: 1, frac: 0.5, moving: true });
    expect(blockState(b, 6000)).toBeNull();
    expect(blockState([], 0)).toBeNull();
    const monday = { month: 10, day: 19, dow: 1, hour: 0, secs: 200 };
    const v = vehiclesAt(toy, monday);
    expect(v).toHaveLength(1);
    expect(v[0].key).toBe('T:y:0');
    expect(v[0].dist).toBeCloseTo(((86400 + 200 - 86000) / 1200) * 150, 6);
  });

  it('[R-LIVE-TRANSIT] points, headings, next passes and nearest stops along a shape', () => {
    expect(pointAt(line, 50)).toEqual({ x: 50, z: 0, heading: -Math.PI / 2 });
    expect(pointAt(line, 125).z).toBeCloseTo(-25, 6);
    expect(pointAt(line, 125).heading).toBeCloseTo(0, 6);
    expect(pointAt(line, -10).x).toBe(0);
    expect(pointAt(line, 999).z).toBeCloseTo(-50, 6);
    const mon = { month: 10, day: 19, dow: 1, hour: 1, secs: 3700 };
    expect(nextPass(toy, 0, 75, mon)).toBe(3600 + 300 - 3700);
    expect(nextPass(toy, 1, 0, mon)).toBe(4800 - 3700);
    expect(nextPass(toy, 0, 75, { ...mon, secs: 70000 })).toBe(86400 + 3900 - 70000);
    expect(nextPass({ ...toy, days: { wkd: [], sat: [], sun: [] } }, 0, 75, mon)).toBeNull();
    expect(nextPass(toy, 0, 0, { month: 10, day: 18, dow: 0, hour: 23, secs: 85000 })).toBe(1000);
    const hyde = toLocal(37.8016, -122.4189);
    const near = nearestStop([route('PH')], hyde.x, hyde.z)!;
    expect(near.dist).toBeLessThan(150);
    expect(near.stop.name).toMatch(/Hyde/);
    expect(nearestStop([], 0, 0)).toBeNull();
  });

  it('[R-LIVE-TRANSIT] rejects broken transit files', () => {
    expect(() => parseTransit({ v: 2 })).toThrow();
    expect(() => parseTransit({ ...raw, routes: [{ ...raw.routes[0], mode: 'zeppelin' }] })).toThrow();
    expect(() => parseTransit({ ...raw, routes: [{ ...raw.routes[0], shapes: [{ pts: [1, 2], stops: [] }] }] })).toThrow();
    expect(() => parseTransit({ ...raw, routes: [{ ...raw.routes[0], days: { wkd: [], sat: [] } }] })).toThrow();
    expect(() => parseTransit({ ...raw, routes: [{ ...raw.routes[0], days: { wkd: [[99, 0, 60]], sat: [], sun: [] } }] })).toThrow();
  });

  it('[R-LIVE-TRANSIT] vehicles sit on the ground, tilt up hills and ferries float', () => {
    const v = { key: 'k', route: toy, shape: line, dist: 50, moving: true };
    const flat = place(v, 10, () => 5);
    expect(flat).toMatchObject({ x: 50, y: 5, z: 0, pitch: 0 });
    const hill = place(v, 10, (x) => x * 0.2);
    expect(hill.pitch).toBeCloseTo(Math.atan(0.2), 6);
    expect(place({ ...v, route: route('LSSF-271') }, 10, () => 50).y).toBe(0);
    expect(modelFor(route('CA'))).toBe('california');
    expect(modelFor(route('PH'))).toBe('powell');
    expect(modelFor(route('F'))).toBe('streetcar');
    expect(modelFor(route('14'))).toBe('trolley');
    expect(modelFor(route('38'))).toBe('bus');
    expect(modelFor(route('11114'))).toBe('catamaran');
    expect(modelFor(route('SSSF-271'))).toBe('ferry');
    for (const m of Object.values(MODELS)) expect(m.paint.boundingSphere!.radius).toBeLessThan(m.length);
  });

  it('[R-LIVE-TRANSIT] the transit system instances vehicles, tells you the next cable car and hands out spotter cards', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(raw)));
    const game = liveGame('2026-10-19T19:30:00Z');
    Object.assign(game.world, { city: { roofAt: () => -Infinity } });
    await system.init!(game);
    await tick();
    await tick();
    system.update!(1 / 30, game);
    const s = liveState(game);
    expect(s.transit.status).toBe('schedule');
    const cars = s.transit.vehicles.filter((v) => v.mode === 'cable');
    expect(cars.length).toBeGreaterThanOrEqual(10);
    const meshes = (game.scene.getObjectByName('live-transit') as THREE.Group).children as THREE.InstancedMesh[];
    expect(meshes.reduce((n, m) => n + m.count, 0)).toBeGreaterThan(s.transit.vehicles.length * 3);
    const hyde = toLocal(37.8016, -122.4189);
    game.flight.pos = { x: hyde.x, y: 60, z: hyde.z };
    const next = nextCableCar(data.routes, game)!;
    expect(next.stop).toMatch(/Hyde/);
    expect(next.text).toMatch(/^Powell-Hyde toward .+ (in \d+ min|arriving now)$/);
    game.flight.pos = { x: cars[0].x, y: cars[0].y + 3, z: cars[0].z };
    system.update!(0, game);
    expect(game.save.data.cards).toContain('cable-car-spotter');
  });

  it('[R-LIVE-FALLBACK] a missing transit file reports fallback instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(null, false)));
    const game = liveGame('2026-10-19T19:30:00Z');
    const events: string[] = [];
    game.bus.on('live:status', (e) => events.push(`${e.id}:${e.status}`));
    await system.init!(game);
    await tick();
    await tick();
    system.update!(1 / 30, game);
    expect(liveState(game).transit.status).toBe('fallback');
    expect(events).toEqual(['transit:fallback']);
  });
});
