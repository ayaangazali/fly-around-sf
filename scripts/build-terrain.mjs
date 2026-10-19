import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BOUNDS, EXTENT, toGeo } from '../src/core/geo.ts';

const Z = 13;
const CELL = 16;
const CACHE = new URL('../.cache/', import.meta.url);
const OUT = new URL('../public/data/terrain.bin', import.meta.url);

const lon2x = (lon) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
};

async function tile(x, y) {
  const file = new URL(`terrarium-${Z}-${x}-${y}.png`, CACHE);
  if (!existsSync(file)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${x}/${y}: ${res.status}`);
    await writeFile(file, new Uint8Array(await res.arrayBuffer()));
  }
  return PNG.sync.read(await readFile(file));
}

await mkdir(CACHE, { recursive: true });
const x0 = Math.floor(lon2x(BOUNDS.west));
const x1 = Math.floor(lon2x(BOUNDS.east));
const y0 = Math.floor(lat2y(BOUNDS.north));
const y1 = Math.floor(lat2y(BOUNDS.south));
const tiles = new Map();
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.set(`${x}/${y}`, await tile(x, y));

function elevAt(px, py) {
  const tx = Math.floor(px / 256);
  const ty = Math.floor(py / 256);
  const t = tiles.get(`${tx}/${ty}`);
  const ix = Math.min(255, Math.max(0, Math.floor(px - tx * 256)));
  const iy = Math.min(255, Math.max(0, Math.floor(py - ty * 256)));
  const i = (iy * 256 + ix) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}

function sample(lat, lon) {
  const px = lon2x(lon) * 256 - 0.5;
  const py = lat2y(lat) * 256 - 0.5;
  const fx = Math.floor(px);
  const fy = Math.floor(py);
  const dx = px - fx;
  const dy = py - fy;
  const a = elevAt(fx, fy);
  const b = elevAt(fx + 1, fy);
  const c = elevAt(fx, fy + 1);
  const d = elevAt(fx + 1, fy + 1);
  return (a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy;
}

const w = Math.ceil((EXTENT.maxX - EXTENT.minX) / CELL) + 1;
const h = Math.ceil((EXTENT.maxZ - EXTENT.minZ) / CELL) + 1;
const buf = new ArrayBuffer(20 + w * h * 2);
const dv = new DataView(buf);
new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x54, 0x31]);
dv.setUint16(4, w, true);
dv.setUint16(6, h, true);
dv.setFloat32(8, CELL, true);
dv.setFloat32(12, EXTENT.minX, true);
dv.setFloat32(16, EXTENT.minZ, true);
const grid = new Int16Array(buf, 20);
let min = Infinity;
let max = -Infinity;
for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
    const { lat, lon } = toGeo(EXTENT.minX + i * CELL, EXTENT.minZ + j * CELL);
    const e = sample(lat, lon);
    min = Math.min(min, e);
    max = Math.max(max, e);
    grid[j * w + i] = Math.max(-32767, Math.min(32767, Math.round(e * 10)));
  }
}
await writeFile(OUT, new Uint8Array(buf));
console.log(`terrain ${w}x${h} cell=${CELL}m tiles=${tiles.size} elev=[${min.toFixed(1)}, ${max.toFixed(1)}] bytes=${buf.byteLength}`);
