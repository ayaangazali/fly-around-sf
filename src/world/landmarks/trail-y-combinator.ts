import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';
import { gable, sign } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'Y Combinator, 560 20th Street (Union Iron Works office, Pier 70)',
  lat: 37.76084,
  lon: -122.38598,
  url: 'https://www.openstreetmap.org/way/257338714',
};

export const FACTS = {
  built: 1896,
  height: 15.4,
  powerHouse: 1912,
  sources: ['https://www.potreroview.net/?p=9707', 'https://fortune.com/2024/01/12/garry-tan-founders-y-combinator-headquarters/', 'https://www.openstreetmap.org/way/257338714', 'https://www.openstreetmap.org/way/257338685'],
};

export const TOP = 24;

const YAW = 0.0751;
export const OFFICE: Pt[] = [
  [22.6, -8.5], [22.6, -1], [17.6, -0.9], [17.1, 4.6], [24.7, 4.7], [24.5, 13.2], [16.5, 13.1], [16.6, 11.6], [-30, 11.6], [-29.5, -8.9], [-8.4, -8.9], [-8.4, -9.4],
];
const MAIN = { x0: -29.8, x1: 16.6, z0: -8.9, z1: 11.6 };
const POWER = { x0: -77.9, x1: -37.4, z0: -7.1, z1: 7.5 };

