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
  for (let j = 0; j < t.h; j++) {
    for (let i = 0; i < t.w; i++) {
      const y = e(i, j);
      const o = (j * t.w + i) * 4;
      let rgb: number[];
      if (y < 0) {
        const k = Math.min(1, -y / 40);
        rgb = WATER_SHALLOW.map((c, n) => c + (WATER_DEEP[n] - c) * k);
      } else {
        const nx = (e(i - 1, j) - e(i + 1, j)) / (2 * t.cell);
        const nz = (e(i, j - 1) - e(i, j + 1)) / (2 * t.cell);
        const len = Math.hypot(nx * 3, 1, nz * 3);
        const lit = Math.max(0, (nx * 3 * lx + ly + nz * 3 * lz) / len / Math.hypot(lx, ly, lz));
        const k = Math.min(1, y / 250);
        const light = 0.62 + lit * 0.55;
        rgb = LAND_LO.map((c, n) => (c + (LAND_HI[n] - c) * k) * light);
      }
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 255;
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

export function prepareBaseMap(game: Game, onReady: (map: BaseMap) => void): void {
  const tick = () => {
    const b = begin(game);
    if (advance(game, b, performance.now() + 8)) onReady(b.map);
    else setTimeout(tick, 16);
  };
  setTimeout(tick, 16);
}

export function drawBuildings(ctx: CanvasRenderingContext2D, city: CityData, v: MapView, ids: Iterable<number>): void {
  const groups: number[][] = BUCKETS.map(() => []);
  for (const b of ids) if (!city.hidden[b]) groups[BUCKETS.findIndex(([max]) => city.height[b] < max)].push(b);
  groups.forEach((list, i) => {
    ctx.fillStyle = BUCKETS[i][1];
    ctx.beginPath();
    for (const b of list) {
      const s = city.start[b];
      for (let k = 0; k < city.len[b]; k++) {
        const { sx, sy } = toScreen(v, city.xs[s + k], city.zs[s + k]);
        if (k === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
    }
    ctx.fill();
  });
}

export function drawMap(ctx: CanvasRenderingContext2D, game: Game, v: MapView): void {
  const base = baseMap(game);
  const { extent, mpp, canvas } = base;
  ctx.fillStyle = `rgb(${WATER_DEEP.join(',')})`;
  ctx.fillRect(0, 0, v.w, v.h);
  const tl = toScreen(v, extent.minX, extent.minZ);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, tl.sx, tl.sy, canvas.width * mpp * v.scale, canvas.height * mpp * v.scale);
  if (v.scale * mpp > 1.6) {
    const r = Math.hypot(v.w, v.h) / 2 / v.scale;
    drawBuildings(ctx, game.world.city, v, game.world.city.near(v.cx, v.cz, r));
  }
}
