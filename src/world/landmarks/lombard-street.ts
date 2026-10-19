import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Lombard Street (crooked block)',
  lat: 37.8021,
  lon: -122.4188,
  url: 'https://www.openstreetmap.org/way/402111597',
};

export const TOP = 19;

export const FACTS = {
  turns: 8,
  grade: 27,
  surface: 'brick',
  sources: ['https://en.wikipedia.org/wiki/Lombard_Street_(San_Francisco)', 'https://www.openstreetmap.org/way/402111597'],
};

export const PATH: Pt[] = [
  [-73.1, 11.6], [-65.2, 11.4], [-62.4, 10.6], [-60.7, 9.4], [-53.8, 1.6], [-50.5, 0.5], [-47.9, 1.0], [-45.7, 2.4], [-39.0, 10.0], [-36.1, 11.3],
  [-33.6, 11.2], [-31.5, 10.0], [-30.4, 8.7], [-26.2, -1.9], [-24.2, -3.5], [-21.6, -4.1], [-19.9, -3.9], [-17.4, -2.7], [-9.5, 5.8], [-7.2, 6.7],
  [-4.7, 6.6], [-2.6, 5.4], [-1.1, 3.4], [2.8, -6.5], [4.7, -8.1], [6.4, -8.7], [9.0, -8.5], [11.4, -7.4], [19.5, 1.2], [21.8, 2.1],
  [24.2, 2.0], [25.7, 1.3], [27.4, -0.5], [31.7, -11.2], [33.6, -12.8], [35.3, -13.3], [37.9, -13.2], [40.3, -12.1], [47.7, -3.8], [49.9, -2.7],
  [52.3, -2.5], [55.2, -3.9], [59.0, -10.2], [60.5, -11.8], [65.9, -13.0], [71.6, -13.2],
];

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const landmark: Landmark = {
  id: 'lombard-street',
  build(game: Game) {
    const site = new Site(game, 'lombard-street', source, 0);
    const brick = paint('#a5503c', true);
    const curb = paint('#c9c3b8');
    const hedge = paint('#3f6b34', true);
    const soil = paint('#6f5a45');
    const flowers = [paint('#e0457b'), paint('#f2c14e'), paint('#b46ad8'), paint('#ff7f50'), paint('#f6f0f2')];
    const x0 = PATH[0][0];
    const x1 = PATH[PATH.length - 1][0];
    const y0 = site.groundAt(PATH[0][0], PATH[0][1]);
    const y1 = site.groundAt(x1, PATH[PATH.length - 1][1]);
    const road = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) + 0.3;

    for (let i = 0; i < PATH.length - 1; i++) {
      const [ax, az] = PATH[i];
      const [bx, bz] = PATH[i + 1];
      const a = { x: ax, y: road(ax), z: az };
      const b = { x: bx, y: road(bx), z: bz };
      site.beam(brick, { ...a, y: a.y - 0.25 }, { ...b, y: b.y - 0.25 }, 4.4, 0.5);
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (const side of [-1, 1]) {
        const o = { x: nx * side * 2.5, z: nz * side * 2.5 };
        site.beam(curb, { x: a.x + o.x, y: a.y, z: a.z + o.z }, { x: b.x + o.x, y: b.y, z: b.z + o.z }, 0.35, 0.4);
        const h = { x: nx * side * 3.4, z: nz * side * 3.4 };
        site.beam(hedge, { x: a.x + h.x, y: a.y + 0.5, z: a.z + h.z }, { x: b.x + h.x, y: b.y + 0.5, z: b.z + h.z }, 1.1, 1.2);
        site.solidBeam({ x: a.x + h.x, y: a.y + 0.5, z: a.z + h.z }, { x: b.x + h.x, y: b.y + 0.5, z: b.z + h.z }, 1.1, 1.4);
      }
    }

    const rand = rng(1922);
    const bud = new THREE.IcosahedronGeometry(0.45, 0);
    for (let i = 1; i < PATH.length - 1; i++) {
      const [px, pz] = PATH[i - 1];
      const [cx, cz] = PATH[i];
      const [qx, qz] = PATH[i + 1];
      const turn = (cx - px) * (qz - cz) - (cz - pz) * (qx - cx);
      if (Math.abs(turn) < 4) continue;
      const mx = (px + qx) / 2;
      const mz = (pz + qz) / 2;
      const dx = mx - cx;
      const dz = mz - cz;
      const d = Math.hypot(dx, dz) || 1;
      const bx = cx + (dx / d) * 5.5;
      const bz = cz + (dz / d) * 5.5;
      const g = site.groundAt(bx, bz);
      const y = road(bx);
      site.box(soil, 4.2, Math.max(0.8, y - g + 0.8), 4.2, bx, Math.min(g, y) - 0.2, bz);
      for (let k = 0; k < 9; k++) {
        const f = flowers[Math.floor(rand() * flowers.length)];
        site.add(f, bud.clone(), bx + (rand() - 0.5) * 3.4, y + 0.9, bz + (rand() - 0.5) * 3.4);
      }
    }
    for (const [x, z] of [PATH[0], PATH[PATH.length - 1]]) site.box(curb, 6, 0.3, 6, x, road(x) - 0.4, z);
    site.finish();
  },
};
