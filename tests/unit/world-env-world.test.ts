import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Terrain } from '../../src/world/terrain';
import { Road, Cover, TreeKind, type Polyline, type TreeList } from '../../src/world/env-data';
import { buildRoads, createRoadMaterial, resample, roadMesh, ROAD } from '../../src/world/streets';
import { Landcover, patchGround } from '../../src/world/landcover';
import { buildTreeTiles, createTreeMaterial, hash01, plantTrees, season, setTreeLod, treeColor, treeGeometries } from '../../src/world/trees';
import { createWaterMaterial, waterTexture, type WaterUniforms } from '../../src/world/water';

function terrain(w: number, h: number, cell: number, f: (i: number, j: number) => number): Terrain {
  const grid = new Int16Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[j * w + i] = Math.round(f(i, j) * 10);
  return new Terrain(w, h, cell, 0, 0, grid);
}

const line = (cls: number, pts: [number, number][]): Polyline => ({ cls, xs: Float32Array.from(pts.map((p) => p[0])), zs: Float32Array.from(pts.map((p) => p[1])) });

function compile(mat: THREE.Material, lib: 'lambert'): { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> } {
  const shader = { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib[lib].uniforms), vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader };
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

describe('terrain draping', () => {
  it('[R-ENV-STREETS] meshHeightAt reproduces the rendered terrain triangles at every stride', () => {
    const t = terrain(9, 9, 16, (i, j) => i * 3 + ((i * j) % 5) * 2);
    for (const stride of [1, 2]) {
      const mesh = t.buildMesh(stride);
      const pos = mesh.geometry.getAttribute('position');
      const idx = mesh.geometry.getIndex()!;
      for (let k = 0; k < idx.count; k += 3) {
        const v = [0, 1, 2].map((o) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(k + o)));
        const c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
        for (const p of [...v, c]) expect(t.meshHeightAt(p.x, p.z, stride)).toBeCloseTo(p.y, 4);
      }
    }
  });
});

describe('streets', () => {
  const flat = () => 10;

  it('[R-ENV-STREETS] resamples polylines without exceeding the step and keeps arc length', () => {
    const s = resample(Float32Array.from([0, 100, 100]), Float32Array.from([0, 0, 35]), 8);
    expect(s[0]).toEqual({ x: 0, z: 0, u: 0 });
    expect(s.at(-1)!.u).toBeCloseTo(135);
    for (let i = 1; i < s.length; i++) expect(s[i].u - s[i - 1].u).toBeLessThanOrEqual(8 + 1e-6);
    expect(resample(Float32Array.from([5, 5]), Float32Array.from([5, 5]), 8)).toHaveLength(1);
  });

  it('[R-ENV-STREETS] drapes ribbons on the terrain with class widths and lamps along the curb', () => {
    const r = buildRoads([line(Road.Boulevard, [[0, 0], [400, 0]]), line(Road.Residential, [[0, 100], [400, 100]]), line(Road.Path, [[0, 200], [100, 200]])], flat, { step: 8, tile: 2000, piece: 400 });
    expect(r.tiles).toHaveLength(1);
    const t = r.tiles[0];
    const widthAt = (cls: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let v = 0; v < t.road.length / 3; v++) if (t.road[v * 3 + 2] === cls) [lo, hi] = [Math.min(lo, t.road[v * 3 + 1]), Math.max(hi, t.road[v * 3 + 1])];
      return hi - lo;
    };
    expect(widthAt(Road.Boulevard)).toBeCloseTo(2 * (ROAD[Road.Boulevard].half + ROAD[Road.Boulevard].walk));
    expect(widthAt(Road.Boulevard)).toBeGreaterThan(widthAt(Road.Residential));
    expect(widthAt(Road.Residential)).toBeGreaterThan(widthAt(Road.Path));
    for (let v = 1; v < t.position.length; v += 3) {
      expect(t.position[v]).toBeGreaterThan(10.2);
      expect(t.position[v]).toBeLessThan(10.7);
    }
    expect(r.meters).toBeCloseTo(400 + 20 + 400 + 10 + 100 + 3.2, 0);
    const lamps = r.lamps.length / 4;
    expect(lamps).toBe(Math.floor(400 / 26 + 0.5) + Math.floor(400 / 38 + 0.5));
    expect(r.lamps[1]).toBeCloseTo(17.5);
    expect(Math.abs(r.lamps[2])).toBeCloseTo(ROAD[Road.Boulevard].half);
    expect(Math.sign(r.lamps[2])).not.toBe(Math.sign(r.lamps[6]));
    expect(t.normal[1]).toBe(127);
  });

  it('[R-ENV-STREETS] breaks ribbons over water, splits long streets into tiles and meshes them', () => {
    const water = (x: number) => (x > 150 && x < 250 ? -5 : 2);
    const r = buildRoads([line(Road.Freeway, [[0, 0], [400, 0]])], water, { step: 10, tile: 200, piece: 100 });
    expect(r.tiles.length).toBeGreaterThan(1);
    expect(r.meters).toBeLessThan(330);
    expect(r.lamps.length / 4).toBeLessThan(8);
    const m = roadMesh(r.tiles[0], new THREE.MeshBasicMaterial());
    expect(m.name).toMatch(/^roads:/);
    expect(m.geometry.getAttribute('aRoad').itemSize).toBe(3);
    expect(buildRoads([line(Road.Residential, [[0, 0], [0, 0]])], water, { step: 10, tile: 200, piece: 100 }).tiles).toHaveLength(0);
  });

  it('[R-ENV-STREETS] road shader injects markings and night light pools', () => {
    const night = { value: 0.7 };
    const s = compile(createRoadMaterial(night), 'lambert');
    expect(s.uniforms.uNight).toBe(night);
    expect(s.vertexShader).toContain('attribute vec3 aRoad');
    expect(s.fragmentShader).toContain('roadLamp');
    expect(s.fragmentShader).toContain('diffuseColor.rgb = col');
  });
});

