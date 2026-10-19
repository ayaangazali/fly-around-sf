import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers';
import { kind as delivery } from '../../src/activities/kinds/delivery';
import { kind as landing } from '../../src/activities/kinds/landing';
import { kind as collect, collectPoints } from '../../src/activities/kinds/collect';
import { kind as follow, along, buildRoute } from '../../src/activities/kinds/follow';
import { kind as chase } from '../../src/activities/kinds/chase';
import { kind as hover, gust } from '../../src/activities/kinds/hover';
import { kind as photo, viewfinder } from '../../src/activities/kinds/photo';
import { bestMedal, clock, formatTime, isMedals, medalFor, meters, rng, saveMedal, validateTimed, type MinigameInstance, type MinigameResult } from '../../src/activities/minigame';
import type { ActivityDef, ActivityKind, SolverStep } from '../../src/activities/types';
import type { Game } from '../../src/game';
import { stepFlight, type FlightInput } from '../../src/player/flight';

const DT = 1 / 30;
const base = { neighborhood: 'Test', blurb: 'a test minigame' };
const here = { lat: 37.79, lon: -122.41 };
const near = (dn: number, de = 0) => ({ lat: here.lat + dn / 111000, lon: here.lon + de / 88000 });

function game(): Game {
  const g = fakeGame();
  Object.assign(g.world, { collide: () => false });
  Object.assign(g, { env: {}, date: () => new Date('2026-10-19T19:30:00Z'), teleport: (p: { x: number; y: number; z: number }) => void (g.flight.pos = { ...p }) });
  return g;
}

function setup(k: ActivityKind, def: ActivityDef) {
  const g = game();
  g.activities.register([k], [def]);
  const results: MinigameResult[] = [];
  const fails: string[] = [];
  g.bus.on('minigame:result', (r) => results.push(r));
  g.bus.on('activity:fail', (e) => fails.push(e.id));
  return { g, results, fails };
}

function replay(g: Game, steps: SolverStep[], id: string): void {
  const tick = () => g.activities.update(DT);
  for (const s of steps) {
    if ('teleport' in s) g.flight.pos = { ...s.teleport };
    else if ('wait' in s) for (let t = 0; t < s.wait; t += DT) tick();
    else if ('call' in s) s.call(g);
    else if ('action' in s && s.action === 'photo') g.bus.emit('photo', { ...g.flight.pos, yaw: g.flight.yaw, pitch: viewfinder.tilt });
    else if ('fly' in s) for (let t = 0; t < s.seconds; t += DT) tick();
    if ('yaw' in s && s.yaw !== undefined) g.flight.yaw = s.yaw;
    tick();
    if (g.save.isDone(id)) return;
  }
  for (let i = 0; i < 10 && !g.save.isDone(id); i++) tick();
}

function win(k: ActivityKind, def: ActivityDef) {
  const ctx = setup(k, def);
  ctx.g.flight.pos = { ...ctx.g.activities.position(def) };
  expect(ctx.g.activities.start(def.id)).toBe(true);
  replay(ctx.g, k.solve(def, ctx.g), def.id);
  return ctx;
}

function idle(k: ActivityKind, def: ActivityDef, seconds: number, far = true) {
  const ctx = setup(k, def);
  ctx.g.flight.pos = far ? { x: 50000, y: 300, z: 50000 } : { ...ctx.g.activities.position(def) };
  ctx.g.activities.start(def.id);
  for (let t = 0; t < seconds && ctx.g.activities.active; t += DT) ctx.g.activities.update(DT);
  return ctx;
}

function pilot(g: Game, inst: MinigameInstance, ctl: (t: number) => Partial<FlightInput>, seconds: number): string {
  const env = { groundAt: () => 0, collide: () => false };
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepFlight(g.flight, { forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false, ...ctl(t) }, 1 / 60, env);
    const s = inst.update(1 / 60);
    if (s !== 'running') return s;
  }
  return 'running';
}

function chaseInput(g: Game, to: { x: number; y: number; z: number }, boost: boolean): Partial<FlightInput> {
  const f = g.flight;
  const err = Math.atan2(-(to.x - f.pos.x), -(to.z - f.pos.z)) - f.yaw;
  const turn = Math.atan2(Math.sin(err), Math.cos(err));
  const sign = (v: number, dead: number) => (v > dead ? 1 : v < -dead ? -1 : 0);
  return { forward: 1, boost, yaw: -sign(turn, 0.05), lift: sign(to.y - f.pos.y, 0.6) };
}

