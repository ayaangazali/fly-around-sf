import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers';
import { avoidBoxes, bearingDeg, clampView, edgePoint, fitScale, fitView, FIT_PAD, FIT_TOOLS, formatDistance, headingDeg, panBy, relativeDeg, toScreen, toWorld, zoomAt, MAX_SCALE, MIN_SCALE, type MapView } from '../../src/ui/map-view';
import { currentObjective, kindColor, mappable, trailStops, TRAIL_COLOR } from '../../src/ui/map-style';
import { guideTarget } from '../../src/ui/waypoint';
import { forwardVector } from '../../src/player/flight';

const E = { minX: -8000, maxX: 8000, minZ: -7000, maxZ: 7000 };
const V: MapView = { cx: 100, cz: -200, scale: 0.5, w: 800, h: 600 };

describe('map math', () => {
  it('[R-MAP] screen and world coordinates round-trip', () => {
    const s = toScreen(V, 1234, -567);
    const w = toWorld(V, s.sx, s.sy);
    expect(w.x).toBeCloseTo(1234);
    expect(w.z).toBeCloseTo(-567);
    expect(toScreen(V, V.cx, V.cz)).toEqual({ sx: 400, sy: 300 });
  });

  it('[R-MAP] zoom keeps the point under the cursor fixed and respects limits', () => {
    const at = toWorld(V, 650, 120);
    const z = zoomAt(V, 2, 650, 120, E);
    const after = toWorld(z, 650, 120);
    expect(z.scale).toBe(1);
    expect(after.x).toBeCloseTo(at.x);
    expect(after.z).toBeCloseTo(at.z);
    expect(zoomAt(V, 1e6, 400, 300, E).scale).toBe(MAX_SCALE);
    expect(zoomAt(V, 1e-6, 400, 300, E).scale).toBe(MIN_SCALE);
  });

  it('[R-MAP] panning moves the view and stays inside the city', () => {
    const p = panBy(V, 100, -50, E);
    expect(p.cx).toBeCloseTo(V.cx - 200);
    expect(p.cz).toBeCloseTo(V.cz + 100);
    const far = clampView({ ...V, cx: 1e9, cz: -1e9 }, E);
    expect(far.cx).toBeCloseTo(E.maxX - 400 / V.scale);
    expect(far.cz).toBeCloseTo(E.minZ + 300 / V.scale);
    const tiny = clampView({ ...V, scale: MIN_SCALE }, E);
    expect(tiny.cx).toBe(0);
    expect(tiny.cz).toBe(0);
    expect(fitScale(800, 600, E)).toBeCloseTo(Math.min(800 / 16000, 600 / 14000));
  });

  it('[R-MAP] bearings and headings agree with the flight model', () => {
    expect(bearingDeg(0, 0, 0, -10)).toBeCloseTo(0);
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(90);
    expect(bearingDeg(0, 0, 0, 10)).toBeCloseTo(180);
    expect(bearingDeg(0, 0, -10, 0)).toBeCloseTo(270);
    for (const yaw of [0, 0.7, -1.9, 3]) {
      const f = forwardVector(yaw);
      expect(bearingDeg(0, 0, f.x, f.z)).toBeCloseTo(headingDeg(yaw));
    }
    expect(relativeDeg(10, 350)).toBeCloseTo(20);
    expect(relativeDeg(350, 10)).toBeCloseTo(-20);
  });

  it('[R-MAP] distances format in metric and imperial', () => {
    expect(formatDistance(123, false)).toBe('125 m');
    expect(formatDistance(2345, false)).toBe('2.3 km');
    expect(formatDistance(100, true)).toBe('330 ft');
    expect(formatDistance(3218.7, true)).toBe('2.0 mi');
  });

  it('[R-MAP] kind colors are stable and achievements and secrets stay off the map', () => {
    expect(kindColor('rings')).toBe(kindColor('rings'));
    expect(kindColor('rings')).toMatch(/^#[0-9a-f]{6}$/);
    const g = fakeGame();
    g.save.data.settings.sideActivities = true;
    const base = { title: 't', blurb: 'b', neighborhood: 'n', at: { lat: 37.77, lon: -122.42 } };
    expect(mappable(g, { ...base, id: 'rings-a', kind: 'rings' })).toBe(true);
    expect(mappable(g, { ...base, id: 'achievement-a', kind: 'achievement' })).toBe(false);
    expect(mappable(g, { ...base, id: 'discover-a', kind: 'discover', hidden: true })).toBe(false);
    g.save.complete('discover-a');
    expect(mappable(g, { ...base, id: 'discover-a', kind: 'discover', hidden: true })).toBe(true);
  });
});

describe('founder trail on the map', () => {
  const stop = (order: number) => ({ id: `trail-${order}`, kind: 'trail', title: `Stop ${order}`, blurb: 'b', neighborhood: 'n', at: { lat: 37.77 + order / 100, lon: -122.42 }, params: { order } });
  const side = { id: 'rings-a', kind: 'rings', title: 'r', blurb: 'b', neighborhood: 'n', at: { lat: 37.77, lon: -122.42 } };

  it('[R-V2-MAP-TRAIL] only trail stops are mapped until side activities are switched on, and the objective is the first stop not done', () => {
    const g = fakeGame();
    g.activities.register([], [stop(3), side, stop(1), stop(2)]);
    const mapped = () => g.activities.list().filter((d) => mappable(g, d)).map((d) => d.id).sort();
    expect(trailStops(g).map((d) => d.id)).toEqual(['trail-1', 'trail-2', 'trail-3']);
    expect(mapped()).toEqual(['trail-1', 'trail-2', 'trail-3']);
    expect(currentObjective(g)?.id).toBe('trail-1');
    g.save.complete('trail-1');
    expect(currentObjective(g)?.id).toBe('trail-2');
    expect(mapped()).toEqual(['trail-1', 'trail-2', 'trail-3']);
    g.save.data.settings.sideActivities = true;
    expect(mapped()).toEqual(['rings-a', 'trail-1', 'trail-2', 'trail-3']);
    g.save.complete('trail-3');
    g.save.complete('trail-2');
    expect(currentObjective(g)).toBeNull();
    expect(kindColor('trail')).toBe(TRAIL_COLOR);
  });

  it('[R-V2-MAP-OPEN] the map opens framed on the player and every trail stop', () => {
    const pts = [
      { x: -3000, z: 2000 },
      { x: 4000, z: -1500 },
      { x: 500, z: 500 },
    ];
    const v = fitView(pts, 1100, 600, E);
    const s = pts.map((q) => toScreen(v, q.x, q.z));
    for (const q of s) {
      expect(q.sx).toBeGreaterThanOrEqual(FIT_PAD - 1e-6);
      expect(q.sx).toBeLessThanOrEqual(1100 - FIT_PAD - FIT_TOOLS + 1e-6);
      expect(q.sy).toBeGreaterThanOrEqual(FIT_PAD - 1e-6);
      expect(q.sy).toBeLessThanOrEqual(600 - FIT_PAD + 1e-6);
    }
    expect(Math.min(...s.map((q) => q.sx))).toBeCloseTo(FIT_PAD);
    expect(Math.max(...s.map((q) => q.sx))).toBeCloseTo(1100 - FIT_PAD - FIT_TOOLS);
    expect(fitView([{ x: 0, z: 0 }, { x: 10, z: 10 }], 1100, 600, E).scale).toBeCloseTo((600 - 2 * FIT_PAD) / 1200);
  });
});

describe('waypoint', () => {
  it('[R-WAYPOINT] the edge arrow sits on the screen border in the target direction', () => {
    const right = edgePoint(10, 1, 400, 300);
    expect(right.x).toBeCloseTo(400);
    expect(Math.abs(right.y)).toBeLessThan(300);
    const up = edgePoint(0, -5, 400, 300);
    expect(up.y).toBeCloseTo(-300);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
    const corner = edgePoint(-400, 300, 400, 300);
    expect(corner.x).toBeCloseTo(-400);
    expect(corner.y).toBeCloseTo(300);
  });

  it('[R-WAYPOINT] the edge arrow and its label step out from under HUD widgets to the nearest free spot', () => {
    const minimap = { left: 1100, top: 620, right: 1250, bottom: 770 };
    const stats = { left: 16, top: 720, right: 400, bottom: 780 };
    const foot = { left: 60, right: 60, top: 20, bottom: 70 };
    expect(avoidBoxes(640, 600, [minimap, stats], foot, 1280, 800)).toEqual({ x: 640, y: 600 });
    expect(avoidBoxes(1150, 720, [minimap, stats], foot, 1280, 800)).toEqual({ x: 1040, y: 720 });
    expect(avoidBoxes(1200, 600, [minimap, stats], foot, 1280, 800)).toEqual({ x: 1200, y: 550 });
    expect(avoidBoxes(300, 700, [stats], foot, 1280, 800)).toEqual({ x: 300, y: 650 });
    expect(avoidBoxes(300, 700, [{ left: 0, top: 0, right: 1280, bottom: 800 }], foot, 1280, 800)).toEqual({ x: 300, y: 700 });
  });

  it('[R-WAYPOINT] a player waypoint wins over the active activity target', () => {
    const g = fakeGame();
    expect(guideTarget(g)).toBeNull();
    (g.activities as unknown as { active: unknown }).active = { inst: { targets: () => [{ x: 1, y: 2, z: 3 }] } };
    expect(guideTarget(g)).toEqual({ x: 1, y: 2, z: 3, label: 'Next' });
    g.waypoint = { x: 9, y: 9, z: 9, label: 'Coit Tower' };
    expect(guideTarget(g)?.label).toBe('Coit Tower');
  });
});
