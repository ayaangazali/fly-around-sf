import { describe, expect, it } from 'vitest';
import { fakeGame, loadDefs, loadKinds } from './helpers';
import { SPAWN } from '../../src/game';
import { OnboardingTracker, STEPS, firstActivity } from '../../src/ui/onboarding-steps';
import { kind as rings } from '../../src/activities/kinds/rings';
import { kind as discover } from '../../src/activities/kinds/discover';

describe('onboarding', () => {
  it('[R-ONBOARD] every step advances only when the player does the thing', () => {
    const g = fakeGame();
    const t = new OnboardingTracker(g);
    const f = g.flight;
    expect(STEPS.map((s) => s.id)).toEqual(['forward', 'turn', 'climb', 'boost', 'journal', 'activity']);
    for (const s of STEPS) {
      expect(s.keys.length).toBeGreaterThan(5);
      expect(s.touch.length).toBeGreaterThan(5);
      expect(`${s.title}${s.keys}${s.touch}`).not.toMatch(/—/);
    }
    expect(t.update()).toBe(false);
    f.pos.x += 10;
    expect(t.update()).toBe(false);
    f.pos.x += 20;
    expect(t.update()).toBe(true);
    expect(t.step).toBe(1);
    f.yaw += 0.6;
    expect(t.update()).toBe(false);
    f.yaw -= 0.7;
    expect(t.update()).toBe(true);
    f.pos.y += 10;
    expect(t.update()).toBe(false);
    f.pos.y -= 5;
    expect(t.update()).toBe(true);
    f.vel = { x: 30, y: 0, z: 0 };
    expect(t.update()).toBe(false);
    f.vel = { x: 45, y: 0, z: 0 };
    expect(t.update()).toBe(true);
    g.bus.emit('panel:open', { id: 'map' });
    expect(t.update()).toBe(false);
    g.bus.emit('panel:open', { id: 'journal' });
    expect(t.update()).toBe(true);
    expect(t.update()).toBe(false);
    g.bus.emit('activity:start', { id: 'rings-x' });
    expect(t.update()).toBe(true);
    expect(t.done).toBe(true);
    expect(t.update()).toBe(false);
  });

  it('[R-ONBOARD] journal opened before its step does not count', () => {
    const g = fakeGame();
    const t = new OnboardingTracker(g);
    g.bus.emit('panel:open', { id: 'journal' });
    g.flight.pos.x += 40;
    t.update();
    g.flight.yaw += 2;
    t.update();
    g.flight.pos.y += 10;
    t.update();
    g.flight.pos.y -= 5;
    t.update();
    g.flight.vel.x = 50;
    t.update();
    expect(t.step).toBe(4);
    expect(t.update()).toBe(false);
  });

  it('[R-ONBOARD] the first activity is the nearest open, unlocked, startable one', () => {
    const g = fakeGame();
    const base = { blurb: 'b', neighborhood: 'n' };
    g.activities.register(
      [rings, discover],
      [
        { ...base, id: 'discover-near', kind: 'discover', title: 'Near discovery', at: { lat: 37.7749, lon: -122.4194 }, params: { radius: 50 } },
        { ...base, id: 'rings-far', kind: 'rings', title: 'Far', at: { lat: 37.8, lon: -122.45 }, params: { rings: [{ lat: 37.8, lon: -122.45 }, { lat: 37.801, lon: -122.45 }] } },
        { ...base, id: 'rings-near', kind: 'rings', title: 'Near', at: { lat: 37.776, lon: -122.42 }, params: { rings: [{ lat: 37.776, lon: -122.42 }, { lat: 37.777, lon: -122.42 }] } },
        { ...base, id: 'rings-locked', kind: 'rings', title: 'Locked', requires: ['rings-far'], at: { lat: 37.7749, lon: -122.4194 }, params: { rings: [{ lat: 37.77, lon: -122.42 }, { lat: 37.771, lon: -122.42 }] } },
      ],
    );
    const p = g.world.point({ lat: 37.7749, lon: -122.4194 });
    g.flight.pos = { ...p };
    expect(firstActivity(g)?.id).toBe('rings-near');
    g.save.complete('rings-near');
    expect(firstActivity(g)?.id).toBe('rings-far');
    g.save.complete('rings-far');
    expect(firstActivity(g)?.id).toBe('rings-locked');
    g.save.complete('rings-locked');
    expect(firstActivity(g)).toBeNull();
  });

  it('[R-ONBOARD] the tutorial sends a new pilot to the next story chapter, not whatever is nearest', async () => {
    const g = fakeGame();
    g.activities.register(await loadKinds(), loadDefs());
    g.flight.pos = { ...g.world.point(SPAWN) };
    expect(firstActivity(g)?.id).toBe('quest-initial-commit');
    g.save.complete('quest-initial-commit');
    expect(firstActivity(g)?.id).toBe('quest-git-blame');
  });
});

describe('nearby', () => {
  it('[R-WAYPOINT] nearest open activities are sorted, capped and limited by range', async () => {
    const { nearestOpen } = await import('../../src/ui/nearby');
    const g = fakeGame();
    const ring = (id: string, lat: number) => ({ id, kind: 'rings', title: id, blurb: 'b', neighborhood: 'n', at: { lat, lon: -122.42 }, params: { rings: [{ lat, lon: -122.42 }, { lat: lat + 0.001, lon: -122.42 }] } });
    g.activities.register([rings], [ring('rings-a', 37.77), ring('rings-b', 37.78), ring('rings-c', 37.8), { ...ring('rings-d', 37.7701), hidden: true }]);
    g.flight.pos = { ...g.world.point({ lat: 37.77, lon: -122.42 }) };
    expect(nearestOpen(g, 5).map((n) => n.def.id)).toEqual(['rings-a', 'rings-b', 'rings-c']);
    expect(nearestOpen(g, 1).map((n) => n.def.id)).toEqual(['rings-a']);
    expect(nearestOpen(g, 5, 2000).map((n) => n.def.id)).toEqual(['rings-a', 'rings-b']);
    expect(nearestOpen(g, 5)[1].dist).toBeCloseTo(1112, -1);
  });
});
