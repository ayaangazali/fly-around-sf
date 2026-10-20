import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CityData, NO_GROUND } from '../../src/world/city-data';
import { buildChunks, buildChunk, buildingColor, chunkKey } from '../../src/world/city-mesh';
import { Terrain } from '../../src/world/terrain';
import { toLocal } from '../../src/core/geo';
import { ROOT } from './helpers';

function synthetic(buildings: { h: number; g: number; ring: [number, number][] }[]): ArrayBuffer {
  const ints = buildings.reduce((n, b) => n + 3 + b.ring.length * 2, 0);
  const buf = new ArrayBuffer(8 + ints * 2);
  new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x43, 0x32]);
  new DataView(buf).setUint32(4, buildings.length, true);
  const out = new Int16Array(buf, 8);
  let o = 0;
  for (const b of buildings) {
    out[o++] = b.h * 10;
    out[o++] = b.g === NO_GROUND ? NO_GROUND : b.g * 10;
    out[o++] = b.ring.length;
    let px = 0;
    let pz = 0;
    for (const [x, z] of b.ring) {
      out[o++] = x * 2 - px;
      out[o++] = z * 2 - pz;
      px = x * 2;
      pz = z * 2;
    }
  }
  return buf;
}

const square = (x: number, z: number, s: number): [number, number][] => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]];

describe('city data', () => {
  const city = new CityData(synthetic([{ h: 20, g: 5, ring: square(0, 0, 10) }, { h: 8, g: NO_GROUND, ring: square(100, 100, 6) }]), () => 3);

  it('[R-CITY] parses delta-encoded footprints and ground fallback', () => {
    expect(city.count).toBe(2);
    expect(city.top(0)).toBeCloseTo(25);
    expect(city.ground[1]).toBe(3);
    expect(city.cx[0]).toBeCloseTo(5);
    expect(city.contains(0, 5, 5)).toBe(true);
    expect(city.contains(0, 15, 5)).toBe(false);
    expect(city.roofAt(5, 5)).toBeCloseTo(25);
    expect(city.roofAt(50, 50)).toBe(-Infinity);
  });

  it('[R-CITY] pushes a drone out of walls and onto roofs', () => {
    const side = { x: -0.5, y: 10, z: 5 };
    expect(city.collide(side, 1.2)).toBe(true);
    expect(side.x).toBeCloseTo(-1.2, 5);
    const inside = { x: 0.3, y: 10, z: 5 };
    city.collide(inside, 1.2);
    expect(inside.x).toBeLessThan(-1.19);
    const roof = { x: 5, y: 24.9, z: 5 };
    city.collide(roof, 1.2);
    expect(roof.y).toBeCloseTo(26.2, 5);
    const free = { x: 50, y: 10, z: 50 };
    expect(city.collide(free, 1.2)).toBe(false);
    const above = { x: 5, y: 40, z: 5 };
    expect(city.collide(above, 1.2)).toBe(false);
  });

  it('[R-CITY] exclusions hide buildings from collision and meshing', () => {
    const c = new CityData(synthetic([{ h: 20, g: 0, ring: square(0, 0, 10) }, { h: 20, g: 0, ring: square(300, 0, 10) }]), () => 0);
    c.applyExclusions([{ x: 5, z: 5, r: 20 }]);
    expect(c.hidden[0]).toBe(1);
    expect(c.hidden[1]).toBe(0);
    expect(c.collide({ x: 5, y: 5, z: 5 }, 1)).toBe(false);
    expect(buildChunks(c).reduce((n, ch) => n + ch.buildings, 0)).toBe(1);
  });

  it('[R-CITY] meshes walls facing outward and roofs facing up', () => {
    const ch = buildChunk(city, chunkKey(0, 0), [0]);
    const p = ch.position;
    const tri = (i: number) => [0, 1, 2].map((k) => [p[ch.index[i + k] * 3], p[ch.index[i + k] * 3 + 1], p[ch.index[i + k] * 3 + 2]]);
    const normal = (t: number[][]) => {
      const e1 = t[1].map((v, i) => v - t[0][i]);
      const e2 = t[2].map((v, i) => v - t[0][i]);
      return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    };
    expect(ch.index.length).toBe(4 * 6 + 2 * 3);
    for (let i = 0; i < 24; i += 3) {
      const t = tri(i);
      const n = normal(t);
      const cx = (t[0][0] + t[1][0] + t[2][0]) / 3 - 5;
      const cz = (t[0][2] + t[1][2] + t[2][2]) / 3 - 5;
      expect(n[0] * cx + n[2] * cz).toBeGreaterThan(0);
    }
    for (let i = 24; i < 30; i += 3) expect(normal(tri(i))[1]).toBeGreaterThan(0);
    expect(p[1]).toBeCloseTo(2);
    expect(buildingColor(0, 50)).not.toEqual(buildingColor(0, 5));
  });

  it('[R-DATA] real city.bin has the whole city with a tall downtown', () => {
    const buf = readFileSync(join(ROOT, 'public/data/city.bin'));
    const terrain = Terrain.parse(readFileSync(join(ROOT, 'public/data/terrain.bin')).buffer.slice(0) as ArrayBuffer);
    const real = new CityData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, (x, z) => terrain.heightAt(x, z));
    expect(real.count).toBeGreaterThan(170000);
    const sf = toLocal(37.792, -122.4036);
    let tallest = 0;
    for (const b of real.near(sf.x, sf.z, 40)) tallest = Math.max(tallest, real.height[b]);
    expect(tallest).toBeGreaterThan(200);
    const tp = toLocal(37.7544, -122.4477);
    expect(terrain.heightAt(tp.x, tp.z)).toBeGreaterThan(240);
    const bay = toLocal(37.815, -122.43);
    expect(terrain.heightAt(bay.x, bay.z)).toBeLessThan(0);
  });
});

describe('terrain', () => {
  it('[R-DATA] builds a colored mesh and interpolates heights', () => {
    const w = 3;
    const h = 3;
    const buf = new ArrayBuffer(20 + w * h * 2);
    const dv = new DataView(buf);
    new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x54, 0x31]);
    dv.setUint16(4, w, true);
    dv.setUint16(6, h, true);
    dv.setFloat32(8, 10, true);
    dv.setFloat32(12, 0, true);
    dv.setFloat32(16, 0, true);
    new Int16Array(buf, 20, 9).set([0, 100, 200, 0, 100, 200, -50, 1000, 3000]);
    const t = Terrain.parse(buf);
    expect(t.heightAt(5, 0)).toBeCloseTo(5);
    expect(t.heightAt(-100, -100)).toBe(0);
    expect(t.heightAt(15, 15)).toBeCloseTo((10 + 20 + 100 + 300) / 4);
    const mesh = t.buildMesh(1);
    expect(mesh.geometry.getAttribute('position').count).toBe(9);
    expect(mesh.geometry.getIndex()!.count).toBe(24);
    expect(t.buildMesh(2).geometry.getAttribute('position').count).toBe(4);
    expect(() => Terrain.parse(new ArrayBuffer(20))).toThrow(/magic/);
  });

  it('[R-ENV-PERF] leaves out seabed quads that the opaque water hides', () => {
    const t = new Terrain(3, 2, 10, 0, 0, Int16Array.from([-10, -10, 20, -10, -10, -2]));
    expect(t.buildMesh(1).geometry.getIndex()!.count).toBe(6);
  });
});
