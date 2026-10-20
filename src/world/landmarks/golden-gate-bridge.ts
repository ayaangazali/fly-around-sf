import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, catenary, glow, paint, yawBetween, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Golden Gate Bridge',
  lat: 37.8197535,
  lon: -122.478572,
  url: 'https://www.openstreetmap.org/way/1330586852',
};

export const TOP = 229;

export const FACTS = {
  towerHeight: 227,
  clearance: 67,
  mainSpan: 1280,
  sideSpan: 343,
  width: 27.4,
  trussDepth: 7.6,
  sources: [
    'https://en.wikipedia.org/wiki/Golden_Gate_Bridge',
    'https://www.openstreetmap.org/way/1330586852',
    'https://www.openstreetmap.org/way/1330832666',
  ],
};

export const SOUTH_TOWER = { lat: 37.814009, lon: -122.477901 };
export const NORTH_TOWER = { lat: 37.825498, lon: -122.479243 };
const PYLON_S1 = { lat: 37.810956, lon: -122.47752 };
const PYLON_S2 = { lat: 37.80994, lon: -122.4774 };
const ANCHOR_S = { lat: 37.8096, lon: -122.477426 };
const PYLON_N1 = { lat: 37.82859, lon: -122.4796 };
const PYLON_N2 = { lat: 37.82949, lon: -122.47971 };
const ANCHOR_N = { lat: 37.829063, lon: -122.479678 };
const TOLL_PLAZA = { lat: 37.8071, lon: -122.4756 };

const CABLE_X = FACTS.width / 2;
const LEG_SECTIONS: [number, number, number, number][] = [
  [-12, 21, 10.1, 16.1],
  [21, 74, 7.8, 14.1],
  [74, 123, 7.8, 11.9],
  [123, 162, 7.8, 10],
  [162, 195, 5.7, 10],
  [195, 225, 3.9, 7.7],
];
const PORTALS: [number, number][] = [
  [111, 121],
  [151, 161],
  [185, 193],
  [215, 223],
];
const BELOW_DECK: [number, number][] = [
  [24, 26],
  [50, 52],
];