const deliveryDef: ActivityDef = { ...base, id: 'delivery-test', kind: 'delivery', title: 'Burrito Run', at: here, params: { pickup: { ...here, name: 'Taqueria' }, dropoff: { ...near(600), name: 'Park' }, item: 'burrito', timeLimit: 90, medals: [20, 40, 60] } };
const landingDef: ActivityDef = { ...base, id: 'landing-test', kind: 'landing', title: 'Roof', at: near(-200), params: { pad: { ...here, name: 'Roof' }, maxSpeed: 3, timeLimit: 60, medals: [10, 20, 40] } };
const collectDef: ActivityDef = { ...base, id: 'collect-test', kind: 'collect', title: 'Cookies', at: here, params: { item: 'cookies', prop: 'fortune-cookie', count: 6, radius: 120, timeLimit: 60, medals: [10, 20, 40] } };
const followDef: ActivityDef = { ...base, id: 'follow-test', kind: 'follow', title: 'Cable car', at: here, params: { route: [here, near(150), near(300, 50)], speed: 10, vehicle: 'cable-car', name: 'cable car', distance: 40, grace: 3, lead: 2 } };
const chaseDef: ActivityDef = { ...base, id: 'chase-test', kind: 'chase', title: 'Gull', at: here, params: { animal: 'seagull', name: 'gull', speed: 24, timeLimit: 60, medals: [10, 20, 40] } };
const hoverDef: ActivityDef = { ...base, id: 'hover-test', kind: 'hover', title: 'Hold', at: near(-100), params: { spot: { ...here, alt: 20, name: 'Summit' }, hold: 5, tolerance: 4, gust: 6, timeLimit: 40, medals: [8, 12, 20] } };
const photoDef: ActivityDef = { ...base, id: 'photo-test', kind: 'photo', title: 'Tower', at: near(-300), params: { subject: { ...here, alt: 30, name: 'Tower' }, distance: [150, 400], altitude: [40, 120], center: 7, timeLimit: 120 } };

const ALL: [ActivityKind, ActivityDef][] = [
  [delivery, deliveryDef],
  [landing, landingDef],
  [collect, collectDef],
  [follow, followDef],
  [chase, chaseDef],
  [hover, hoverDef],
  [photo, photoDef],
];

describe('minigame kinds', () => {
  it('[R-MINIGAMES] every minigame kind accepts its sample and rejects empty params', () => {
    for (const [k, def] of ALL) {
      expect(k.validate(def), k.kind).toEqual([]);
      expect(k.validate({ ...def, params: {} }).length, k.kind).toBeGreaterThan(1);
      expect(k.validate({ ...def, params: undefined }).length, k.kind).toBeGreaterThan(1);
    }
  });

  it('[R-MINIGAMES] every minigame kind can be won by its solver and records a best', () => {
    for (const [k, def] of ALL) {
      const { g, results } = win(k, def);
      expect(g.save.isDone(def.id), k.kind).toBe(true);
      expect(g.save.data.best[def.id], k.kind).toBeGreaterThan(0);
      expect(results.at(-1)?.medal, k.kind).toBeGreaterThan(0);
      expect(results.at(-1)?.fail, k.kind).toBeUndefined();
      expect(g.activities.active, k.kind).toBeNull();
    }
  });

  it('[R-MINIGAMES] every minigame kind can be lost and reports why', () => {
    for (const [k, def] of ALL) {
      const { g, results, fails } = idle(k, def, 200);
      expect(fails, k.kind).toEqual([def.id]);
      expect(g.save.isDone(def.id), k.kind).toBe(false);
      expect(results.at(-1)?.fail, k.kind).toMatch(/\w{4}/);
      expect(results.at(-1)?.fail, k.kind).not.toMatch(/—/);
    }
  });

  it('[R-MINIGAMES] hud, progress, targets and props stay well formed while running', () => {
    for (const [k, def] of ALL) {
      const g = game();
      g.flight.pos = { x: 0, y: 40, z: 0 };
      const inst = k.start(def, g) as MinigameInstance;
      for (let i = 0; i < 90; i++) inst.update(DT);
      expect(inst.hud(), k.kind).toContain(k.kind === 'photo' ? 'Tower' : '');
      expect(inst.hud(), k.kind).not.toMatch(/—|NaN|undefined/);
      expect(inst.progress(), k.kind).toBeGreaterThanOrEqual(0);
      expect(inst.progress(), k.kind).toBeLessThanOrEqual(1);
      expect(inst.targets?.().length, k.kind).toBeGreaterThan(0);
      for (const p of inst.props()) expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.yaw), k.kind).toBe(true);
      expect(inst.elapsed?.(), k.kind).toBeCloseTo(3, 0);
      inst.dispose?.();
    }
  });
});