describe('land cover', () => {
  const sq = (x: number, z: number, s: number) => ({ xs: Float32Array.from([x, x + s, x + s, x]), zs: Float32Array.from([z, z, z + s, z + s]) });

  it('[R-ENV-GREEN] rasterizes polygons with holes, later classes winning', () => {
    const lc = Landcover.rasterize(
      [
        { cls: Cover.Grass, rings: [sq(0, 0, 80), sq(20, 20, 20)] },
        { cls: Cover.Sand, rings: [sq(60, 60, 40)] },
      ],
      { w: 12, h: 12, cell: 10, minX: 0, minZ: 0 },
    );
    expect(lc.at(5, 5)).toBe(Cover.Grass);
    expect(lc.at(30, 30)).toBe(0);
    expect(lc.at(70, 70)).toBe(Cover.Sand);
    expect(lc.at(95, 95)).toBe(Cover.Sand);
    expect(lc.at(115, 5)).toBe(0);
    expect(lc.at(-5, 5)).toBe(0);
    expect(lc.index(500, 5)).toBe(-1);
  });

  it('[R-ENV-GREEN] packs classes into blendable texture channels and patches the ground shader', () => {
    const lc = new Landcover(5, 1, 10, 0, 0);
    lc.cls.set([Cover.Grass, Cover.Wood, Cover.Scrub, Cover.Sand, Cover.Lake]);
    expect(Array.from(lc.rgba())).toEqual([255, 0, 0, 0, 0, 255, 0, 0, 150, 105, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255]);
    const tex = lc.texture();
    expect(tex.image.width).toBe(5);
    const mat = new THREE.MeshLambertMaterial();
    patchGround(mat, tex, lc, { value: 0 });
    const s = compile(mat, 'lambert');
    expect(s.uniforms.uCover.value).toBe(tex);
    expect(s.fragmentShader).toContain('cov.g');
  });
});

