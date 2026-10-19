import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers';
import { bearingDeg, clampView, edgePoint, fitScale, formatDistance, headingDeg, panBy, relativeDeg, toScreen, toWorld, zoomAt, MAX_SCALE, MIN_SCALE, type MapView } from '../../src/ui/map-view';
import { kindColor, mappable } from '../../src/ui/map-style';
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
    const base = { title: 't', blurb: 'b', neighborhood: 'n', at: { lat: 37.77, lon: -122.42 } };
    expect(mappable(g, { ...base, id: 'rings-a', kind: 'rings' })).toBe(true);
    expect(mappable(g, { ...base, id: 'achievement-a', kind: 'achievement' })).toBe(false);
    expect(mappable(g, { ...base, id: 'discover-a', kind: 'discover', hidden: true })).toBe(false);
    g.save.complete('discover-a');
    expect(mappable(g, { ...base, id: 'discover-a', kind: 'discover', hidden: true })).toBe(true);
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

  it('[R-WAYPOINT] a player waypoint wins over the active activity target', () => {
    const g = fakeGame();
    expect(guideTarget(g)).toBeNull();
    (g.activities as unknown as { active: unknown }).active = { inst: { targets: () => [{ x: 1, y: 2, z: 3 }] } };
    expect(guideTarget(g)).toEqual({ x: 1, y: 2, z: 3, label: 'Next' });
    g.waypoint = { x: 9, y: 9, z: 9, label: 'Coit Tower' };
    expect(guideTarget(g)?.label).toBe('Coit Tower');
  });
});
