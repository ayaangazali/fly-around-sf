import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, catenary, glow, paint, sparkle, taper, yawBetween, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'San Francisco–Oakland Bay Bridge (west span central anchorage)',
  lat: 37.7982,
  lon: -122.377895,
  url: 'https://www.openstreetmap.org/way/432712477',
};

export const TOP = 160;

export const FACTS = {
  towerHeight: 160,
  clearance: 67,
  mainSpan: 704,
  sasTowerHeight: 160,
  sasMainSpan: 385,
  bayLightsLeds2013: 25000,
  bayLightsLeds2026: 48000,
  sources: [
    'https://en.wikipedia.org/wiki/San_Francisco%E2%80%93Oakland_Bay_Bridge',
    'https://mtc.ca.gov/operations/programs-projects/bridges/san-francisco-oakland-bay-bridge',
    'https://en.wikipedia.org/wiki/The_Bay_Lights',
    'https://www.cbsnews.com/sanfrancisco/news/bay-bridge-lights-art-project-to-shine-again-brighter-than-ever-after-11-million-fundraising-campaign',
    'https://www.openstreetmap.org/way/237735191',
  ],
};

export const W2 = { lat: 37.790764, lon: -122.385856 };
export const W3 = { lat: 37.7956, lon: -122.380677 };
export const W5 = { lat: 37.8008, lon: -122.375112 };
export const W6 = { lat: 37.805635, lon: -122.369929 };
const PORTAL_WEST = { lat: 37.808983, lon: -122.366323 };
export const SAS_TOWER = { lat: 37.815265, lon: -122.358479 };
const SAS_WEST = { lat: 37.814408, lon: -122.36041 };
const SAS_EAST = { lat: 37.817675, lon: -122.354682 };
const RINCON = { lat: 37.78635, lon: -122.39135 };

const HALF_W = 10;
const SIDE_SPAN = 354;

