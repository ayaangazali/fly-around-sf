import { describe, expect, it } from 'vitest';
import { toLocal, toGeo, inBounds, EXTENT, distance2d } from '../../src/core/geo';

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe('geo projection', () => {
  it('[R-GEO] round-trips lat/lon to local meters', () => {
    for (const [lat, lon] of [[37.8199, -122.4783], [37.7955, -122.3937], [37.7, -122.5], [37.84, -122.33]]) {
      const { x, z } = toLocal(lat, lon);
      const g = toGeo(x, z);
      expect(g.lat).toBeCloseTo(lat, 9);
      expect(g.lon).toBeCloseTo(lon, 9);
    }
  });

  it('[R-GEO] matches great-circle distance within 0.3% across the city', () => {
    const pairs: [[number, number], [number, number]][] = [
      [[37.7955, -122.3937], [37.8199, -122.4783]],
      [[37.7544, -122.4477], [37.8024, -122.4058]],
      [[37.7083, -122.5014], [37.8267, -122.423]],
    ];
    for (const [a, b] of pairs) {
      const pa = toLocal(...a);
      const pb = toLocal(...b);
      const d = distance2d(pa.x, pa.z, pb.x, pb.z);
      expect(Math.abs(d - haversine(a, b)) / haversine(a, b)).toBeLessThan(0.003);
    }
  });

  it('[R-GEO] orients north as -z and east as +x', () => {
    const n = toLocal(37.8, -122.43);
    const e = toLocal(37.7675, -122.4);
    expect(n.z).toBeLessThan(0);
    expect(e.x).toBeGreaterThan(0);
    expect(EXTENT.maxX).toBeGreaterThan(EXTENT.minX);
    expect(EXTENT.maxZ).toBeGreaterThan(EXTENT.minZ);
    expect(inBounds(37.8, -122.43)).toBe(true);
    expect(inBounds(37.5, -122.43)).toBe(false);
  });
});
