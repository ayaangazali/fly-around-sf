import { describe, expect, it } from 'vitest';
import { Governor, GOVERNOR, RUNGS } from '../../src/core/governor';
import { parseOptions } from '../../src/game';
import { savedQuality } from '../../src/ui';

function windows(g: Governor, ms: number, from: number, n: number): number {
  let t = from;
  for (let i = 0; i < n; i++) {
    const end = t + GOVERNOR.windowMs;
    for (; t <= end; t += ms) g.sample(ms, t);
  }
  return t;
}

describe('adaptive quality', () => {
  it('[R-V2-PERF-GOVERNOR] steps down on slow frames, back up on fast ones, and holds a rung it fell from', () => {
    const g = new Governor(0, 0);
    let t = windows(g, 40, 0, 1);
    expect(g.rung).toBe(1);
    t = windows(g, 40, t, 5);
    expect(g.rung).toBe(RUNGS.length - 1);
    t = windows(g, 20, t, 2);
    t = windows(g, 10, t, 2);
    expect(g.rung).toBe(RUNGS.length - 1);
    t = windows(g, 10, t, 15);
    expect(g.rung).toBe(0);
    g.sample(10, t);
    t += 5000;
    g.sample(5000, t);
    expect(g.rung).toBe(0);
    t = windows(g, 40, t + 40, 1);
    expect(g.rung).toBe(1);
    t = windows(g, 10, t, 17);
    expect(g.rung).toBe(1);
    windows(g, 10, t, 15);
    expect(g.rung).toBe(0);
  });

  it('[R-V2-PERF-GOVERNOR] never climbs above the tier the game loaded with, and governs a machine too slow for 4 fps', () => {
    const g = new Governor(2, 2);
    windows(g, 10, 0, 30);
    expect(g.rung).toBe(2);
    const slow = new Governor(0, 0);
    windows(slow, 500, 0, 3);
    expect(slow.rung).toBe(3);
    expect(RUNGS[2]).toMatchObject({ shadow: false });
    expect(RUNGS[0].pixelRatio).toBeGreaterThan(RUNGS[RUNGS.length - 1].pixelRatio);
    expect(RUNGS[0].far).toBeGreaterThan(RUNGS[RUNGS.length - 1].far);
  });

  it('[R-V2-PERF-GOVERNOR] only Auto quality is governed; a chosen tier stays fixed', () => {
    expect(parseOptions('').auto).toBe(true);
    expect(parseOptions('?quality=auto').auto).toBe(true);
    expect(parseOptions('?quality=medium').auto).toBe(false);
    expect(parseOptions('?test').auto).toBe(false);
    expect(parseOptions('?test&quality=auto')).toMatchObject({ auto: true, quality: 'high' });
    const saved = parseOptions('');
    savedQuality(saved, '', 'medium');
    expect(saved).toMatchObject({ auto: false, quality: 'medium' });
    const auto = parseOptions('');
    savedQuality(auto, '', 'auto');
    expect(auto.auto).toBe(true);
  });
});
