import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Cover, TreeKind, type TreeList } from './env-data';
import type { Landcover } from './landcover';

export interface Plant {
  x: number;
  z: number;
  kind: number;
  h: number;
  tint: number;
  seed: number;
}

export interface Density {
  street: number;
  wood: number;
  grass: number;
  scrub: number;
}

export function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function plantTrees(street: TreeList, cover: Landcover, d: Density, blocked: (x: number, z: number) => boolean): Plant[] {
  const out: Plant[] = [];
  for (let i = 0; i < street.count; i++) {
    const r = hash01(i * 3 + 1);
    if (r >= d.street) continue;
    out.push({ x: street.x[i], z: street.z[i], kind: street.kind[i], h: street.height[i], tint: street.tint[i], seed: hash01(i * 7 + 5) });
  }
  const prob: Record<number, number> = { [Cover.Wood]: d.wood, [Cover.Grass]: d.grass, [Cover.Scrub]: d.scrub };
  for (let j = 0; j < cover.h; j++) {
    for (let i = 0; i < cover.w; i++) {
      const c = cover.cls[j * cover.w + i];
      const p = prob[c];
      if (!p) continue;
      const id = j * cover.w + i;
      if (hash01(id * 13 + 7) >= p) continue;
      const x = cover.minX + (i + hash01(id * 5 + 1)) * cover.cell;
      const z = cover.minZ + (j + hash01(id * 5 + 2)) * cover.cell;
      if (blocked(x, z)) continue;
      const r = hash01(id * 5 + 3);
      const seed = hash01(id * 5 + 4);
      if (c === Cover.Wood) {
        const kind = r < 0.45 ? TreeKind.Conifer : r < 0.85 ? TreeKind.Eucalyptus : TreeKind.Broadleaf;
        const h = kind === TreeKind.Eucalyptus ? 20 + seed * 16 : kind === TreeKind.Conifer ? 13 + seed * 10 : 9 + seed * 6;
        out.push({ x, z, kind, h, tint: kind === TreeKind.Eucalyptus ? 4 : 1, seed });
      } else if (c === Cover.Scrub) {
        out.push({ x, z, kind: r < 0.7 ? TreeKind.Broadleaf : TreeKind.Conifer, h: 3 + seed * 4, tint: r < 0.35 ? 4 : 1, seed });
      } else {
        const kind = r < 0.55 ? TreeKind.Broadleaf : r < 0.8 ? TreeKind.Conifer : TreeKind.Eucalyptus;
        out.push({ x, z, kind, h: kind === TreeKind.Eucalyptus ? 16 + seed * 12 : 8 + seed * 8, tint: kind === TreeKind.Eucalyptus ? 4 : seed < 0.5 ? 0 : 1, seed });
      }
    }
  }
  return out;
}

const SEASON: [number, number, number][][] = [
  [[0.36, 0.55, 0.26], [0.36, 0.55, 0.26], [0.36, 0.55, 0.26], [0.36, 0.55, 0.26]],
  [[0.2, 0.38, 0.2], [0.2, 0.38, 0.2], [0.2, 0.38, 0.2], [0.2, 0.38, 0.2]],
  [[0.42, 0.3, 0.32], [0.45, 0.2, 0.25], [0.45, 0.2, 0.25], [0.48, 0.42, 0.36]],
  [[0.96, 0.7, 0.8], [0.34, 0.52, 0.26], [0.6, 0.42, 0.26], [0.5, 0.45, 0.4]],
  [[0.46, 0.55, 0.42], [0.46, 0.55, 0.42], [0.46, 0.55, 0.42], [0.46, 0.55, 0.42]],
  [[0.4, 0.58, 0.28], [0.34, 0.52, 0.24], [0.68, 0.36, 0.2], [0.5, 0.4, 0.32]],
  [[0.44, 0.6, 0.28], [0.36, 0.54, 0.24], [0.72, 0.62, 0.28], [0.52, 0.46, 0.36]],
  [[0.38, 0.55, 0.3], [0.56, 0.48, 0.8], [0.4, 0.55, 0.3], [0.42, 0.5, 0.32]],
  [[0.26, 0.42, 0.24], [0.7, 0.18, 0.16], [0.26, 0.42, 0.24], [0.26, 0.42, 0.24]],
];

export function season(month: number): number {
  return month >= 2 && month <= 3 ? 0 : month >= 4 && month <= 8 ? 1 : month >= 9 && month <= 10 ? 2 : 3;
}

export function treeColor(tint: number, s: number, seed: number, out: THREE.Color): THREE.Color {
  const row = SEASON[tint] ?? SEASON[0];
  const c = row[s === 2 && seed < 0.4 ? 1 : s];
  const v = 0.86 + seed * 0.28;
  return out.setRGB(c[0] * v, c[1] * v, c[2] * v, THREE.SRGBColorSpace);
}

