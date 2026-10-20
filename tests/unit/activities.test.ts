import { describe, expect, it } from 'vitest';
import { BOUNDS, toLocal } from '../../src/core/geo';
import { fakeGame, loadDefs, loadKinds } from './helpers';
import type { ActivityDef } from '../../src/activities/types';

describe('activity content', async () => {
  const kinds = await loadKinds();
  const defs = loadDefs();
  const ids = new Set(defs.map((d) => d.id));

  it('[R-CONTENT] every activity is valid, unique, in bounds, and references real prerequisites', () => {
    const game = fakeGame();
    const errors = game.activities.register(kinds, defs);
    expect(errors).toEqual([]);
    expect(ids.size).toBe(defs.length);
    for (const d of defs) {
      expect(d.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(d.title.length, d.id).toBeGreaterThan(2);
      expect(d.blurb.length, d.id).toBeGreaterThan(8);
      expect(d.neighborhood.length, d.id).toBeGreaterThan(2);
      expect(d.at.lat, d.id).toBeGreaterThanOrEqual(BOUNDS.south);
      expect(d.at.lat, d.id).toBeLessThanOrEqual(BOUNDS.north);
      expect(d.at.lon, d.id).toBeGreaterThanOrEqual(BOUNDS.west);
      expect(d.at.lon, d.id).toBeLessThanOrEqual(BOUNDS.east);
      for (const r of d.requires ?? []) expect(ids.has(r), `${d.id} requires ${r}`).toBe(true);
    }
  });

  it('[R-CONTENT] prerequisite graph has no cycles', () => {
    const byId = new Map(defs.map((d) => [d.id, d]));
    const state = new Map<string, number>();
    const visit = (d: ActivityDef, path: string[]): void => {
      if (state.get(d.id) === 2) return;
      expect(state.get(d.id), `cycle: ${[...path, d.id].join(' > ')}`).not.toBe(1);
      state.set(d.id, 1);
      for (const r of d.requires ?? []) visit(byId.get(r)!, [...path, d.id]);
      state.set(d.id, 2);
    };
    for (const d of defs) visit(d, []);
  });

  it('[R-START-SPOTS] every startable activity has a start beacon of its own, so F reaches the one the player flies to', () => {
    const passive = new Set(kinds.filter((k) => k.passive).map((k) => k.kind));
    const at = defs.filter((d) => !passive.has(d.kind)).map((d) => ({ id: d.id, ...toLocal(d.at.lat, d.at.lon) }));
    const stacked = at.flatMap((a, i) => at.slice(i + 1).filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 20).map((b) => `${a.id} and ${b.id}`));
    expect(stacked).toEqual([]);
  });

  it('[R-KINDS] every kind validates bad params and has a label and icon', () => {
    for (const k of kinds) {
      expect(k.label.length).toBeGreaterThan(2);
      expect(k.icon.length).toBeGreaterThan(0);
      expect(Array.isArray(k.validate({ id: 'x', kind: k.kind, title: 'x', blurb: 'x', neighborhood: 'x', at: { lat: 37.8, lon: -122.4 }, params: {} }))).toBe(true);
    }
  });
});