function westSpan(game: Game): void {
  const site = new Site(game, 'bay-bridge', source, yawBetween(W2, W6), 0);
  const gray = glow('#2b3138', '#9aa1a8', 0.5);
  const steel = paint('#868d95');
  const concrete = paint('#a9a69e', true);
  const deck = paint('#45484d');
  const lights = sparkle('#ffffff');
  const red = beacon('#ff2a1a', 1.8);

  const towers = [W2, W3, W5, W6].map((p) => site.at(p.lat, p.lon).z);
  const center = (towers[1] + towers[2]) / 2;
  const sfEnd = towers[0] - SIDE_SPAN;
  const ybiEnd = towers[3] + SIDE_SPAN;
  const top = (z: number) => {
    for (const [a, b] of [
      [towers[0], towers[1]],
      [towers[2], towers[3]],
    ]) {
      if (z >= a && z <= b) {
        const t = (z - a) / (b - a);
        return 72 + 6 * Math.sin(Math.PI * t);
      }
    }
    if (z < towers[0]) return 72 - 10 * Math.min(1, (towers[0] - z) / SIDE_SPAN);
    if (z > towers[3]) return 72 - 8 * Math.min(1, (z - towers[3]) / SIDE_SPAN);
    return 72;
  };
  const depth = 9.5;

  for (const zc of towers) {
    site.box(concrete, 34, 22, 20, 0, -10, zc).solidBox(0, -10, zc, 34, 22, 20);
    for (const side of [-1, 1]) {
      const x = side * HALF_W;
      site.add(gray, taper(5.5, 9, 4, 7, 148), x, 12, zc).solidBox(x, 12, zc, 6, 148, 9);
      site.box(gray, 3.6, 2.5, 6, x, 160 - 2.5, zc).box(red, 1, 1, 1, x, 160, zc);
    }
    const tiers = [12, top(zc) - depth - 2, top(zc) + 3, 98, 126, 152];
    for (let i = 0; i < tiers.length - 1; i++) {
      const y0 = tiers[i];
      const y1 = tiers[i + 1];
      site.box(gray, 2 * HALF_W - 4, 2.4, 3, 0, y1 - 2.4, zc).solidBox(0, y1 - 2.4, zc, 2 * HALF_W - 4, 2.4, 3);
      if (i === 1) continue;
      site.beam(gray, { x: -HALF_W + 2, y: y0 + 1, z: zc }, { x: HALF_W - 2, y: y1 - 2.4, z: zc }, 1.2, 1.8);
      site.beam(gray, { x: HALF_W - 2, y: y0 + 1, z: zc }, { x: -HALF_W + 2, y: y1 - 2.4, z: zc }, 1.2, 1.8);
    }
  }

  const cAnchorTop = top(center) + 22;
  site.box(concrete, 36, cAnchorTop + 12, 64, 0, -12, center).solidBox(0, -12, center, 36, cAnchorTop + 12, 64);
  site.box(concrete, 26, 8, 40, 0, cAnchorTop, center).solidBox(0, cAnchorTop, center, 26, 8, 40);
  for (const z of [sfEnd, ybiEnd]) {
    const g = Math.max(-10, site.groundAt(0, z));
    site.box(concrete, 34, top(z) + 6 - g, 44, 0, g, z).solidBox(0, g, z, 34, top(z) + 6 - g, 44);
  }

  const seg = 24;
  for (let z = sfEnd; z < ybiEnd - 0.1; z += seg) {
    const ze = Math.min(ybiEnd, z + seg);
    const ya = top(z);
    const yb = top(ze);
    site.beam(deck, { x: 0, y: ya, z }, { x: 0, y: yb, z: ze }, 2 * HALF_W, 0.8);
    site.beam(deck, { x: 0, y: ya - depth + 1.5, z }, { x: 0, y: yb - depth + 1.5, z: ze }, 2 * HALF_W, 0.8);
    site.solidBox(0, (ya + yb) / 2 - depth, (z + ze) / 2, 2 * HALF_W + 2, depth + 2.4, ze - z + 0.5);
    for (const side of [-1, 1]) {
      const x = side * HALF_W;
      site.beam(steel, { x, y: ya, z }, { x, y: yb, z: ze }, 0.9, 1.2);
      site.beam(steel, { x, y: ya - depth, z }, { x, y: yb - depth, z: ze }, 0.9, 1.2);
      site.beam(steel, { x, y: ya - depth, z }, { x, y: yb, z: ze }, 0.5, 0.5);
      site.beam(steel, { x, y: ya - depth, z }, { x, y: ya, z }, 0.6, 0.6);
    }
  }

  const saddle = 150;
  const spans: [number, number, 'main' | 'side'][] = [
    [sfEnd, towers[0], 'side'],
    [towers[0], towers[1], 'main'],
    [towers[1], center - 26, 'side'],
    [center + 26, towers[2], 'side'],
    [towers[2], towers[3], 'main'],
    [towers[3], ybiEnd, 'side'],
  ];
  const cableAt = (z: number) => {
    for (const [a, b, kind] of spans) {
      if (z < a || z > b) continue;
      if (kind === 'main') {
        const mid = (a + b) / 2;
        const low = top(mid) + 2;
        return low + catenary(b - a, saddle - low)(z - mid);
      }
      const towerEnd = towers.some((t) => Math.abs(t - a) < 1) ? a : b;
      const other = towerEnd === a ? b : a;
      const endY = other === center - 26 || other === center + 26 ? cAnchorTop + 4 : top(other) + 4;
      const t = (z - towerEnd) / (other - towerEnd);
      return saddle + (endY - saddle) * t - 10 * t * (1 - t);
    }
    return top(z);
  };
  for (const side of [-1, 1]) {
    const x = side * HALF_W;
    for (const [a, b] of spans) {
      const n = Math.max(8, Math.round((b - a) / 18));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const z = a + ((b - a) * i) / n;
        pts.push({ x, y: cableAt(z), z });
      }
      site.tube(steel, pts, 0.6, 6);
      for (let i = 0; i < n; i++) site.solidBeam(pts[i], pts[i + 1], 1.4, 2);
      for (let z = a + 4.7; z < b - 4; z += 9.4) {
        if (towers.some((t) => Math.abs(t - z) < 6)) continue;
        const yt = cableAt(z);
        const yb = top(z) + 0.6;
        if (yt - yb > 1) site.box(side > 0 ? lights : steel, side > 0 ? 0.8 : 0.4, yt - yb, side > 0 ? 0.8 : 0.4, x + side * 0.5, yb, z);
      }
    }
  }

  const portal = site.at(PORTAL_WEST.lat, PORTAL_WEST.lon);
  const pg = site.groundAt(portal.x, portal.z);
  const run = portal.z - ybiEnd;
  for (let z = ybiEnd; z < portal.z - 1; z += seg) {
    const ze = Math.min(portal.z, z + seg);
    const t0 = (z - ybiEnd) / run;
    const t1 = (ze - ybiEnd) / run;
    const xa = portal.x * t0;
    const xb = portal.x * t1;
    const ya = top(ybiEnd) + (pg + 12 - top(ybiEnd)) * t0;
    const yb = top(ybiEnd) + (pg + 12 - top(ybiEnd)) * t1;
    site.beam(deck, { x: xa, y: ya, z }, { x: xb, y: yb, z: ze }, 2 * HALF_W, 0.8);
    site.beam(steel, { x: xa, y: ya - 5, z }, { x: xb, y: yb - 5, z: ze }, 2 * HALF_W - 2, 4);
    site.solidBeam({ x: xa, y: ya - 2, z }, { x: xb, y: yb - 2, z: ze }, 2 * HALF_W + 2, 7);
  }
  site.box(concrete, 34, 26, 8, portal.x, pg - 4, portal.z).solidBox(portal.x, pg - 4, portal.z, 34, 26, 8);
  site.box(paint('#141619'), 22, 6.5, 1, portal.x, pg + 1, portal.z - 4.2).box(paint('#141619'), 22, 6.5, 1, portal.x, pg + 9.5, portal.z - 4.2);
  site.box(glow('#ffd28a', '#8a8070', 1.2), 22, 0.4, 0.6, portal.x, pg + 8, portal.z - 4.6).box(glow('#ffd28a', '#8a8070', 1.2), 22, 0.4, 0.6, portal.x, pg + 16.5, portal.z - 4.6);

  const rincon = site.at(RINCON.lat, RINCON.lon);
  const rg = site.groundAt(rincon.x, rincon.z) + 8;
  for (let i = 0; i < 10; i++) {
    const t0 = i / 10;
    const t1 = (i + 1) / 10;
    const a = { x: rincon.x * t0, y: top(sfEnd) + (rg - top(sfEnd)) * t0, z: sfEnd + (rincon.z - sfEnd) * t0 };
    const b = { x: rincon.x * t1, y: top(sfEnd) + (rg - top(sfEnd)) * t1, z: sfEnd + (rincon.z - sfEnd) * t1 };
    site.beam(deck, a, b, 2 * HALF_W, 0.8).beam(concrete, { ...a, y: a.y - 3 }, { ...b, y: b.y - 3 }, 2 * HALF_W - 4, 4);
    const g = site.groundAt(b.x, b.z);
    if (b.y - 5 - g > 2) site.box(concrete, 3, b.y - 5 - g, 3, b.x, g, b.z);
    site.solidBeam({ ...a, y: a.y - 1 }, { ...b, y: b.y - 1 }, 2 * HALF_W, 6);
  }
  site.finish();
}