describe('delivery', () => {
  it('[R-MINIGAMES] needs the pickup before the drop-off counts', () => {
    const { g } = setup(delivery, deliveryDef);
    g.activities.start(deliveryDef.id);
    g.flight.pos = { ...g.world.point(deliveryDef.params!.dropoff as { lat: number; lon: number }, 10) };
    g.activities.update(DT);
    expect(g.save.isDone(deliveryDef.id)).toBe(false);
    expect(g.activities.active?.inst.hud()).toContain('Pick up');
  });

  it('[R-MINIGAMES] a crash ruins a fragile item only after pickup', () => {
    const def: ActivityDef = { ...deliveryDef, id: 'delivery-fragile', params: { ...deliveryDef.params, fragile: true } };
    const { g, results, fails } = setup(delivery, def);
    g.activities.start(def.id);
    g.bus.emit('player:crash', { speed: 20 });
    g.activities.update(DT);
    expect(fails).toEqual([]);
    g.flight.pos = { ...g.world.point(def.params!.pickup as { lat: number; lon: number }, 10) };
    g.activities.update(DT);
    expect(g.activities.active?.inst.hud()).toContain('fragile');
    g.bus.emit('player:crash', { speed: 20 });
    g.activities.update(DT);
    expect(fails).toEqual([def.id]);
    expect(results.at(-1)?.fail).toContain('crash');
  });

  it('[R-MINIGAMES] rejects bad stops, items and radii', () => {
    const bad = delivery.validate({ ...deliveryDef, params: { ...deliveryDef.params, pickup: { lat: 1 }, item: '', radius: 2, medals: [3, 2, 1] } });
    expect(bad.join(' ')).toMatch(/pickup.*item.*radius.*medals/);
  });
});

describe('landing', () => {
  it('[R-MINIGAMES] a hard touchdown fails with the measured speed', () => {
    const { g, results, fails } = setup(landing, landingDef);
    g.activities.start(landingDef.id);
    const pad = g.world.point(landingDef.params!.pad as { lat: number; lon: number }, 0);
    g.flight.pos = { x: pad.x, y: pad.y + 10, z: pad.z };
    g.flight.vel = { x: 0, y: -9, z: 0 };
    g.activities.update(DT);
    g.flight.pos.y = pad.y + 1.3;
    g.activities.update(DT);
    expect(fails).toEqual([landingDef.id]);
    expect(results.at(-1)?.fail).toContain('9.0 m/s');
  });

  it('[R-MINIGAMES] feathered keyboard taps settle onto the pad, holding descend slams into it', () => {
    for (const start of [4, 4.3, 4.6, 4.9, 5.2, 5.5, 5.8]) {
      const g = game();
      const inst = landing.start(landingDef, g) as MinigameInstance;
      const pad = inst.targets!()[0];
      g.flight.pos = { x: pad.x, y: start, z: pad.z };
      let until = -1;
      const feather = (t: number) => {
        if (t >= until + 0.3 && Math.abs(g.flight.vel.y) < 0.6) until = t + 0.1;
        return { lift: t < until ? -1 : 0 };
      };
      expect(pilot(g, inst, feather, 30), `from ${start} m`).toBe('done');
    }
    const g = game();
    const results: MinigameResult[] = [];
    g.bus.on('minigame:result', (r) => results.push(r));
    const inst = landing.start(landingDef, g) as MinigameInstance;
    const pad = inst.targets!()[0];
    g.flight.pos = { x: pad.x, y: 15, z: pad.z };
    expect(pilot(g, inst, () => ({ lift: -1 }), 10)).toBe('failed');
    expect(results.at(-1)?.fail).toMatch(/^Hard landing at [4-9]\.\d m\/s/);
  });

  it('[R-MINIGAMES] warns about speed near the pad and lights it up', () => {
    const g = game();
    const inst = landing.start(landingDef, g) as MinigameInstance;
    const pad = g.world.point(landingDef.params!.pad as { lat: number; lon: number }, 0);
    g.flight.pos = { x: pad.x + 12, y: pad.y + 8, z: pad.z };
    g.flight.vel = { x: 6, y: 0, z: 0 };
    inst.update(DT);
    expect(inst.hud()).toContain('slow down');
    g.env.wind = { x: 6, z: 0 };
    expect(inst.hud()).not.toContain('slow down');
    expect(inst.props()[0].on).toBe(true);
    expect(landing.validate({ ...landingDef, params: { ...landingDef.params, maxSpeed: 40, padRadius: 50 } })).toHaveLength(2);
  });
});

