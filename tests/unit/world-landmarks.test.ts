import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOUNDS, toLocal } from '../../src/core/geo';
import { CityData } from '../../src/world/city-data';
import { Terrain } from '../../src/world/terrain';
import { World, type Landmark } from '../../src/world/world';
import { createCityMaterial } from '../../src/world/city';
import { Site, catenary, inside, loft, roundedRect, yawBetween, type LandmarkSource, type Pt } from '../../src/world/landmark-kit';
import { TOWERS, HEIGHT_FIXES } from '../../src/world/landmarks/skyline-modern';
import { clockAngles } from '../../src/world/landmarks/ferry-building';
import type { Game } from '../../src/game';

interface LandmarkModule {
  landmark: Landmark;
  source: LandmarkSource;
  FACTS?: { sources: string[] };
}

const modules = import.meta.glob<LandmarkModule>('../../src/world/landmarks/*.ts', { eager: true });
const entries = Object.entries(modules).map(([path, m]) => ({ file: path.split('/').pop()!.replace('.ts', ''), ...m }));

function cityBuffer(buildings: { h: number; ring: [number, number][] }[]): ArrayBuffer {
  const ints = buildings.reduce((n, b) => n + 3 + b.ring.length * 2, 0);
  const buf = new ArrayBuffer(8 + ints * 2);
  new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x43, 0x32]);
  new DataView(buf).setUint32(4, buildings.length, true);
  const out = new Int16Array(buf, 8);
  let o = 0;
  for (const b of buildings) {
    out[o++] = b.h * 10;
    out[o++] = 0;
    out[o++] = b.ring.length;
    let px = 0;
    let pz = 0;
    for (const [x, z] of b.ring) {
      out[o++] = Math.round(x * 2) - px;
      out[o++] = Math.round(z * 2) - pz;
      px = Math.round(x * 2);
      pz = Math.round(z * 2);
    }
  }
  return buf;
}

const square = (lat: number, lon: number, half: number): [number, number][] => {
  const { x, z } = toLocal(lat, lon);
  return [
    [x - half, z - half],
    [x + half, z - half],
    [x + half, z + half],
    [x - half, z + half],
  ];
};

function landmarkGame(buildings: { h: number; ring: [number, number][] }[] = [], ground = 0): Game {
  const terrain = new Terrain(2, 2, 100000, -50000, -50000, Int16Array.from([ground * 10, ground * 10, ground * 10, ground * 10]));
  const city = new CityData(cityBuffer(buildings), () => ground);
  const world = new World(terrain, city);
  return { world, cityRenderer: { material: createCityMaterial() }, date: () => new Date('2026-10-19T19:30:00Z') } as unknown as Game;
}

function vertexCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) n += c.geometry.getAttribute('position').count;
  });
  return n;
}

