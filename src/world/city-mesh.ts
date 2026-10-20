import { Color, ShapeUtils, Vector2 } from 'three';
import { toLocal } from '../core/geo';

export const CHUNK = 1000;
export const LOD_SIZES = [0, 5, 7, 9, 12, 16, 24, 40];
const SKIRT = 3;

export interface CityArrays {
  height: Float32Array;
  ground: Float32Array;
  start: Uint32Array;
  len: Uint16Array;
  xs: Float32Array;
  zs: Float32Array;
  cx: Float32Array;
  cz: Float32Array;
  hidden: Uint8Array;
}

export interface ChunkGeometry {
  key: string;
  cx: number;
  cz: number;
  position: Float32Array;
  color: Uint8Array;
  info: Uint16Array;
  index: Uint16Array | Uint32Array;
  lod: number[];
  buildings: number;
}

const linear = (hexes: string[]) => hexes.map((hex) => new Color(hex).toArray().map((c) => Math.round(c * 255)) as [number, number, number]);

export const PALETTES = {
  victorian: linear([
    '#f2ede2', '#efe6d2', '#ece0c4', '#f4ecd8', '#e9dcc0', '#eedc9f', '#e4cf8f', '#e7c46f', '#dccbaa', '#e8e4da',
    '#d6dcd4', '#c9d6dc', '#9fb8c9', '#a6bccb', '#b9cf9a', '#a9bd9f', '#e9cdbf', '#e3a990', '#c7b3d6', '#cdbfa8',
    '#bfa98a', '#93aeaa', '#7fa3b8', '#8e5b52', '#5e7c6c', '#d98f6a', '#a7c4b5', '#efe0b6',
  ]),
  stucco: linear(['#f1ece3', '#ebe3d3', '#e8dcc6', '#f2d6a2', '#efd9c4', '#e9c1c0', '#d9e2d6', '#c9dbe6', '#e6e1c1', '#d4e3c3', '#f0e4d8', '#c8d4c2', '#e2c6a8', '#d7d0c4', '#f3efe6']),
  masonry: linear(['#d9c8a6', '#cfb790', '#bba585', '#e2d7c0', '#a65a43', '#8f4d3b', '#b8735a', '#c7bfb0', '#9e9382', '#d4cbb8', '#b39c7c', '#c99a7a']),
  glass: linear(['#8fb3c4', '#7fa8ad', '#9dbccb', '#6f90a6', '#a5c0bd', '#b6c2ca', '#94a9b6', '#7f9fb5']),
  tower: linear(['#e0d6c2', '#cdbd9f', '#ebe5d8', '#9a6c5e', '#b9ab92', '#c9c3b6', '#d8cfbc', '#e6dccb']),
  industrial: linear(['#c9c1b1', '#b5ad9f', '#a8b0b4', '#8f9ca4', '#a5654d', '#c4b391', '#d8d2c6', '#98a090']),
};

const CORE_A = toLocal(37.7935, -122.3965);
const CORE_B = toLocal(37.7765, -122.417);
const MISSION_BAY = toLocal(37.7705, -122.3915);
const WEST_X = toLocal(37.77, -122.462).x;