describe('collect', () => {
  it('[R-MINIGAMES] places items deterministically above the ground inside the area', () => {
    const g = game();
    const a = collectPoints(collectDef, g);
    const b = collectPoints(collectDef, g);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
    const c = g.world.toLocal(here.lat, here.lon);
    for (const p of a) {
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeLessThanOrEqual(120);
      expect(p.y).toBeGreaterThanOrEqual(12);
    }
    expect(collectPoints({ ...collectDef, id: 'other' }, g)).not.toEqual(a);
  });

  it('[R-MINIGAMES] counts pickups, hides collected items and points at the nearest', () => {
    const g = game();
    const inst = collect.start(collectDef, g) as MinigameInstance;
    const pts = collectPoints(collectDef, g);
    g.flight.pos = { ...pts[2] };
    inst.update(DT);
    expect(inst.hud()).toContain('1/6');
    expect(inst.props()[2].on).toBe(false);
    expect(inst.targets?.()).toHaveLength(5);
    const t = inst.targets?.()[0];
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - pts[2].x, p.z - pts[2].z);
    for (const p of inst.targets?.() ?? []) expect(d(t!)).toBeLessThanOrEqual(d(p));
    expect(collect.validate({ ...collectDef, params: { ...collectDef.params, prop: 'unicorn', count: 2, alt: [1, 0] } })).toHaveLength(3);
  });
});

describe('follow', () => {
  it('[R-MINIGAMES] walks the route at the given speed and faces along it', () => {
    const g = game();
    const r = buildRoute(g, followDef.params!.route as { lat: number; lon: number }[]);
    expect(r.length).toBeGreaterThan(300);
    const out = { x: 0, z: 0, yaw: 0 };
    along(r, 75, out);
    expect(Math.hypot(out.x - r.pts[0].x, out.z - r.pts[0].z)).toBeCloseTo(75, 0);
    expect(out.yaw).toBeCloseTo(0, 1);
    along(r, 1e9, out);
    expect(out.x).toBeCloseTo(r.pts[2].x, 3);
  });

  it('[R-MINIGAMES] medal reflects how tight you stayed, and grace forgives short gaps', () => {
    const { g, results } = setup(follow, followDef);
    g.activities.start(followDef.id);
    for (let t = 0; t < 60 && g.activities.active; t += DT) {
      const c = g.activities.active.inst.targets!()[0];
      const far = t > 10 && t < 12;
      g.flight.pos = { x: c.x + (far ? 60 : 30), y: c.y, z: c.z };
      g.activities.update(DT);
      if (far) expect(g.activities.active?.inst.hud() ?? '').toMatch(/too far|^$/);
    }
    expect(g.save.isDone(followDef.id)).toBe(true);
    expect(results.at(-1)?.medal).toBe(1);
    expect(results.at(-1)?.score).toContain('%');
  });

  it('[R-MINIGAMES] counts down before the vehicle moves', () => {
    const g = game();
    const inst = follow.start(followDef, g) as MinigameInstance;
    inst.update(DT);
    expect(inst.hud()).toContain('starts in 2');
    expect(follow.validate({ ...followDef, params: { ...followDef.params, vehicle: 'rocket', distance: 2 } })).toHaveLength(2);
  });
});