export const landmark: Landmark = {
  id: 'golden-gate-bridge',
  build(game: Game) {
    const site = new Site(game, 'golden-gate-bridge', source, yawBetween(SOUTH_TOWER, NORTH_TOWER), 0);
    const orange = glow('#b4441f', '#cf4a2c', 1);
    const steel = paint('#b23d24');
    const concrete = paint('#a7a39a', true);
    const asphalt = paint('#3d3f44');
    const lamp = glow('#ffb35c', '#6b5a40', 2);
    const red = beacon('#ff2a1a', 1.6);

    const zs = site.at(SOUTH_TOWER.lat, SOUTH_TOWER.lon).z;
    const zn = site.at(NORTH_TOWER.lat, NORTH_TOWER.lon).z;
    const half = (zn - zs) / 2;
    const zS1 = site.at(PYLON_S1.lat, PYLON_S1.lon).z;
    const zN1 = site.at(PYLON_N1.lat, PYLON_N1.lon).z;
    const zAS = site.at(ANCHOR_S.lat, ANCHOR_S.lon).z;
    const zAN = site.at(ANCHOR_N.lat, ANCHOR_N.lon).z;
    const road = (z: number) => {
      if (Math.abs(z) <= half) return 70 + 5 * (1 - (z / half) ** 2);
      const end = z < 0 ? zAS : zAN;
      const t = (Math.abs(z) - half) / Math.abs(end - Math.sign(z) * half);
      return 70 - 4 * Math.min(1, t);
    };

    for (const zc of [-half, half]) {
      site.box(concrete, 44, 25, 25, 0, -12, zc).solidBox(0, -12, zc, 44, 25, 25);
      for (const side of [-1, 1]) {
        const x = side * CABLE_X;
        for (const [y0, y1, across, along] of LEG_SECTIONS) {
          site.box(orange, across, y1 - y0, along, x, y0, zc).solidBox(x, y0, zc, across, y1 - y0, along);
          if (y0 > 20) {
            for (const f of [-1, 1]) {
              for (const k of [-1, 1]) site.box(orange, 0.7, y1 - y0 - 3, 0.5, x + k * across * 0.22, y0 + 1.5, zc + f * (along / 2 + 0.2));
              site.box(orange, 0.5, y1 - y0 - 3, along * 0.5, x + f * (across / 2 + 0.2), y0 + 1.5, zc);
            }
          }
        }
        site.box(orange, 4.6, 2.4, 8.6, x, 225, zc).box(red, 1.2, 1.2, 1.2, x, 227.4, zc);
      }
      for (const [y0, y1] of PORTALS) {
        const span = 2 * CABLE_X - 6;
        site.box(orange, span, y1 - y0, 5.6, 0, y0, zc).solidBox(0, y0, zc, span, y1 - y0, 5.6);
        for (const f of [-1, 1]) {
          for (const k of [-2, -1, 0, 1, 2]) site.box(orange, 0.8, (y1 - y0) * 0.7, 0.4, k * span * 0.17, y0 + (y1 - y0) * 0.15, zc + f * 2.9);
          site.box(orange, span, 0.8, 0.5, 0, y1 - 1.2, zc + f * 2.9);
        }
      }
      for (const [y0, y1] of BELOW_DECK) site.box(orange, 2 * CABLE_X - 6, y1 - y0, 4, 0, y0, zc).solidBox(0, y0, zc, 2 * CABLE_X - 6, y1 - y0, 4);
      for (const [ya, yb] of [
        [26, 50],
        [52, 64],
      ]) {
        site.beam(orange, { x: -CABLE_X + 3, y: ya, z: zc }, { x: CABLE_X - 3, y: yb, z: zc }, 1.6, 2.4);
        site.beam(orange, { x: CABLE_X - 3, y: ya, z: zc }, { x: -CABLE_X + 3, y: yb, z: zc }, 1.6, 2.4);
      }
    }

    const panel = 7.62;
    const z0 = zAS;
    const z1 = zAN;
    for (let z = z0; z < z1 - 0.1; z += panel * 3) {
      const ze = Math.min(z1, z + panel * 3);
      const zm = (z + ze) / 2;
      const ya = road(z);
      const yb = road(ze);
      site.beam(asphalt, { x: 0, y: ya, z }, { x: 0, y: yb, z: ze }, FACTS.width - 1, 0.9);
      site.solidBox(0, (ya + yb) / 2 - FACTS.trussDepth, zm, FACTS.width + 1, FACTS.trussDepth + 2.6, ze - z + 0.5);
      for (const side of [-1, 1]) {
        const x = side * CABLE_X;
        site.beam(steel, { x, y: ya + 0.3, z }, { x, y: yb + 0.3, z: ze }, 0.9, 1.1);
        site.beam(steel, { x, y: ya - FACTS.trussDepth, z }, { x, y: yb - FACTS.trussDepth, z: ze }, 0.9, 1.1);
        site.beam(paint('#9b9a95'), { x: x * 0.93, y: ya + 1.3, z }, { x: x * 0.93, y: yb + 1.3, z: ze }, 0.25, 0.25);
      }
      site.beam(steel, { x: -CABLE_X, y: ya - FACTS.trussDepth, z }, { x: CABLE_X, y: yb - FACTS.trussDepth, z: ze }, 0.6, 0.6);
    }
    for (let i = 0, z = z0; z < z1; i++, z += panel) {
      const ze = Math.min(z1, z + panel);
      const yz = road(z);
      const ye = road(ze);
      for (const side of [-1, 1]) {
        const x = side * CABLE_X;
        site.beam(steel, { x, y: yz - FACTS.trussDepth, z }, { x, y: yz, z }, 0.6, 0.6);
        const up = i % 2 === 0;
        site.beam(steel, { x, y: (up ? yz : ye) - FACTS.trussDepth, z }, { x, y: (up ? ye : yz) - (up ? 0 : FACTS.trussDepth), z: ze }, 0.45, 0.45);
      }
      if (i % 7 === 0) {
        for (const side of [-1, 1]) {
          const x = side * (CABLE_X - 1.4);
          site.box(paint('#8a8c90'), 0.25, 7, 0.25, x, yz, z).box(lamp, 1, 0.5, 1, x - side * 0.4, yz + 7, z);
        }
      }
    }

    const saddle = 220;
    const low = road(0) + 2;
    const cat = catenary(2 * half, saddle - low);
    const mainCable = (z: number) => low + cat(z);
    const sideCable = (z: number, tower: number, end: number) => {
      const t = (z - tower) / (end - tower);
      return saddle + (road(end) + 3 - saddle) * t - 12 * t * (1 - t);
    };
    const cableY = (z: number) =>
      Math.abs(z) <= half ? mainCable(z) : z < 0 ? sideCable(z, -half, zAS) : sideCable(z, half, zAN);
    for (const side of [-1, 1]) {
      const x = side * CABLE_X;
      for (const [a, b] of [
        [zAS, -half],
        [-half, half],
        [half, zAN],
      ]) {
        const n = Math.max(8, Math.round(Math.abs(b - a) / 20));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const z = a + ((b - a) * i) / n;
          pts.push({ x, y: cableY(z), z });
        }
        site.tube(orange, pts, 0.75, 6);
        for (let i = 0; i < n; i++) site.solidBeam(pts[i], pts[i + 1], 1.6, 2);
      }
      for (let z = zS1 + 7; z < zN1 - 7; z += 15.24) {
        if (Math.abs(Math.abs(z) - half) < 8) continue;
        const top = cableY(z);
        const bottom = road(z) + 0.6;
        if (top - bottom > 1.5) site.box(steel, 0.35, top - bottom, 0.35, x, bottom, z);
      }
    }

    const pylon = (p: { lat: number; lon: number }, w: number, d: number) => {
      const { z } = site.at(p.lat, p.lon);
      const g = site.groundAt(0, z);
      const top = road(z) - FACTS.trussDepth;
      if (top - g < 1) return;
      site.box(concrete, w, top - g + 6, d, 0, g - 6, z).solidBox(0, g - 6, z, w, top - g + 6, d);
    };
    pylon(PYLON_S1, 34, 9);
    pylon(PYLON_S2, 34, 9);
    pylon(PYLON_N1, 34, 9);
    pylon(PYLON_N2, 34, 9);
    for (const z of [zAS, zAN]) {
      const g = site.groundAt(0, z);
      const top = road(z) + 3;
      site.box(concrete, 40, top - g + 8, 30, 0, g - 8, z).solidBox(0, g - 8, z, 40, top - g + 8, 30);
    }

    const zS2 = site.at(PYLON_S2.lat, PYLON_S2.lon).z;
    const archBase = site.groundAt(0, (zS1 + zS2) / 2) + 2;
    for (const side of [-1, 1]) {
      const x = side * CABLE_X;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const z = zS1 + (zS2 - zS1) * t;
        pts.push({ x, y: archBase + (road(z) - FACTS.trussDepth - 1 - archBase) * Math.sin(Math.PI * t) ** 0.6, z });
      }
      site.tube(steel, pts, 1.1, 6);
      for (let i = 2; i < 16; i += 2) site.box(steel, 0.6, road(pts[i].z) - FACTS.trussDepth - pts[i].y, 0.6, x, pts[i].y, pts[i].z);
    }

    const toll = site.at(TOLL_PLAZA.lat, TOLL_PLAZA.lon);
    const tollY = site.groundAt(toll.x, toll.z) + 1;
    const ax = { x: 0, y: road(zAS), z: zAS - 15 };
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a = { x: ax.x + (toll.x - ax.x) * t0, y: ax.y + (tollY - ax.y) * t0, z: ax.z + (toll.z - ax.z) * t0 };
      const b = { x: ax.x + (toll.x - ax.x) * t1, y: ax.y + (tollY - ax.y) * t1, z: ax.z + (toll.z - ax.z) * t1 };
      site.beam(asphalt, a, b, FACTS.width - 1, 0.9).beam(steel, { ...a, y: a.y - 3 }, { ...b, y: b.y - 3 }, FACTS.width - 4, 2.4);
      const g = site.groundAt(b.x, b.z);
      if (b.y - 3 - g > 2) site.box(steel, 2, b.y - 3 - g, 2, b.x - 9, g, b.z).box(steel, 2, b.y - 3 - g, 2, b.x + 9, g, b.z);
      site.solidBeam({ ...a, y: a.y - 1.5 }, { ...b, y: b.y - 1.5 }, FACTS.width, 5);
    }
    site.finish();
  },
};
