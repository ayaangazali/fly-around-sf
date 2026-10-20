import type { Game } from '../game';
import type { CityData } from '../world/city-data';
import type { Extent, MapView } from './map-view';
import { toScreen } from './map-view';

export interface BaseMap {
  canvas: HTMLCanvasElement;
  extent: Extent;
  mpp: number;
}

const BUCKETS: [number, string][] = [
  [8, '#69737e'],
  [16, '#7a8590'],
  [30, '#8d98a3'],
  [60, '#a7b1bb'],
  [120, '#c9d0d7'],
  [Infinity, '#ffd9b0'],
];

const LAND_LO = [46, 56, 52];
const LAND_HI = [96, 104, 80];
const WATER_SHALLOW = [34, 84, 116];
const WATER_DEEP = [12, 36, 62];

interface Build {
  map: BaseMap;
  ctx: CanvasRenderingContext2D;
  view: MapView;
  next: number;
}

let build: Build | null = null;
const CHUNK = 4000;

function begin(game: Game): Build {
  if (build) return build;
  const t = game.world.terrain;
  const up = 2;
  const extent = { minX: t.minX, minZ: t.minZ, maxX: t.minX + (t.w - 1) * t.cell, maxZ: t.minZ + (t.h - 1) * t.cell };
  const shade = document.createElement('canvas');
  shade.width = t.w;
  shade.height = t.h;
  const sctx = shade.getContext('2d') as CanvasRenderingContext2D;
  const img = sctx.createImageData(t.w, t.h);
  const e = (i: number, j: number) => t.grid[Math.min(t.h - 1, Math.max(0, j)) * t.w + Math.min(t.w - 1, Math.max(0, i))] / 10;
  const lx = -0.5;
  const ly = 0.7;
  const lz = -0.5;
  const paint = (o: number, lo: number[], hi: number[], k: number, light: number) => {
    for (let n = 0; n < 3; n++) img.data[o + n] = (lo[n] + (hi[n] - lo[n]) * k) * light;
    img.data[o + 3] = 255;
  };
  for (let j = 0; j < t.h; j++) {
    for (let i = 0; i < t.w; i++) {
      const y = e(i, j);
      const o = (j * t.w + i) * 4;
      if (y < 0) {
        paint(o, WATER_SHALLOW, WATER_DEEP, Math.min(1, -y / 40), 1);
      } else {
        const nx = (e(i - 1, j) - e(i + 1, j)) / (2 * t.cell);
        const nz = (e(i, j - 1) - e(i, j + 1)) / (2 * t.cell);
        const len = Math.hypot(nx * 3, 1, nz * 3);
        const lit = Math.max(0, (nx * 3 * lx + ly + nz * 3 * lz) / len / Math.hypot(lx, ly, lz));
        paint(o, LAND_LO, LAND_HI, Math.min(1, y / 250), 0.62 + lit * 0.55);
      }
    }
  }
  sctx.putImageData(img, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = t.w * up;
  canvas.height = t.h * up;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(shade, 0, 0, canvas.width, canvas.height);
  const mpp = t.cell / up;
  const view: MapView = { cx: extent.minX + (canvas.width / 2) * mpp, cz: extent.minZ + (canvas.height / 2) * mpp, scale: 1 / mpp, w: canvas.width, h: canvas.height };
  return (build = { map: { canvas, extent, mpp }, ctx, view, next: 0 });
}

function advance(game: Game, b: Build, deadline: number): boolean {
  const city = game.world.city;
  while (b.next < city.count) {
    const end = Math.min(city.count, b.next + CHUNK);
    drawBuildings(b.ctx, city, b.view, Array.from({ length: end - b.next }, (_, i) => b.next + i));
    b.next = end;
    if (performance.now() > deadline) return b.next >= city.count;
  }
  return true;
}

export function baseMap(game: Game): BaseMap {
  const b = begin(game);
  advance(game, b, Infinity);
  return b.map;
}

let ready: Promise<BaseMap> | null = null;

export function prepareBaseMap(game: Game): Promise<BaseMap> {
  return (ready ??= new Promise((resolve) => {
    const tick = () => {
      const b = begin(game);
      if (advance(game, b, performance.now() + 8)) resolve(b.map);
      else setTimeout(tick, 16);
    };
    setTimeout(tick, 16);
  }));
}

function drawBuildings(ctx: CanvasRenderingContext2D, city: CityData, v: MapView, ids: Iterable<number>): void {
  const groups: number[][] = BUCKETS.map(() => []);
  for (const b of ids) if (!city.hidden[b]) groups[BUCKETS.findIndex(([max]) => city.height[b] < max)].push(b);
  const k = v.scale;
  const ox = v.w / 2 - v.cx * k;
  const oy = v.h / 2 - v.cz * k;
  groups.forEach((list, i) => {
    ctx.fillStyle = BUCKETS[i][1];
    ctx.beginPath();
    list.forEach((b, m) => {
      const s = city.start[b];
      ctx.moveTo(city.xs[s] * k + ox, city.zs[s] * k + oy);
      for (let n = 1; n < city.len[b]; n++) ctx.lineTo(city.xs[s + n] * k + ox, city.zs[s + n] * k + oy);
      ctx.closePath();
      if (m % 200 === 199) {
        ctx.fill();
        ctx.beginPath();
      }
    });
    ctx.fill();
  });
}

const TILE = 256;
const tiles = new Map<string, HTMLCanvasElement>();

function renderTile(city: CityData, scale: number, i: number, j: number): HTMLCanvasElement {
  const size = TILE / scale;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const cx = (i + 0.5) * size;
  const cz = (j + 0.5) * size;
  drawBuildings(c.getContext('2d') as CanvasRenderingContext2D, city, { cx, cz, scale, w: TILE, h: TILE }, city.near(cx, cz, size / 2));
  return c;
}

export function drawMap(ctx: CanvasRenderingContext2D, game: Game, v: MapView, dpr: number): boolean {
  const base = baseMap(game);
  const { extent, mpp, canvas } = base;
  ctx.fillStyle = `rgb(${WATER_DEEP.join(',')})`;
  ctx.fillRect(0, 0, v.w, v.h);
  const tl = toScreen(v, extent.minX, extent.minZ);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, tl.sx, tl.sy, canvas.width * mpp * v.scale, canvas.height * mpp * v.scale);
  if (v.scale * mpp <= 1.6) return true;
  const level = Math.round(Math.log2(v.scale * dpr));
  const scale = 2 ** level;
  const size = TILE / scale;
  const px = size * v.scale;
  const left = v.cx - v.w / 2 / v.scale;
  const top = v.cz - v.h / 2 / v.scale;
  const i0 = Math.floor(left / size);
  const j0 = Math.floor(top / size);
  const i1 = Math.floor((left + v.w / v.scale) / size);
  const j1 = Math.floor((top + v.h / v.scale) / size);
  const deadline = performance.now() + 12;
  let complete = true;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const key = `${level}:${i}:${j}`;
      let t = tiles.get(key);
      if (t) tiles.delete(key);
      else if (performance.now() < deadline) t = renderTile(game.world.city, scale, i, j);
      if (!t) {
        complete = false;
        continue;
      }
      tiles.set(key, t);
      ctx.drawImage(t, (i * size - v.cx) * v.scale + v.w / 2, (j * size - v.cz) * v.scale + v.h / 2, px, px);
    }
  }
  const keep = Math.max(64, 2 * (i1 - i0 + 1) * (j1 - j0 + 1));
  for (const key of tiles.keys()) {
    if (tiles.size <= keep) break;
    tiles.delete(key);
  }
  return complete;
}
