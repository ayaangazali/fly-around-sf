import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Cover, Road, TreeKind, parseGreen, parseStars, parseStreets, parseTrees } from '../../src/world/env-data';
import { Landcover } from '../../src/world/landcover';
import { EXTENT, toLocal } from '../../src/core/geo';
import { ROOT } from './helpers';

const bin = (f: string) => {
  const b = readFileSync(join(ROOT, 'public/data', f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const length = (xs: Float32Array, zs: Float32Array) => {
  let d = 0;
  for (let i = 1; i < xs.length; i++) d += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  return d;
};

describe('baked environment data', () => {
  it('[R-ENV-STREETS] streets.bin covers the whole street network with every class', () => {
    const lines = parseStreets(bin('streets.bin'));
    expect(lines.length).toBeGreaterThan(4000);
    const km = lines.reduce((s, l) => s + length(l.xs, l.zs), 0) / 1000;
    expect(km).toBeGreaterThan(1500);
    const classes = new Set(lines.map((l) => l.cls));
    for (const c of Object.values(Road)) expect(classes.has(c)).toBe(true);
    for (const l of lines) for (let i = 0; i < l.xs.length; i++) {
      expect(l.xs[i]).toBeGreaterThan(EXTENT.minX - 500);
      expect(l.xs[i]).toBeLessThan(EXTENT.maxX + 500);
    }
    const market = toLocal(37.7749, -122.4194);
    const near = lines.filter((l) => l.cls === Road.Boulevard && Array.from(l.xs).some((x, i) => Math.hypot(x - market.x, l.zs[i] - market.z) < 150));
    expect(near.length).toBeGreaterThan(0);
  });

  it('[R-ENV-GREEN] green.bin rasterizes real parks, forests, beaches and lakes', () => {
    const lc = Landcover.rasterize(parseGreen(bin('green.bin')), { w: 2300, h: 2100, cell: 8, minX: EXTENT.minX, minZ: EXTENT.minZ });
    const at = (lat: number, lon: number) => {
      const p = toLocal(lat, lon);
      return lc.at(p.x, p.z);
    };
    expect([Cover.Grass, Cover.Wood]).toContain(at(37.7694, -122.4862));
    expect(at(37.76, -122.5108)).toBe(Cover.Sand);
    expect(at(37.771, -122.494)).toBe(Cover.Lake);
    expect([37.7225, 37.719, 37.715].map((lat) => at(lat, -122.4905))).toContain(Cover.Lake);
    expect([Cover.Wood, Cover.Scrub, Cover.Grass]).toContain(at(37.787, -122.505));
    expect(at(37.7596, -122.4269)).toBe(Cover.Grass);
    expect(at(37.792, -122.4)).toBe(0);
    const counts = new Map<number, number>();
    for (const c of lc.cls) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect((counts.get(Cover.Wood) ?? 0) * 64).toBeGreaterThan(2e6);
    expect((counts.get(Cover.Grass) ?? 0) * 64).toBeGreaterThan(8e6);
  });

  it('[R-ENV-GREEN] trees.bin holds the real street trees, Dolores palms and Embarcadero palms', () => {
    const t = parseTrees(bin('trees.bin'));
    expect(t.count).toBeGreaterThan(130000);
    const box = (a: [number, number], b: [number, number]) => {
      const p = toLocal(a[0], a[1]);
      const q = toLocal(b[0], b[1]);
      let n = 0;
      for (let i = 0; i < t.count; i++) if (t.kind[i] === TreeKind.Palm && t.x[i] > p.x && t.x[i] < q.x && t.z[i] > p.z && t.z[i] < q.z) n++;
      return n;
    };
    expect(box([37.769, -122.4272], [37.748, -122.4232])).toBeGreaterThan(80);
    expect(box([37.8085, -122.416], [37.7952, -122.392])).toBeGreaterThan(200);
    for (let i = 0; i < t.count; i += 97) {
      expect(t.height[i]).toBeGreaterThan(2);
      expect(t.height[i]).toBeLessThan(32);
    }
  });

  it('[R-ENV-SKY] stars.bin is the bright star catalog with Sirius brightest', () => {
    const s = parseStars(bin('stars.bin'));
    expect(s.length / 4).toBeGreaterThan(1500);
    let best = 0;
    for (let i = 0; i < s.length / 4; i++) if (s[i * 4 + 2] < s[best * 4 + 2]) best = i;
    expect((s[best * 4] * 12) / Math.PI).toBeCloseTo(6.75, 1);
    expect((s[best * 4 + 1] * 180) / Math.PI).toBeCloseTo(-16.7, 0);
    expect(s[best * 4 + 2]).toBeCloseTo(-1.46, 1);
  });

  it('[R-ENV-STREETS] parsers reject files with the wrong magic', () => {
    const bad = new ArrayBuffer(16);
    expect(() => parseStreets(bad)).toThrow(/magic/);
    expect(() => parseGreen(bad)).toThrow(/magic/);
    expect(() => parseTrees(bad)).toThrow(/magic/);
    expect(() => parseStars(bad)).toThrow(/magic/);
  });
});
