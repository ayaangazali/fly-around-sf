import { ShapeUtils, Vector2 } from 'three';

export const CHUNK = 500;
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
  index: Uint16Array | Uint32Array;
  buildings: number;
}

const LOW_PALETTE = [
  [238, 232, 220], [244, 236, 214], [226, 214, 196], [236, 222, 204], [214, 226, 232],
  [240, 220, 206], [222, 230, 214], [232, 210, 196], [210, 214, 224], [246, 240, 228],
  [200, 216, 206], [236, 200, 186],
];
const TALL_PALETTE = [
  [176, 190, 204], [196, 200, 206], [160, 176, 192], [212, 206, 196], [150, 166, 178],
];

function hash(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function buildingColor(b: number, height: number): [number, number, number] {
  const pal = height > 35 ? TALL_PALETTE : LOW_PALETTE;
  return pal[hash(b) % pal.length] as [number, number, number];
}

export function chunkKey(x: number, z: number): string {
  return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
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
  let verts = 0;
  for (const b of list) verts += d.len[b] * 2;
  const position = new Float32Array(verts * 3);
  const color = new Uint8Array(verts * 3);
  const index: number[] = [];
  let v = 0;
  let sx = 0;
  let sz = 0;
  for (const b of list) {
    const n = d.len[b];
    const s = d.start[b];
    const base = d.ground[b] - SKIRT;
    const top = d.ground[b] + d.height[b];
    const [r, g, bl] = buildingColor(b, d.height[b]);
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
      index.push(a0, b1, b0, a0, a1, b1);
    }
    for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
      const ax = contour[i].x, az = contour[i].y;
      const bx = contour[j].x, bz = contour[j].y;
      const cx = contour[k].x, cz = contour[k].y;
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny >= 0) index.push(v + n + i, v + n + j, v + n + k);
      else index.push(v + n + i, v + n + k, v + n + j);
    }
    sx += d.cx[b];
    sz += d.cz[b];
    v += n * 2;
  }
  return { key, cx: sx / list.length, cz: sz / list.length, position, color, index: v < 65536 ? Uint16Array.from(index) : Uint32Array.from(index), buildings: list.length };
}