describe('hand-built landmarks', () => {
  it('[R-LANDMARKS] at least 22 hero landmarks with unique slugs matching their file names', () => {
    const ids = entries.map((e) => e.landmark.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(entries.filter((e) => e.landmark.id !== 'skyline-modern').length).toBeGreaterThanOrEqual(22);
    for (const e of entries) {
      expect(e.landmark.id).toBe(e.file);
      expect(e.landmark.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('[R-LANDMARKS] every landmark has a sourced coordinate inside San Francisco and facts with sources', () => {
    for (const e of entries) {
      const s = e.source;
      expect(s.lat, e.file).toBeGreaterThanOrEqual(BOUNDS.south);
      expect(s.lat, e.file).toBeLessThanOrEqual(BOUNDS.north);
      expect(s.lon, e.file).toBeGreaterThanOrEqual(BOUNDS.west);
      expect(s.lon, e.file).toBeLessThanOrEqual(BOUNDS.east);
      expect(s.url, e.file).toMatch(/^https:\/\//);
      expect(s.name.length, e.file).toBeGreaterThan(3);
      if (e.FACTS) for (const u of e.FACTS.sources) expect(u, e.file).toMatch(/^https:\/\//);
    }
  });

  for (const e of entries) {
    it(`[R-LANDMARKS] ${e.file} builds geometry, sits within 40 m of its source and collides`, () => {
      const game = landmarkGame();
      const before = game.world.colliders.length;
      e.landmark.build(game);
      const group = game.world.root.getObjectByName(`landmark:${e.landmark.id}`);
      expect(group, e.file).toBeTruthy();
      expect(vertexCount(group!), e.file).toBeGreaterThan(100);
      expect(game.world.colliders.length, e.file).toBeGreaterThan(before);
      const at = toLocal(e.source.lat, e.source.lon);
      expect(Math.hypot(group!.position.x - at.x, group!.position.z - at.z), e.file).toBeLessThanOrEqual(40);
      const box = new THREE.Box3().setFromObject(group!);
      const c = box.getCenter(new THREE.Vector3());
      let hit = false;
      for (let i = 0; i < 400 && !hit; i++) {
        const t = (i * 0.618034) % 1;
        const u = (i * 0.754877) % 1;
        const v = (i * 0.569840) % 1;
        const p = { x: box.min.x + (box.max.x - box.min.x) * t, y: box.min.y + (box.max.y - box.min.y) * u, z: box.min.z + (box.max.z - box.min.z) * v };
        hit = game.world.collide(p, 1.2);
      }
      expect(hit, `${e.file} has a reachable solid near ${c.x.toFixed(0)},${c.z.toFixed(0)}`).toBe(true);
    });
  }

  it('[R-LANDMARKS] exclusions hide the raw footprints under hero models', () => {
    const withExclusions = entries.filter((e) => e.landmark.exclusions?.length);
    expect(withExclusions.length).toBeGreaterThanOrEqual(15);
    const game = landmarkGame([{ h: 68, ring: square(37.795166, -122.402786, 10) }, { h: 12, ring: square(37.7985, -122.4100, 6) }]);
    game.world.city.applyExclusions(entries.flatMap((e) => e.landmark.exclusions ?? []));
    expect(game.world.city.hidden[0]).toBe(1);
    expect(game.world.city.hidden[1]).toBe(0);
  });

  it('[R-LANDMARKS] the drone flies under the Golden Gate deck but bounces off its towers', () => {
    const game = landmarkGame();
    entries.find((e) => e.file === 'golden-gate-bridge')!.landmark.build(game);
    const mid = toLocal(37.8197535, -122.478572);
    expect(game.world.collide({ x: mid.x, y: 30, z: mid.z }, 1.2)).toBe(false);
    expect(game.world.collide({ x: mid.x, y: 70, z: mid.z }, 1.2)).toBe(true);
    const tower = toLocal(37.814009, -122.477901);
    for (const dx of [-13.6, 13.6]) expect(game.world.collide({ x: tower.x + dx, y: 150, z: tower.z }, 1.2)).toBe(true);
    expect(game.world.collide({ x: tower.x, y: 140, z: tower.z }, 1.2)).toBe(false);
    expect(game.world.collide({ x: tower.x, y: 260, z: tower.z }, 1.2)).toBe(false);
  });

  it('[R-LANDMARK-CLOCK] Ferry Building clock hands follow Pacific time', () => {
    const noonish = clockAngles(new Date('2026-10-19T19:30:00Z'));
    expect(noonish.minute).toBeCloseTo(Math.PI, 5);
    expect(noonish.hour).toBeCloseTo(((12 % 12) + 0.5) / 12 * Math.PI * 2, 5);
    const winter = clockAngles(new Date('2026-01-15T01:15:00Z'));
    expect(winter.hour).toBeCloseTo((5.25 / 12) * Math.PI * 2, 5);
    expect(winter.minute).toBeCloseTo(Math.PI / 2, 5);
  });

  it('[R-LANDMARK-NIGHT] night materials are driven by the shared night factor and beacons blink', () => {
    const game = landmarkGame();
    for (const e of entries) e.landmark.build(game);
    const kinds = new Set<string>();
    game.world.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.Material;
      const key = m.customProgramCacheKey();
      if (/^(glow|beacon|sparkle|crown)/.test(key)) kinds.add(key.split(':')[0]);
      if (m.userData.animated) expect(o.onBeforeRender, o.name).not.toBe(THREE.Object3D.prototype.onBeforeRender);
    });
    expect([...kinds].sort()).toEqual(['beacon', 'crown', 'glow', 'sparkle']);
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    const sample = new Map<string, THREE.Material>();
    game.world.root.traverse((o) => {
      if (o instanceof THREE.Mesh) sample.set((o.material as THREE.Material).customProgramCacheKey().split(':')[0], o.material as THREE.Material);
    });
    const beaconMat = sample.get('beacon')!;
    beaconMat.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.uNight).toBeDefined();
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= uNight');
    expect(shader.fragmentShader).toContain('uTime');
  });
});

describe('modern skyline', () => {
  it('[R-SKYLINE] post-2010 towers are listed with sourced heights and real footprints', () => {
    const names = TOWERS.map((t) => t.name);
    for (const required of ['181 Fremont', 'Park Tower at Transbay', 'The Avery', '350 Mission Street', '399 Fremont Street', 'Mira', '33 Tehama', '500 Folsom']) {
      expect(names).toContain(required);
    }
    expect(TOWERS.filter((t) => t.year > 2010).length).toBeGreaterThanOrEqual(10);
    for (const t of TOWERS) {
      expect(t.top, t.name).toBeGreaterThanOrEqual(t.roof);
      expect(t.roof, t.name).toBeGreaterThan(90);
      expect(t.url, t.name).toMatch(/^https:\/\/en\.wikipedia\.org\//);
      expect(t.osm, t.name).toMatch(/^https:\/\/www\.openstreetmap\.org\/way\/\d+$/);
      let area = 0;
      for (let i = 0; i < t.ring.length; i++) area += t.ring[i][0] * t.ring[(i + 1) % t.ring.length][1] - t.ring[(i + 1) % t.ring.length][0] * t.ring[i][1];
      expect(Math.abs(area) / 2, t.name).toBeGreaterThan(300);
    }
    expect(TOWERS.find((t) => t.name === '181 Fremont')!.top).toBeGreaterThanOrEqual(240);
  });

  it('[R-SKYLINE] Salesforce Tower collides up to 320 m and 181 Fremont above 240 m', () => {
    const game = landmarkGame();
    for (const id of ['salesforce-tower', 'skyline-modern']) entries.find((e) => e.file === id)!.landmark.build(game);
    const sf = toLocal(37.789775, -122.39693);
    for (const y of [20, 150, 300, 319]) expect(game.world.collide({ x: sf.x, y, z: sf.z }, 1.2), `salesforce ${y}`).toBe(true);
    expect(game.world.collide({ x: sf.x, y: 340, z: sf.z }, 1.2)).toBe(false);
    const fremont = TOWERS.find((t) => t.name === '181 Fremont')!;
    const f = toLocal(fremont.lat, fremont.lon);
    expect(game.world.collide({ x: f.x, y: 241, z: f.z }, 1.2)).toBe(true);
    expect(game.world.collide({ x: f.x, y: 255, z: f.z }, 1.2)).toBe(false);
  });

  it('[R-SKYLINE] old footprints under new towers are hidden and wrong heights are fixed', () => {
    const fremont = TOWERS.find((t) => t.name === '181 Fremont')!;
    const fix = HEIGHT_FIXES[0];
    const game = landmarkGame([
      { h: 5, ring: square(fremont.lat, fremont.lon, 4) },
      { h: 85, ring: square(fix.lat, fix.lon, 12) },
      { h: 40, ring: square(37.7952, -122.4100, 8) },
    ]);
    entries.find((e) => e.file === 'skyline-modern')!.landmark.build(game);
    const city = game.world.city;
    expect(city.hidden[0]).toBe(1);
    expect(city.height[1]).toBeCloseTo(fix.height, 1);
    expect(city.hidden[2]).toBe(0);
    expect(city.height[2]).toBe(40);
  });
});

describe('landmark kit', () => {
  it('[R-LANDMARKS] catenary hangs with the requested sag and symmetric ends', () => {
    const f = catenary(1280, 143);
    expect(f(0)).toBeCloseTo(0, 6);
    expect(f(640)).toBeCloseTo(143, 1);
    expect(f(-320)).toBeCloseTo(f(320), 6);
    expect(f(320)).toBeLessThan(143 / 3);
  });

  it('[R-LANDMARKS] box, cylinder and prism colliders push the drone out of the nearest face', () => {
    const game = landmarkGame();
    const site = new Site(game, 'probe', { lat: 37.77, lon: -122.43 }, 0.5, 0);
    site.solidBox(0, 0, 0, 10, 20, 10, 0.3).solidCyl(40, 0, 0, 5, 30).solidPrism([[80, -5], [90, -5], [90, 5], [80, 5]], 0, 10);
    expect(site.solidCount).toBe(3);
    const w = (x: number, z: number, y: number) => ({ ...site.world(x, z), y });
    const top = w(0, 0, 19.5);
    expect(site.collide(top, 1)).toBe(true);
    expect(top.y).toBeCloseTo(21, 5);
    const side = w(4.8, 0, 5);
    expect(site.collide(side, 1)).toBe(true);
    const back = site.local(side.x, side.z);
    expect(Math.hypot(back.x, back.z)).toBeGreaterThan(5);
    const cyl = w(44.5, 0, 10);
    expect(site.collide(cyl, 1)).toBe(true);
    const lc = site.local(cyl.x, cyl.z);
    expect(Math.hypot(lc.x - 40, lc.z)).toBeCloseTo(6, 5);
    const under = w(40, 0, -0.5);
    expect(site.collide(under, 1)).toBe(true);
    expect(under.y).toBeCloseTo(-1, 5);
    const pr = w(85, 4.5, 5);
    expect(site.collide(pr, 1)).toBe(true);
    expect(site.local(pr.x, pr.z).z).toBeCloseTo(6, 5);
    const outside = w(95, 0, 5);
    expect(site.collide(outside, 1)).toBe(false);
    const roofP = w(85, 0, 9.8);
    site.collide(roofP, 1);
    expect(roofP.y).toBeCloseTo(11, 5);
    expect(site.collide(w(0, 0, 40), 1)).toBe(false);
  });

  it('[R-LANDMARKS] geometry helpers keep winding outward and rings closed', () => {
    const r = roundedRect(20, 10, 3);
    expect(r.length).toBe(20);
    const g = loft([
      { y: 0, ring: [...r].reverse() },
      { y: 5, ring: [...r].reverse() },
    ]);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBe(5);
    const n = g.getAttribute('normal');
    const p = g.getAttribute('position');
    let outward = 0;
    for (let i = 0; i < r.length * 6; i++) outward += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i) > 0 ? 1 : 0;
    expect(outward).toBe(r.length * 6);
    const ring: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(inside(ring.map(([x, z]) => ({ x, z })), 5, 5)).toBe(true);
    expect(inside(ring.map(([x, z]) => ({ x, z })), 15, 5)).toBe(false);
    expect(yawBetween({ lat: 37.77, lon: -122.43 }, { lat: 37.77, lon: -122.42 })).toBeCloseTo(Math.PI / 2, 5);
  });
});