describe('chase', () => {
  it('[R-MINIGAMES] the bird flees when you close in, stays above roofs and inside its arena', () => {
    const g = game();
    const inst = chase.start(chaseDef, g) as MinigameInstance;
    const bird = inst.targets!()[0];
    const home = g.world.point(chaseDef.at, 40);
    const before = { ...bird };
    g.flight.pos = { x: bird.x, y: bird.y, z: bird.z + 40 };
    for (let i = 0; i < 30; i++) inst.update(DT);
    expect(bird.z).toBeLessThan(before.z);
    g.flight.pos = { x: 1e5, y: 50, z: 1e5 };
    for (let i = 0; i < 1800; i++) {
      inst.update(DT);
      expect(bird.y).toBeGreaterThanOrEqual(8);
      expect(Math.hypot(bird.x - home.x, bird.z - home.z)).toBeLessThan(320 * 1.5);
    }
  });

  it('[R-MINIGAMES] a full-boost lunge overshoots the bird, steady pursuit wears it down', () => {
    const run = (seed: string, boostBeyond: number) => {
      const def = { ...chaseDef, id: `chase-${seed}` };
      const g = game();
      const inst = chase.start(def, g) as MinigameInstance;
      g.flight.pos = { ...g.world.point(def.at, 30) };
      let t = 0;
      const status = pilot(g, inst, (now) => {
        t = now;
        const b = inst.targets!()[0];
        return chaseInput(g, b, Math.hypot(b.x - g.flight.pos.x, b.z - g.flight.pos.z) > boostBeyond);
      }, 60);
      return { status, t };
    };
    const seeds = [...'abcdefghij'];
    const steady = seeds.map((s) => run(s, 25));
    expect(steady.every((r) => r.status === 'done' && r.t > 6)).toBe(true);
    expect(seeds.filter((s) => run(s, 0).status === 'done').length).toBeLessThanOrEqual(5);
  });
});

describe('hover', () => {
  it('[R-MINIGAMES] gusts push the drone, and time outside the zone drains the hold', () => {
    const g = game();
    const inst = hover.start(hoverDef, g) as MinigameInstance;
    const spot = inst.targets!()[0];
    g.flight.pos = { ...spot };
    g.flight.vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 60; i++) inst.update(DT);
    expect(Math.hypot(g.flight.vel.x, g.flight.vel.z)).toBeGreaterThan(0.1);
    expect(inst.hud()).toMatch(/hold 2\.\d\/5s/);
    g.flight.pos = { ...spot, y: spot.y + 30 };
    for (let i = 0; i < 30; i++) inst.update(DT);
    expect(inst.hud()).toMatch(/hold 1\.\d\/5s/);
    const a = gust(1, [0, 1, 2], 6);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(6);
    expect(hover.validate({ ...hoverDef, params: { ...hoverDef.params, timeLimit: 4, tolerance: 0.5, gust: 50 } })).toHaveLength(4);
  });
});

describe('medals', () => {
  it('[R-MEDALS] medal thresholds map times to gold, silver, bronze and none', () => {
    expect(medalFor([10, 20, 30], 9)).toBe(3);
    expect(medalFor([10, 20, 30], 15)).toBe(2);
    expect(medalFor([10, 20, 30], 30)).toBe(1);
    expect(medalFor([10, 20, 30], 31)).toBe(0);
    expect(medalFor(undefined, 1)).toBe(0);
    expect(isMedals([1, 2, 3])).toBe(true);
    expect(isMedals([3, 2, 1])).toBe(false);
    expect(isMedals([1, 2])).toBe(false);
  });

  it('[R-MEDALS] the best medal is kept and never downgraded', () => {
    const g = game();
    expect(bestMedal(g.save, 'x')).toBe(0);
    expect(saveMedal(g.save, 'x', 2)).toBe(true);
    expect(saveMedal(g.save, 'x', 1)).toBe(false);
    expect(saveMedal(g.save, 'x', 3)).toBe(true);
    expect(bestMedal(g.save, 'x')).toBe(3);
  });

  it('[R-MEDALS] timed params need a limit and bronze inside it', () => {
    const e: string[] = [];
    validateTimed({ timeLimit: 10, medals: [5, 8, 12] }, e);
    validateTimed({}, e);
    validateTimed({ timeLimit: -1 }, e);
    validateTimed({}, e, false);
    expect(e).toEqual(['params.medals bronze must fit inside timeLimit', 'params.timeLimit must be > 0', 'params.timeLimit must be > 0']);
  });

  it('[R-MEDALS] formats times, clocks and distances for the HUD', () => {
    expect(formatTime(9.04)).toBe('9.0s');
    expect(formatTime(83.45)).toBe('1:23.5');
    expect(clock(30, 90)).toBe('1:00 left');
    expect(clock(85.5, 90)).toBe('4.5s left');
    expect(clock(5, undefined)).toBe('5.0s');
    expect(meters(420.4)).toBe('420 m');
    expect(meters(2400)).toBe('2.4 km');
    const r1 = rng('seed');
    const r2 = rng('seed');
    expect([r1(), r1()]).toEqual([r2(), r2()]);
  });
});
