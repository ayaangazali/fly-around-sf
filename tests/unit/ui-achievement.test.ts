import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fakeGame } from './helpers';
import { kind, achievementProgress, metricValue, METRICS, type AchievementParams } from '../../src/activities/kinds/achievement';
import { stepFlight } from '../../src/player/flight';
import type { ActivityDef, ActivityKind, SolverStep } from '../../src/activities/types';
import type { Game } from '../../src/game';

const defs = JSON.parse(readFileSync(join(ROOT, 'src/content/activities/achievements.json'), 'utf8')) as ActivityDef[];

const stub: ActivityKind = {
  kind: 'stub',
  label: 'Stub',
  icon: '.',
  validate: () => [],
  start: () => ({ update: () => 'running', progress: () => 0, hud: () => '' }),
  solve: () => [],
};

const HOODS = ['Mission', 'Marina', 'Sunset', 'Richmond', 'SoMa', 'Presidio'];

function game(): Game {
  const g = fakeGame();
  const any = g as unknown as Record<string, unknown>;
  any.clockOffset = 0;
  any.date = () => new Date(Date.parse('2026-10-19T19:30:00Z') + g.clockOffset);
  any.teleport = (p: Game['flight']['pos']) => {
    g.flight.pos = { ...p };
    g.flight.vel = { x: 0, y: 0, z: 0 };
  };
  any.panels = { open: (id: string) => g.bus.emit('panel:open', { id }), close: () => undefined };
  (g.world as unknown as Record<string, unknown>).isWater = () => true;
  const extra = HOODS.map((n, i) => ({ id: `stub-${i}`, kind: 'stub', title: `Stub ${i}`, blurb: 'A stub activity', neighborhood: n, at: { lat: 37.77, lon: -122.42 } }));
  g.activities.register([kind, stub], [...defs, ...extra]);
  return g;
}

function replay(g: Game, steps: SolverStep[]): void {
  for (const s of steps) {
    if ('teleport' in s) g.teleport(s.teleport, s.yaw);
    else if ('call' in s) s.call(g);
    else if ('fly' in s) {
      for (let t = 0; t < s.seconds; t += 1 / 30) {
        const r = stepFlight(g.flight, { forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false, ...s.fly }, 1 / 30, { groundAt: () => -20, collide: () => false });
        if (r.splashed) g.bus.emit('player:splash', {});
        g.activities.update(1 / 30);
      }
    } else if ('wait' in s) g.activities.update(s.wait);
    g.activities.update(1 / 30);
  }
}

describe('achievements', () => {
  it('[R-ACHIEVEMENTS] ships at least 30 valid achievements with unique ids and titles', () => {
    expect(defs.length).toBeGreaterThanOrEqual(30);
    const g = fakeGame();
    expect(g.activities.register([kind], defs)).toEqual([]);
    expect(new Set(defs.map((d) => d.title)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.kind).toBe('achievement');
      expect(`${d.title} ${d.blurb}`).not.toMatch(/—/);
      expect(METRICS).toContain((d.params as unknown as AchievementParams).metric);
    }
  });

  it('[R-ACHIEVEMENTS] validate rejects bad params', () => {
    const base = defs[0];
    expect(kind.validate({ ...base, params: undefined })).toHaveLength(2);
    expect(kind.validate({ ...base, params: { metric: 'distance', gte: 0 } })).toEqual(['params.gte must be > 0']);
    expect(kind.validate({ ...base, params: { metric: 'panel', gte: 1 } })).toEqual(['params.panel is required for the panel metric']);
    expect(kind.validate({ ...base, id: 'medal-x' })).toEqual(['id must start with achievement-']);
    expect(kind.passive).toBe(true);
  });

  for (const d of defs) {
    it(`[R-ACHIEVEMENTS] solver unlocks ${d.id}`, () => {
      const g = game();
      g.activities.update(1 / 30);
      expect(g.save.isDone(d.id)).toBe(false);
      replay(g, kind.solve(d, g));
      for (let i = 0; i < 3; i++) g.activities.update(1 / 30);
      expect(g.save.isDone(d.id)).toBe(true);
      expect(achievementProgress(d, g)).toBe(1);
    });
  }

  it('[R-ACHIEVEMENTS] unlocks from real stats exactly once and grants XP once', () => {
    const g = game();
    const def = defs.find((d) => d.id === 'achievement-first-kilometer')!;
    const done: string[] = [];
    g.bus.on('activity:complete', ({ id }) => done.push(id));
    g.activities.update(1 / 30);
    expect(achievementProgress(def, g)).toBe(0);
    g.save.data.stats.distance = 500;
    g.activities.update(1 / 30);
    expect(achievementProgress(def, g)).toBeCloseTo(0.5);
    g.save.data.stats.distance = 1200;
    const xp = g.save.data.xp;
    for (let i = 0; i < 5; i++) g.activities.update(1 / 30);
    expect(done.filter((id) => id === def.id)).toHaveLength(1);
    expect(g.save.data.xp).toBe(xp + (def.xp ?? 10));
  });

  it('[R-ACHIEVEMENTS] counts only real completions of the right kind and neighborhoods', () => {
    const g = game();
    g.save.complete('achievement-first-kilometer');
    g.save.complete('rings-a');
    g.save.complete('discover-b');
    g.save.complete('stub-0');
    g.save.complete('stub-1');
    expect(metricValue({ metric: 'completed', gte: 1 }, g)).toBe(4);
    expect(metricValue({ metric: 'completed', gte: 1, kind: 'rings' }, g)).toBe(1);
    expect(metricValue({ metric: 'neighborhoods', gte: 1 }, g)).toBe(2);
  });

  it('[R-ACHIEVEMENTS] event achievements count their events and stop listening when done', () => {
    const g = game();
    const def = defs.find((d) => (d.params as unknown as AchievementParams).metric === 'panel')!;
    const inst = kind.start(def, g);
    expect(inst.update(0)).toBe('running');
    expect(inst.progress()).toBe(0);
    expect(inst.hud()).toBe(def.title);
    g.bus.emit('panel:open', { id: 'not-this-one' });
    expect(inst.update(0)).toBe('running');
    g.bus.emit('panel:open', { id: (def.params as unknown as AchievementParams).panel! });
    expect(inst.update(0)).toBe('done');
    expect(achievementProgress(def, g)).toBe(0);
  });
});
