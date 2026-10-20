import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CityData, NO_GROUND } from '../../src/world/city-data';
import * as THREE from 'three';
import { buildChunks, buildChunk, buildingColor, buildingStyle, chunkKey, PALETTES } from '../../src/world/city-mesh';
import { CityRenderer } from '../../src/world/city';
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

  it('[R-V2-COLOR] colors buildings by neighborhood, height and footprint', () => {
    const at = (lat: number, lon: number, h: number, area: number) => {
      const p = toLocal(lat, lon);
      return Array.from({ length: 300 }, (_, b) => buildingStyle(b, h, area, p.x, p.z));
    };
    const has = (palette: number[][], c: number[]) => palette.some((p) => p.join() === c.join());
    const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const homes = at(37.7765, -122.4345, 9, 150);
    expect(homes.every((s) => !s.glass && has(PALETTES.victorian, s.color))).toBe(true);
    expect(new Set(homes.map((s) => s.color.join())).size).toBeGreaterThan(20);
    expect(lum(homes.map((s) => s.color).sort((a, b) => lum(a) - lum(b))[150])).toBeGreaterThan(0.5);
    expect(homes.filter((s) => Math.max(...s.color) - Math.min(...s.color) > 90).length).toBeGreaterThan(30);
    expect(at(37.755, -122.49, 9, 150).every((s) => has(PALETTES.stucco, s.color))).toBe(true);
    expect(at(37.7765, -122.4345, 22, 400).every((s) => has(PALETTES.masonry, s.color))).toBe(true);
    expect(at(37.7765, -122.4345, 8, 3000).every((s) => has(PALETTES.industrial, s.color))).toBe(true);
    const towers = at(37.7905, -122.3995, 150, 2000);
    const glass = towers.filter((s) => s.glass);
    expect(glass.length / towers.length).toBeGreaterThan(0.35);
    expect(glass.every((s) => s.color[2] > s.color[0])).toBe(true);
    expect(towers.filter((s) => !s.glass).every((s) => has(PALETTES.tower, s.color))).toBe(true);
    expect(at(37.745, -122.42, 150, 2000).filter((s) => s.glass).length / 300).toBeLessThan(0.25);
  });

  it('[R-V2-LOD] far chunks draw only their bigger buildings and near chunks draw all of them', () => {
    const c = new CityData(synthetic([{ h: 4, g: 0, ring: square(0, 0, 4) }, { h: 60, g: 0, ring: square(20, 0, 30) }, { h: 10, g: 0, ring: square(60, 0, 8) }]), () => 0);
    const ch = buildChunk(c, chunkKey(0, 0), [0, 1, 2]);
    expect(ch.lod).toEqual([90, 60, 60, 60, 30, 30, 30, 30]);
    expect(ch.position[0]).toBeGreaterThanOrEqual(20);
    const r = new CityRenderer();
    (r as unknown as { add(c: unknown): void }).add(ch);
    const mesh = r.group.children[0] as THREE.Mesh;
    const cam = new THREE.PerspectiveCamera(60, 1.6, 1, 30000);
    const drawn = (z: number) => {
      cam.position.set(30, 20, z);
      mesh.onBeforeRender({ domElement: { height: 800 } } as never, mesh.parent as never, cam, mesh.geometry, mesh.material as never, null as never);
      return mesh.geometry.drawRange.count;
    };
    expect(drawn(60)).toBe(90);
    expect(drawn(3000)).toBe(60);
    expect(drawn(20000)).toBe(30);
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

  it('[R-V2-SHORE] the downtown waterfront gets flat pier decks and vertical seawalls', () => {
    const grid = (lat: number, lon: number) => {
      const p = toLocal(lat, lon);
      const buf = new ArrayBuffer(20 + 4 * 2);
      const dv = new DataView(buf);
      new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x54, 0x31]);
      dv.setUint16(4, 4, true);
      dv.setUint16(6, 1, true);
      dv.setFloat32(8, 10, true);
      dv.setFloat32(12, p.x, true);
      dv.setFloat32(16, p.z, true);
      new Int16Array(buf, 20, 4).set([5, 12, -3, -150]);
      return Array.from(Terrain.parse(buf).grid);
    };
    expect(grid(37.7995, -122.3955)).toEqual([18, 18, -400, -400]);
    expect(grid(37.76, -122.48)).toEqual([5, 12, -3, -150]);
  });

  it('[R-ENV-PERF] leaves out seabed quads that the opaque water hides', () => {
    const t = new Terrain(3, 2, 10, 0, 0, Int16Array.from([-10, -10, 20, -10, -10, -2]));
    expect(t.buildMesh(1).geometry.getIndex()!.count).toBe(6);
  });
});