function eastSpan(game: Game): void {
  const site = new Site(game, 'bay-bridge-east-span', SAS_TOWER, yawBetween(SAS_WEST, SAS_EAST), 0);
  const white = glow('#3c434a', '#e4e6e3', 0.6);
  const deck = paint('#4b4e53');
  const concrete = paint('#b4b1a9', true);
  const steel = paint('#c9ccce');
  const red = beacon('#ff2a1a', 2.2);
  const zw = site.at(SAS_WEST.lat, SAS_WEST.lon).z;
  const ze = site.at(SAS_EAST.lat, SAS_EAST.lon).z;
  const roadY = (z: number) => 46 + 4 * Math.sin((Math.PI * (z - zw)) / (ze - zw));

  site.box(concrete, 30, 14, 30, 0, -10, 0).solidBox(0, -10, 0, 30, 14, 30);
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    site.add(white, taper(5.5, 5.5, 3.6, 3.6, 156), sx * 4.2, 4, sz * 4.2);
    for (let y = 30; y < 150; y += 18) site.box(white, 1.2, 1.4, 4, sx * 4.2, y, 0).box(white, 4, 1.4, 1.2, 0, y, sz * 4.2);
  }
  site.solidBox(0, 4, 0, 14, 156, 14);
  site.box(white, 11, 4, 11, 0, 156, 0).box(red, 1.2, 1.2, 1.2, 0, 160, 0);

  for (const side of [-1, 1]) {
    const xc = side * 20;
    for (let z = zw - 40; z < ze + 40; z += 24) {
      const z2 = Math.min(ze + 40, z + 24);
      site.beam(deck, { x: xc, y: roadY(z), z }, { x: xc, y: roadY(z2), z: z2 }, 24, 1);
      site.beam(steel, { x: xc, y: roadY(z) - 3, z }, { x: xc, y: roadY(z2) - 3, z: z2 }, 20, 4.5);
      site.solidBox(xc, (roadY(z) + roadY(z2)) / 2 - 5.5, (z + z2) / 2, 25, 8, z2 - z + 0.5);
    }
    for (const zb of [zw, ze]) site.box(concrete, 22, roadY(zb) - 6, 8, xc, 0, zb).solidBox(xc, 0, zb, 22, roadY(zb) - 6, 8);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const z = zw + ((ze - zw) * i) / 40;
      const span = z < 0 ? -zw : ze;
      const t = Math.abs(z) / span;
      const y = roadY(z) + 2 + (152 - roadY(z)) * (0.25 * (1 - t) + 0.75 * (1 - t) ** 2);
      pts.push({ x: side * (3 + 6 * t), y, z });
    }
    site.tube(white, pts, 0.9, 8);
    for (let i = 0; i < 40; i++) site.solidBeam(pts[i], pts[i + 1], 1.8, 2);
    for (let i = 1; i < 40; i++) {
      if (Math.abs(pts[i].z) < 10) continue;
      site.beam(steel, pts[i], { x: side * 8.5, y: roadY(pts[i].z), z: pts[i].z }, 0.3, 0.3);
    }
  }
  site.finish();
}

export const landmark: Landmark = {
  id: 'bay-bridge',
  build(game: Game) {
    westSpan(game);
    eastSpan(game);
  },
};