describe('activity runner', async () => {
  const kinds = await loadKinds();
  const base = { neighborhood: 'Test', blurb: 'a test activity' };
  const defs: ActivityDef[] = [
    { ...base, id: 'spot', kind: 'discover', title: 'Spot', at: { lat: 37.8, lon: -122.42 }, card: 'card-spot', xp: 5, params: { radius: 50 } },
    { ...base, id: 'run', kind: 'rings', title: 'Run', at: { lat: 37.78, lon: -122.42 }, requires: ['spot'], params: { rings: [{ lat: 37.781, lon: -122.42 }, { lat: 37.782, lon: -122.42 }], timeLimit: 30 } },
  ];

  const sideOn = () => {
    const game = fakeGame();
    game.save.data.settings.sideActivities = true;
    return game;
  };

  it('[R-RUNNER] passive discoveries complete by proximity and grant xp and cards once', () => {
    const game = sideOn();
    game.activities.register(kinds, defs);
    const events: string[] = [];
    game.bus.on('activity:complete', (e) => events.push(e.id));
    game.bus.on('card:unlock', (e) => events.push(e.id));
    game.activities.update(1 / 30);
    expect(game.save.isDone('spot')).toBe(false);
    game.flight.pos = { ...game.activities.position(defs[0]) };
    game.activities.update(1 / 30);
    game.activities.update(1 / 30);
    expect(events).toEqual(['card-spot', 'spot']);
    expect(game.save.data.xp).toBe(5);
  });

  it('[R-RUNNER] a first completion toasts the XP it grants, and reaching a new pilot level says so', () => {
    const game = sideOn();
    game.activities.register(kinds, defs);
    const toasts: string[] = [];
    game.bus.on('toast', (t) => toasts.push(t.text));
    game.save.data.xp = 48;
    game.flight.pos = { ...game.activities.position(defs[0]) };
    game.activities.update(1 / 30);
    game.activities.update(1 / 30);
    expect(toasts).toEqual([`${game.activities.kindOf(defs[0]).icon} Spot +5 XP`, '⭐ Level 2 pilot']);
  });

  it('[R-RUNNER] locked activities cannot start; unlocked ones run to completion and record best time', () => {
    const game = sideOn();
    game.activities.register(kinds, defs);
    expect(game.activities.start('run')).toBe(false);
    expect(game.activities.start('spot')).toBe(false);
    game.save.complete('spot');
    game.flight.pos = { ...game.activities.position(defs[1]) };
    game.activities.update(1 / 30);
    expect(game.activities.nearby?.id).toBe('run');
    expect(game.activities.start('run')).toBe(true);
    for (const step of game.activities.kindOf(defs[1]).solve(defs[1], game)) {
      if ('teleport' in step) game.flight.pos = { ...step.teleport };
      game.activities.update(0.5);
    }
    expect(game.save.isDone('run')).toBe(true);
    expect(game.save.data.best.run).toBeGreaterThan(0);
    expect(game.activities.active).toBeNull();
  });

  it('[R-RUNNER] timed runs fail when the clock runs out', () => {
    const game = fakeGame();
    game.activities.register(kinds, defs);
    game.save.complete('spot');
    const fails: string[] = [];
    game.bus.on('activity:fail', (e) => fails.push(e.id));
    game.activities.start('run');
    for (let i = 0; i < 40; i++) game.activities.update(1);
    expect(fails).toEqual(['run']);
    expect(game.save.isDone('run')).toBe(false);
  });

  it('[R-RUNNER] reports duplicate ids and unknown kinds', () => {
    const game = fakeGame();
    const errors = game.activities.register(kinds, [defs[0], defs[0], { ...defs[0], id: 'zz', kind: 'nope' }]);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
    expect(errors.some((e) => e.includes('unknown kind'))).toBe(true);
  });

  it('[R-V2-SIDE-QUIET] by default side discoveries add their card silently and side activities offer no F prompt, until the setting is on', () => {
    const game = fakeGame();
    game.activities.register(kinds, defs);
    const events: string[] = [];
    game.bus.on('activity:complete', (e) => events.push(e.id));
    game.bus.on('card:unlock', (e) => events.push(`card ${e.id}`));
    game.bus.on('toast', (t) => events.push(`toast ${t.text}`));
    game.save.data.xp = 48;
    game.flight.pos = { ...game.activities.position(defs[0]) };
    game.activities.update(1 / 30);
    game.activities.update(1 / 30);
    expect(events).toEqual(['spot']);
    expect(game.save.data.cards).toEqual(['card-spot']);
    expect(game.save.data.xp).toBe(53);
    game.flight.pos = { ...game.activities.position(defs[1]) };
    game.activities.update(1 / 30);
    expect(game.activities.nearby).toBeNull();
    game.save.data.settings.sideActivities = true;
    game.activities.update(1 / 30);
    expect(game.activities.nearby?.id).toBe('run');
  });

  it('[R-V2-PAUSE] an active activity stands still while a panel is open', () => {
    const game = sideOn();
    game.activities.register(kinds, defs);
    game.save.complete('spot');
    const fails: string[] = [];
    game.bus.on('activity:fail', (e) => fails.push(e.id));
    game.activities.start('run');
    game.panels.openId = 'settings';
    for (let i = 0; i < 40; i++) game.activities.update(1);
    expect(fails).toEqual([]);
    expect(game.activities.active?.t).toBe(0);
    game.panels.openId = null;
    for (let i = 0; i < 40; i++) game.activities.update(1);
    expect(fails).toEqual(['run']);
  });

  it('[R-START-SPOTS] when a waypoint leads to an activity, F picks that one over a closer one, and C still cycles', () => {
    const game = sideOn();
    const near = (id: string, lat: number): ActivityDef => ({ ...defs[1], id, requires: [], at: { lat, lon: -122.42 } });
    game.activities.register(kinds, [near('close', 37.78), near('led', 37.7803)]);
    game.flight.pos = { ...game.activities.position(game.activities.defs.get('close')!) };
    game.activities.update(1 / 30);
    expect(game.activities.nearby?.id).toBe('close');
    const led = game.activities.position(game.activities.defs.get('led')!);
    game.waypoint = { ...led, label: 'Led' };
    game.activities.update(1 / 30);
    expect(game.activities.nearby?.id).toBe('led');
    game.activities.cycleNearby();
    game.activities.update(1 / 30);
    expect(game.activities.nearby?.id).toBe('close');
  });
});