describe('trees', () => {
  const street: TreeList = {
    count: 100,
    x: Float32Array.from({ length: 100 }, (_, i) => i * 3),
    z: new Float32Array(100),
    kind: new Uint8Array(100).fill(TreeKind.Palm),
    height: new Float32Array(100).fill(12),
    tint: new Uint8Array(100),
  };

  it('[R-ENV-GREEN] plants every street tree at full density and fills forests by density', () => {
    const lc = new Landcover(40, 40, 8, 0, 0);
    lc.cls.fill(Cover.Wood, 0, 800);
    lc.cls.fill(Cover.Grass, 800, 1600);
    const full = plantTrees(street, lc, { street: 1, wood: 0.5, grass: 0.05, scrub: 0 }, () => false);
    const thin = plantTrees(street, lc, { street: 0.3, wood: 0.1, grass: 0.05, scrub: 0 }, () => false);
    const none = plantTrees(street, lc, { street: 0, wood: 0.5, grass: 0.05, scrub: 0 }, () => true);
    expect(full.filter((p) => p.kind === TreeKind.Palm && p.h === 12).length).toBe(100);
    expect(thin.length).toBeLessThan(full.length / 2);
    expect(none).toHaveLength(0);
    const wood = full.filter((p) => p.z < 160 && p.h !== 12).length;
    expect(wood / 800).toBeGreaterThan(0.4);
    expect(wood / 800).toBeLessThan(0.6);
    for (const p of full) expect(p.h).toBeGreaterThan(0);
    expect(hash01(7)).toBeGreaterThanOrEqual(0);
    expect(hash01(7)).toBeLessThan(1);
  });

  it('[R-ENV-GREEN] colors trees by season and builds instanced tiles with a far LOD', () => {
    expect([2, 5, 10, 0].map(season)).toEqual([0, 1, 2, 3]);
    const c = new THREE.Color();
    expect(treeColor(3, 0, 0.5, c).r).toBeGreaterThan(c.g);
    expect(treeColor(0, 1, 0.5, c).g).toBeGreaterThan(c.r);
    expect(treeColor(99, 1, 0.5, c).g).toBeGreaterThan(c.r);
    const near = treeGeometries();
    const far = treeGeometries(true);
    for (let k = 0; k < 4; k++) {
      const tris = near[k].getAttribute('position').count / 3;
      expect(tris).toBeLessThanOrEqual(90);
      expect(far[k].getAttribute('position').count / 3).toBeLessThan(tris / 2);
      for (const g of [near[k], far[k]]) {
        const leaf = g.getAttribute('aLeaf');
        const col = g.getAttribute('color');
        const seen = new Set<number>();
        for (let i = 0; i < leaf.count; i++) {
          seen.add(leaf.getX(i));
          expect(col.getX(i) + col.getY(i) + col.getZ(i) === 3).toBe(leaf.getX(i) === 1);
        }
        expect([...seen].sort()).toEqual([0, 1]);
      }
    }
    const plants = [
      { x: 10, z: 10, kind: TreeKind.Broadleaf, h: 8, tint: 0, seed: 0.2 },
      { x: 20, z: 10, kind: TreeKind.Palm, h: 12, tint: 0, seed: 0.7 },
      { x: 1600, z: 10, kind: TreeKind.Conifer, h: 15, tint: 1, seed: 0.4 },
    ];
    const tiles = buildTreeTiles(plants, () => 3, 9, 1000, createTreeMaterial({ value: 0 }), true);
    expect(tiles).toHaveLength(2);
    const first = tiles.find((t) => t.key === '0,0')!;
    expect(first.meshes.map((m) => m.count)).toEqual([1, 1]);
    const m = new THREE.Matrix4();
    first.meshes[0].getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeCloseTo(2.8);
    const g = first.meshes[0].geometry;
    setTreeLod(first, true);
    expect(first.meshes[0].geometry).not.toBe(g);
    setTreeLod(first, true);
    setTreeLod(first, false);
    expect(first.meshes[0].geometry).toBe(g);
    expect(first.meshes[0].castShadow).toBe(true);
  });

  it('[R-ENV-GREEN] tree shader sways instances in the wind', () => {
    const time = { value: 3 };
    const s = compile(createTreeMaterial(time), 'lambert');
    expect(s.uniforms.uTime).toBe(time);
    expect(s.vertexShader).toContain('sway');
  });
});

describe('water', () => {
  it('[R-ENV-WATER] encodes bathymetry depth and a city-glow halo near land', () => {
    const t = terrain(60, 60, 16, (i) => (i < 30 ? -20 + i * 0.5 : 10));
    const tex = waterTexture(t);
    const d = tex.image.data as Uint8Array;
    const px = (i: number, j: number) => (j * 60 + i) * 4;
    expect(d[px(0, 30)]).toBe(80);
    expect(d[px(29, 30)]).toBe(22);
    expect(d[px(40, 30)]).toBe(0);
    expect(d[px(28, 30) + 1]).toBeGreaterThan(d[px(2, 30) + 1]);
  });

  it('[R-ENV-WATER] water shader animates waves, reflects the sky and glints', () => {
    const t = terrain(4, 4, 16, () => -5);
    const u: WaterUniforms = {
      uTime: { value: 1 },
      uNight: { value: 0 },
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uGlintDir: { value: new THREE.Vector3(0, 1, 0) },
      uGlint: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uDetail: { value: 1 },
    };
    const s = compile(createWaterMaterial(u, waterTexture(t), t), 'lambert');
    expect(s.uniforms.uTime).toBe(u.uTime);
    expect(s.fragmentShader).toContain('waterNormal');
    expect(s.fragmentShader).toContain('fres');
    expect(s.fragmentShader.indexOf('skyR')).toBeLessThan(s.fragmentShader.lastIndexOf('#include <fog_fragment>'));
  });
});
