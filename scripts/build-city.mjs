import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { toLocal } from '../src/core/geo.ts';

const CACHE = new URL('../.cache/', import.meta.url);
const OUT = new URL('../public/data/city.bin', import.meta.url);
const API = 'https://data.sf.gov/resource/ynuv-fyni.json';
const PAGE = 50000;
const SIMPLIFY_M = 0.6;
const MIN_AREA_M2 = 8;
const MIN_HEIGHT_M = 1.5;
const Q = 2;
const NO_GROUND = -32768;

async function fetchPage(offset) {
  const file = new URL(`footprints-${offset}.json`, CACHE);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const params = new URLSearchParams({
    $select: 'sf16_bldgid,hgt_median_m,gnd_min_m,shape',
    $order: ':id',
    $limit: String(PAGE),
    $offset: String(offset),
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`DataSF ${res.status} at offset ${offset}`);
  const rows = await res.json();
  await writeFile(file, JSON.stringify(rows));
  return rows;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - dz * (a[0] - p[0])) / len;
}

function simplify(pts, tol) {
  if (pts.length <= 3) return pts;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  const left = simplify(pts.slice(0, idx + 1), tol);
  return left.slice(0, -1).concat(simplify(pts.slice(idx), tol));
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function processRing(coords) {
  let ring = coords.map(([lon, lat]) => {
    const { x, z } = toLocal(lat, lon);
    return [x, z];
  });
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) ring = ring.slice(0, -1);
  if (ring.length < 3) return null;
  const split = Math.floor(ring.length / 2);
  ring = simplify(ring.slice(0, split + 1), SIMPLIFY_M)
    .slice(0, -1)
    .concat(simplify(ring.slice(split).concat([ring[0]]), SIMPLIFY_M).slice(0, -1));
  if (ring.length < 3) return null;
  let area = signedArea(ring);
  if (Math.abs(area) < MIN_AREA_M2) return null;
  if (area < 0) ring.reverse();
  const q = ring.map(([x, z]) => [Math.round(x * Q), Math.round(z * Q)]);
  const dedup = q.filter((p, i) => {
    const n = q[(i + 1) % q.length];
    return p[0] !== n[0] || p[1] !== n[1];
  });
  return dedup.length >= 3 ? dedup : null;
}

await mkdir(CACHE, { recursive: true });
const records = [];
let rows = 0;
let skipped = 0;
for (let offset = 0; ; offset += PAGE) {
  const page = await fetchPage(offset);
  rows += page.length;
  for (const r of page) {
    const h = Number(r.hgt_median_m);
    const g = r.gnd_min_m == null ? NaN : Number(r.gnd_min_m);
    if (!r.shape || !(h >= MIN_HEIGHT_M)) {
      skipped++;
      continue;
    }
    for (const poly of r.shape.coordinates) {
      const ring = processRing(poly[0]);
      if (!ring) {
        skipped++;
        continue;
      }
      records.push({
        h: Math.min(32767, Math.round(h * 10)),
        g: Number.isFinite(g) ? Math.max(-32767, Math.min(32767, Math.round(g * 10))) : NO_GROUND,
        ring,
      });
    }
  }
  console.log(`fetched ${rows} rows`);
  if (page.length < PAGE) break;
}

const ints = records.reduce((n, r) => n + 3 + r.ring.length * 2, 0);
const buf = new ArrayBuffer(8 + ints * 2);
new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x43, 0x32]);
new DataView(buf).setUint32(4, records.length, true);
const out = new Int16Array(buf, 8);
let o = 0;
for (const r of records) {
  out[o++] = r.h;
  out[o++] = r.g;
  out[o++] = r.ring.length;
  let px = 0;
  let pz = 0;
  for (const [x, z] of r.ring) {
    out[o++] = x - px;
    out[o++] = z - pz;
    px = x;
    pz = z;
  }
}
await writeFile(OUT, new Uint8Array(buf));
console.log(`rows=${rows} buildings=${records.length} skipped=${skipped} bytes=${buf.byteLength}`);
