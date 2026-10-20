import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers';
import { OnboardingTracker, STEPS, trailTarget } from '../../src/ui/onboarding-steps';
import { FLIGHT } from '../../src/player/flight';
import { kind as rings } from '../../src/activities/kinds/rings';
import type { ActivityKind } from '../../src/activities/types';
import type { Game } from '../../src/game';

const trail: ActivityKind = { kind: 'trail', label: 'Trail', icon: '⭐', validate: () => [], start: () => ({ update: () => 'running', progress: () => 0, hud: () => '' }), solve: () => [] };
const stop = (id: string, order: number, lat: number) => ({ id, kind: 'trail', title: `Stop ${order}`, blurb: 'b', neighborhood: 'n', at: { lat, lon: -122.42 }, params: { order } });

function toStep(g: Game, t: OnboardingTracker, id: string): void {
  const f = g.flight;
  for (let i = 0; i < 10 && STEPS[t.step]?.id !== id; i++) {
    const s = STEPS[t.step].id;
    if (s === 'forward') f.pos.x += 30;
    if (s === 'turn') f.yaw += 1.3;
    if (s === 'climb') {
      f.pos.y += 7;
      t.update();
      f.pos.y -= 5;
    }
    if (s === 'boost') f.vel = { x: FLIGHT.boost, y: 0, z: 0 };
    t.update();
  }
  f.vel = { x: 0, y: 0, z: 0 };
  expect(STEPS[t.step].id).toBe(id);
}

describe('onboarding', () => {
  it('[R-V2-ONBOARD] the tutorial is five steps: fly, turn, climb and descend, boost, follow the objective', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['forward', 'turn', 'climb', 'boost', 'objective']);
    for (const s of STEPS) {
      expect(s.keys.length).toBeGreaterThan(5);
      expect(s.touch.length).toBeGreaterThan(5);
      expect(`${s.title}${s.keys}${s.touch}`).not.toMatch(/—/);
    }
  });

  it('[R-ONBOARD] every step advances only when the player does the thing', () => {
    const g = fakeGame();
    const t = new OnboardingTracker(g);
    const f = g.flight;
    expect(t.update()).toBe(false);
    f.pos.x += 10;
    expect(t.update()).toBe(false);
    f.pos.x += 20;
    expect(t.update()).toBe(true);
    f.yaw += 0.6;
    expect(t.update()).toBe(false);
    f.yaw -= 0.7;
    expect(t.update()).toBe(true);
    f.pos.y += 3;
    expect(t.update()).toBe(false);
    f.pos.y -= 3;
    expect(t.update()).toBe(false);
    f.pos.y += 4;
    expect(t.update()).toBe(false);
    f.pos.y -= 1;
    expect(t.update()).toBe(true);
    f.vel = { x: FLIGHT.cruise, y: 0, z: 0 };
    expect(t.update()).toBe(false);
    f.vel = { x: FLIGHT.boost, y: 0, z: 0 };
    expect(t.update()).toBe(true);
    expect(t.update()).toBe(true);
    expect(t.done).toBe(true);
    expect(t.update()).toBe(false);
  });

  it('[R-V2-ONBOARD] climbing and descending count in either order, so descending first never strands the pilot', () => {
    const g = fakeGame();
    const t = new OnboardingTracker(g);
    toStep(g, t, 'climb');
    const f = g.flight;
    f.pos.y -= 20;
    expect(t.update()).toBe(false);
    expect(t.descended).toBe(true);
    expect(t.climbed).toBe(false);
    f.pos.y += 7;
    expect(t.update()).toBe(true);
    expect(STEPS[t.step].id).toBe('boost');
  });

  it('[R-V2-ONBOARD] the last step points at the first open Founder Trail stop by order and completes on approach', () => {
    const g = fakeGame();
    g.activities.register([trail, rings], [stop('trail-b', 2, 37.79), stop('trail-a', 1, 37.8), stop('trail-c', 3, 37.78)]);
    expect(trailTarget(g)?.id).toBe('trail-a');
    g.save.complete('trail-a');
    expect(trailTarget(g)?.id).toBe('trail-b');
    const t = new OnboardingTracker(g);
    toStep(g, t, 'objective');
    const target = g.activities.position(trailTarget(g)!);
    const f = g.flight;
    const toward = (m: number) => {
      const d = Math.hypot(target.x - f.pos.x, target.z - f.pos.z);
      f.pos.x += ((target.x - f.pos.x) / d) * m;
      f.pos.z += ((target.z - f.pos.z) / d) * m;
    };
    toward(60);
    expect(t.update()).toBe(false);
    toward(60);
    expect(t.update()).toBe(true);
    expect(t.done).toBe(true);
  });

  it('[R-V2-ONBOARD] with no trail stop to follow the last step does not block the tutorial', () => {
    const g = fakeGame();
    const t = new OnboardingTracker(g);
    toStep(g, t, 'objective');
    expect(trailTarget(g)).toBeNull();
    expect(t.update()).toBe(true);
    expect(t.done).toBe(true);
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
    expect(nearestOpen(g, 5, 2000, 45).map((n) => n.def.id)).toEqual(['rings-b']);
    expect(nearestOpen(g, 5)[1].dist).toBeCloseTo(1112, -1);
  });
});