export const landmark: Landmark = {
  id: 'trail-y-combinator',
  exclusions: [circle(37.760829, -122.385897, 6)],
  build(game: Game) {
    const site = new Site(game, 'trail-y-combinator', source, YAW);
    const brick = paint('#8f3a2a');
    const darkBrick = paint('#74301f');
    const stone = glow('#ffe2b8', '#e4d6b8', 0.25);
    const green = paint('#2f5a3e');
    const glassOff = paint('#24303a');
    const glassOn = glow('#ffd9a0', '#24303a', 0.8);
    const roof = paint('#5b5f63');
    const H = FACTS.height;
    const cx = (MAIN.x0 + MAIN.x1) / 2;
    const front = MAIN.z1;

    site.extrude(darkBrick, OFFICE, -2, 11.5).extrude(roof, OFFICE, 9.5, 0.3);
    site.box(brick, MAIN.x1 - MAIN.x0 + 0.2, H + 2, MAIN.z1 - MAIN.z0 + 0.2, cx, -2, (MAIN.z0 + MAIN.z1) / 2);
    site.box(roof, MAIN.x1 - MAIN.x0 - 0.6, 0.3, MAIN.z1 - MAIN.z0 - 0.6, cx, H, (MAIN.z0 + MAIN.z1) / 2);
    for (const [w, d, x, z] of [
      [MAIN.x1 - MAIN.x0 + 0.4, 0.6, cx, MAIN.z0 - 0.1],
      [MAIN.x1 - MAIN.x0 + 0.4, 0.6, cx, front + 0.1],
      [0.6, MAIN.z1 - MAIN.z0, MAIN.x0 - 0.1, (MAIN.z0 + MAIN.z1) / 2],
      [0.6, MAIN.z1 - MAIN.z0, MAIN.x1 + 0.1, (MAIN.z0 + MAIN.z1) / 2],
    ]) site.box(stone, w, 0.9, d, x, H - 0.4, z).box(brick, w, 1.1, d, x, H + 0.5, z);
    for (const z of [MAIN.z0 - 0.15, front + 0.15]) {
      site.box(stone, MAIN.x1 - MAIN.x0 + 0.3, 1.3, 0.3, cx, -0.2, z);
      for (const y of [5.2, 10.2]) site.box(stone, MAIN.x1 - MAIN.x0 + 0.3, 0.45, 0.3, cx, y, z);
    }

    const bay = 9;
    site.box(brick, bay, H + 3.2, 1.4, cx, -2, front + 0.7).box(stone, bay + 0.6, 0.8, 1.8, cx, H + 0.4, front + 0.7);
    site.box(stone, 2, 1.1, 1.6, cx, H + 1.2, front + 0.7);
    const archR = 2.4;
    site.box(stone, archR * 2 + 1.4, 4.2, 0.4, cx, 0, front + 1.5);
    site.add(stone, new THREE.CylinderGeometry(archR + 0.7, archR + 0.7, 0.4, 20, 1, false, -Math.PI / 2, Math.PI), cx, 4.2, front + 1.5, 0, -Math.PI / 2);
    site.box(paint('#141a1f'), archR * 2, 4.2, 0.5, cx, 0, front + 1.6);
    site.add(paint('#141a1f'), new THREE.CylinderGeometry(archR, archR, 0.5, 20, 1, false, -Math.PI / 2, Math.PI), cx, 4.2, front + 1.65, 0, -Math.PI / 2);
    for (const fy of [6.4, 11.2]) {
      site.box(green, 3.2, 3.1, 0.3, cx, fy - 0.2, front + 1.45).box(glassOn, 2.6, 2.6, 0.3, cx, fy, front + 1.55);
    }

    const bays = [-5, -4, -3, -2, 2, 3, 4, 5];
    for (const z of [front + 0.1, MAIN.z0 - 0.1]) {
      const n = z > 0 ? 1 : -1;
      for (const b of z > 0 ? bays : [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) {
        const x = cx + b * 4;
        if (x - 1.4 < MAIN.x0 || x + 1.4 > MAIN.x1) continue;
        site.box(green, 2.4, 2.4, 0.3, x, 1.3, z + n * 0.05).box(b % 2 ? glassOff : glassOn, 1.9, 2.2, 0.3, x, 1.4, z + n * 0.12);
        site.add(green, new THREE.CylinderGeometry(1.2, 1.2, 0.3, 12, 1, false, -Math.PI / 2, Math.PI), x, 3.7, z + n * 0.05, 0, -Math.PI / 2);
        site.add(glassOff, new THREE.CylinderGeometry(0.95, 0.95, 0.3, 12, 1, false, -Math.PI / 2, Math.PI), x, 3.6, z + n * 0.12, 0, -Math.PI / 2);
        for (const [fy, lit] of [[6.1, b % 3 === 0], [11.0, b % 2 === 0]] as const) {
          site.box(green, 2.2, 3.1, 0.3, x, fy - 0.2, z + n * 0.05).box(lit ? glassOn : glassOff, 1.7, 2.7, 0.3, x, fy, z + n * 0.12);
          site.box(stone, 2.5, 0.35, 0.5, x, fy - 0.45, z + n * 0.15);
        }
      }
    }
    for (const x of [MAIN.x0 - 0.1, MAIN.x1 + 0.1]) {
      for (const zz of [-4, 0, 4]) {
        for (const fy of [1.3, 6.1, 11]) site.box(green, 0.3, 2.8, 2.2, x, fy, (MAIN.z0 + MAIN.z1) / 2 + zz).box(glassOff, 0.5, 2.4, 1.8, x, fy + 0.2, (MAIN.z0 + MAIN.z1) / 2 + zz);
      }
    }

    const sx = (POWER.x0 + POWER.x1) / 2;
    const sz = (POWER.z0 + POWER.z1) / 2;
    const L = POWER.x1 - POWER.x0;
    const W = POWER.z1 - POWER.z0;
    const white = glow('#fff1d8', '#efeae0', 0.2);
    const tile = paint('#b4513a');
    const wall = 12.5;
    site.box(white, L, wall + 2, W, sx, -2, sz).box(stone, L + 0.6, 0.7, W + 0.6, sx, wall - 0.2, sz);
    gable(site, tile, L + 1.4, W + 1.4, 6, sx, wall, sz);
    for (const end of [-1, 1]) {
      gable(site, white, 0.4, W, 5.6, sx + end * (L / 2 - 0.2), wall, sz);
      site.add(glassOff, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 16, 1, false, -Math.PI / 2, Math.PI), sx + end * (L / 2 + 0.05), 7, sz, Math.PI / 2, -Math.PI / 2);
      site.box(glassOff, 0.4, 5, 5.2, sx + end * (L / 2 + 0.05), 2, sz);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = POWER.x0 + 3.6 + i * ((L - 7.2) / 5);
        const z = sz + side * (W / 2 + 0.1);
        site.box(i % 2 ? glassOff : glassOn, 3, 6.6, 0.3, x, 1.6, z);
        site.add(i % 2 ? glassOff : glassOn, new THREE.CylinderGeometry(1.5, 1.5, 0.3, 14, 1, false, -Math.PI / 2, Math.PI), x, 8.2, z, 0, -Math.PI / 2);
        site.box(white, 0.9, wall + 2, 0.5, x + (L - 7.2) / 10, -2, z + side * 0.1);
      }
    }

    const info = sign(site, 'Y COMBINATOR', cx, H + 1.6 + 3.5, front - 0.6, 0, 4, { panel: '#f26522', accent: '#fff3e0' });
    for (const s of [-1, 1]) site.box(paint('#3a3f44'), 0.5, 3.6, 0.5, cx + (s * info.w) / 3, H, front - 1.2);

    site.solidPrism(OFFICE, -2, 11.5).solidBox(cx, -2, (MAIN.z0 + MAIN.z1) / 2, MAIN.x1 - MAIN.x0, H + 3.6, MAIN.z1 - MAIN.z0);
    site.solidBox(cx, H, front - 0.4, info.w, info.h + 1.6, 1.2);
    site.solidBox(sx, -2, sz, L, wall + 2.5, W).solidBox(sx, wall, sz, L, 3.2, W * 0.6);
    site.finish();
  },
};