function paint(g: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(rgb, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const TRUNK: [number, number, number] = [0.42, 0.34, 0.27];
const LEAF: [number, number, number] = [1, 1, 1];

function blob(r: number, sy: number, y: number, x = 0, z = 0, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return paint(g, LEAF);
}

function trunk(r0: number, r1: number, h: number, seg = 5, rgb = TRUNK): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  return paint(g, rgb);
}

function palmFronds(n: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (k % 2) * 0.3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts = [
      [0, 0],
      [0.16, 0.06],
      [0.34, -0.06],
    ];
    const wid = [0.035, 0.07, 0.01];
    for (let s = 0; s < 2; s++) {
      const [r0, h0] = pts[s];
      const [r1, h1] = pts[s + 1];
      const w0 = wid[s];
      const w1 = wid[s + 1];
      const P = (r: number, h: number, w: number) => [ca * r - sa * w, y + h, sa * r + ca * w];
      const A = P(r0, h0, -w0);
      const B = P(r0, h0, w0);
      const C = P(r1, h1, -w1);
      const D = P(r1, h1, w1);
      pos.push(...A, ...C, ...B, ...B, ...C, ...D, ...A, ...B, ...C, ...B, ...D, ...C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, LEAF);
}

function octa(r: number, sy: number, y: number): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(1, sy, 1);
  g.translate(0, y, 0);
  return paint(g, LEAF);
}

export function treeGeometries(far = false): THREE.BufferGeometry[] {
  const merge = (parts: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  if (far)
    return [
      merge([trunk(0.05, 0.035, 0.45, 3), octa(0.4, 0.8, 0.66)]),
      merge([trunk(0.05, 0.03, 0.4, 3), octa(0.45, 0.6, 0.66)]),
      merge([trunk(0.04, 0.02, 0.62, 3, [0.78, 0.74, 0.66]), octa(0.26, 1.5, 0.74)]),
      merge([trunk(0.05, 0.035, 0.94, 3, [0.6, 0.5, 0.38]), octa(0.3, 0.25, 0.93)]),
    ];
  return [
    merge([trunk(0.05, 0.035, 0.45), blob(0.34, 0.85, 0.62), blob(0.22, 0.8, 0.78, 0.12, 0.08)]),
    merge([trunk(0.05, 0.03, 0.4), blob(0.4, 0.36, 0.55), blob(0.3, 0.4, 0.78, -0.08, 0.04), blob(0.18, 0.5, 0.92, 0.05, -0.03)]),
    merge([trunk(0.04, 0.02, 0.62, 5, [0.78, 0.74, 0.66]), blob(0.2, 1.4, 0.72, 0.04, 0), blob(0.16, 1.2, 0.86, -0.08, 0.06), blob(0.13, 1.1, 0.6, 0.1, -0.06)]),
    merge([trunk(0.05, 0.035, 0.94, 6, [0.6, 0.5, 0.38]), palmFronds(9, 0.92)]),
  ];
}

export interface TreeTile {
  key: string;
  cx: number;
  cz: number;
  meshes: THREE.InstancedMesh[];
  far: boolean;
}

let geoCache: { near: THREE.BufferGeometry[]; far: THREE.BufferGeometry[] } | null = null;

function geos(): { near: THREE.BufferGeometry[]; far: THREE.BufferGeometry[] } {
  return (geoCache ??= { near: treeGeometries(false), far: treeGeometries(true) });
}

export function setTreeLod(tile: TreeTile, far: boolean): void {
  if (tile.far === far) return;
  tile.far = far;
  const set = far ? geos().far : geos().near;
  for (const m of tile.meshes) m.geometry = set[m.userData.kind as number];
}

export function createTreeMaterial(time: { value: number }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float sway = sin(uTime * 1.3 + instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05) * 0.018 * max(transformed.y - 0.3, 0.0);
      transformed.x += sway;
      transformed.z += sway * 0.6;
      #endif`,
    );
  };
  return mat;
}

export function buildTreeTiles(plants: Plant[], ground: (x: number, z: number) => number, month: number, tile: number, mat: THREE.Material, shadows: boolean): TreeTile[] {
  const near = geos().near;
  const groups = new Map<string, Plant[][]>();
  for (const p of plants) {
    const key = `${Math.floor(p.x / tile)},${Math.floor(p.z / tile)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = [[], [], [], []]));
    g[p.kind]?.push(p);
  }
  const s = season(month);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const tiles: TreeTile[] = [];
  for (const [key, kinds] of groups) {
    const [ti, tj] = key.split(',').map(Number);
    const meshes: THREE.InstancedMesh[] = [];
    kinds.forEach((list, kind) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(near[kind], mat, list.length);
      mesh.userData.kind = kind;
      list.forEach((p, i) => {
        const w = p.h * (kind === TreeKind.Palm ? 0.9 : 0.75 + p.seed * 0.35);
        q.setFromAxisAngle(up, p.seed * Math.PI * 2);
        m.compose(pos.set(p.x, ground(p.x, p.z) - 0.2, p.z), q, scl.set(w, p.h, w));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, treeColor(p.tint, s, p.seed, col));
      });
      mesh.name = `trees:${key}:${kind}`;
      mesh.castShadow = shadows;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    });
    tiles.push({ key, cx: (ti + 0.5) * tile, cz: (tj + 0.5) * tile, meshes, far: false });
  }
  return tiles;
}
