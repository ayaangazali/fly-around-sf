import { describe, expect, it } from 'vitest';
import { sunPosition, nightFactor } from '../../src/core/sun';

const deg = (r: number) => (r * 180) / Math.PI;

describe('sun', () => {
  it('[R-SUN] is high at summer solar noon in SF', () => {
    const s = sunPosition(new Date('2026-06-21T20:10:00Z'), 37.77, -122.42);
    expect(deg(s.altitude)).toBeGreaterThan(73);
    expect(deg(s.altitude)).toBeLessThan(77);
    expect(deg(s.azimuth)).toBeGreaterThan(150);
    expect(deg(s.azimuth)).toBeLessThan(210);
  });

  it('[R-SUN] is below the horizon at 9pm in October and rises in the east', () => {
    expect(deg(sunPosition(new Date('2026-10-20T04:00:00Z'), 37.77, -122.42).altitude)).toBeLessThan(-10);
    const rise = sunPosition(new Date('2026-10-19T14:30:00Z'), 37.77, -122.42);
    expect(deg(rise.altitude)).toBeGreaterThan(-3);
    expect(deg(rise.altitude)).toBeLessThan(6);
    expect(deg(rise.azimuth)).toBeGreaterThan(90);
    expect(deg(rise.azimuth)).toBeLessThan(120);
  });

  it('[R-SUN] night factor ramps from day to night', () => {
    expect(nightFactor((30 * Math.PI) / 180)).toBe(0);
    expect(nightFactor((-20 * Math.PI) / 180)).toBe(1);
    const mid = nightFactor((-3 * Math.PI) / 180);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