function hash(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function coreness(x: number, z: number): number {
  const ex = CORE_B.x - CORE_A.x;
  const ez = CORE_B.z - CORE_A.z;
  const t = Math.max(0, Math.min(1, ((x - CORE_A.x) * ex + (z - CORE_A.z) * ez) / (ex * ex + ez * ez)));
  const d = Math.min(Math.hypot(x - CORE_A.x - ex * t, z - CORE_A.z - ez * t), Math.hypot(x - MISSION_BAY.x, z - MISSION_BAY.z) + 300);
  return d < 700 ? 1 : d > 1300 ? 0 : (1300 - d) / 600;
}

export interface Style {
  color: [number, number, number];
  glass: boolean;
}

export function buildingStyle(b: number, height: number, area: number, x: number, z: number): Style {
  const r = hash(b * 7 + 3);
  const pick = (p: [number, number, number][]) => p[r % p.length];
  const core = coreness(x, z) > (r >>> 20) / 4096;
  if (height >= 40) {
    const glass = (r >>> 8) % 100 < (core ? 50 : 15);
    return { color: pick(glass ? PALETTES.glass : PALETTES.tower), glass };
  }
  if (core && height >= 10) {
    const glass = (r >>> 8) % 100 < 18;
    return { color: pick(glass ? PALETTES.glass : PALETTES.masonry), glass };
  }
  if (height < 16 && area > 1400) return { color: pick(PALETTES.industrial), glass: false };
  if (height >= 16) return { color: pick(PALETTES.masonry), glass: false };
  return { color: pick(x < WEST_X ? PALETTES.stucco : PALETTES.victorian), glass: false };
}

export function buildingColor(b: number, height: number, area = 150, x = 0, z = 0): [number, number, number] {
  return buildingStyle(b, height, area, x, z).color;
}

export function buildingInfo(b: number, height: number, ground: number, glass = false): number {
  const cls = height < 12 ? 0 : height < 35 ? 1 : height < 90 ? 2 : 3;
  return Math.min(511, Math.max(0, Math.round(ground))) | (cls << 9) | ((glass ? 1 : 0) << 11) | ((hash(b * 31 + 7) & 15) << 12);
}

export function chunkKey(x: number, z: number): string {
  return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
}

export function footprintArea(d: CityArrays, b: number): number {
  const s = d.start[b];
  const n = d.len[b];
  let a = 0;
  for (let k = 0; k < n; k++) {
    const j = s + ((k + 1) % n);
    a += d.xs[s + k] * d.zs[j] - d.xs[j] * d.zs[s + k];
  }
  return Math.abs(a) / 2;
}

export function buildChunks(d: CityArrays): ChunkGeometry[] {
  const groups = new Map<string, number[]>();
  for (let b = 0; b < d.height.length; b++) {
    if (d.hidden[b]) continue;
    const k = chunkKey(d.cx[b], d.cz[b]);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(b);
  }
  const out: ChunkGeometry[] = [];
  for (const [key, list] of groups) out.push(buildChunk(d, key, list));
  return out;
}

export function buildChunk(d: CityArrays, key: string, list: number[]): ChunkGeometry {
  const area = new Map<number, number>();
  const size = new Map<number, number>();
  for (const b of list) {
    area.set(b, footprintArea(d, b));
    size.set(b, Math.max(d.height[b], Math.sqrt(area.get(b)!)));
  }
  const order = [...list].sort((a, b) => size.get(b)! - size.get(a)!);
  let verts = 0;
  for (const b of order) verts += d.len[b] * 2;
  const position = new Float32Array(verts * 3);
  const color = new Uint8Array(verts * 3);
  const info = new Uint16Array(verts);
  const index: number[] = [];
  const lod = LOD_SIZES.map(() => 0);
  let v = 0;
  let sx = 0;
  let sz = 0;
  for (const b of order) {
    const n = d.len[b];
    const s = d.start[b];
    const base = d.ground[b] - SKIRT;
    const top = d.ground[b] + d.height[b];
    const style = buildingStyle(b, d.height[b], area.get(b)!, d.cx[b], d.cz[b]);
    const [r, g, bl] = style.color;
    info.fill(buildingInfo(b, d.height[b], d.ground[b], style.glass), v, v + n * 2);
    const contour: Vector2[] = [];
    for (let k = 0; k < n; k++) {
      const x = d.xs[s + k];
      const z = d.zs[s + k];
      position.set([x, base, z], (v + k) * 3);
      position.set([x, top, z], (v + n + k) * 3);
      color.set([r, g, bl], (v + k) * 3);
      color.set([r, g, bl], (v + n + k) * 3);
      contour.push(new Vector2(x, z));
    }
    for (let k = 0; k < n; k++) {
      const a0 = v + k;
      const b0 = v + ((k + 1) % n);
      const a1 = a0 + n;
      const b1 = b0 + n;
      index.push(b0, a0, b1, a0, a1, b1);
    }
    for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
      const ax = contour[i].x, az = contour[i].y;
      const bx = contour[j].x, bz = contour[j].y;
      const cx = contour[k].x, cz = contour[k].y;
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny >= 0) index.push(v + n + i, v + n + j, v + n + k);
      else index.push(v + n + i, v + n + k, v + n + j);
    }
    for (let l = 0; l < LOD_SIZES.length; l++) if (size.get(b)! >= LOD_SIZES[l]) lod[l] = index.length;
    sx += d.cx[b];
    sz += d.cz[b];
    v += n * 2;
  }
  return { key, cx: sx / list.length, cz: sz / list.length, position, color, info, lod, index: v < 65536 ? Uint16Array.from(index) : Uint32Array.from(index), buildings: list.length };
}
