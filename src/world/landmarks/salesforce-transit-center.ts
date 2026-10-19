import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, glass, glow, inside, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Salesforce Transit Center',
  lat: 37.78901,
  lon: -122.397009,
  url: 'https://www.openstreetmap.org/way/542375290',
};

export const FACTS = {
  parkHeight: 21.3,
  parkAcres: 5.4,
  trees: 600,
  sources: [
    'https://en.wikipedia.org/wiki/Salesforce_Transit_Center',
    'https://www.afar.com/magazine/salesforce-park-opens-in-downtown-san-francisco',
    'https://www.openstreetmap.org/way/542375290',
  ],
};

const GONDOLA = { lat: 37.790201, lon: -122.396632 };

export const RING: Pt[] = [
  [138.3, -172.8], [142.8, -178.9], [146.1, -180.3], [152.4, -178.9], [163.7, -162.7], [180.2, -151.4], [181.1, -148.3], [179.2, -143.0],
  [168.1, -134.3], [145.5, -110.5], [141.7, -103.2], [128.6, -93.6], [122.4, -84.9], [110.2, -76.2], [103.7, -65.4], [92.5, -59.0],
  [85.8, -47.0], [73.5, -38.6], [65.9, -26.9], [53.9, -18.5], [46.2, -6.7], [34.6, 1.3], [28.3, 11.8], [16.7, 19.2],
  [9.4, 30.2], [-1.5, 37.5], [-8.7, 48.3], [-20.0, 55.8], [-27.4, 66.8], [-40.9, 77.0], [-45.4, 84.8], [-57.9, 93.1],
  [-65.5, 104.3], [-75.9, 110.6], [-82.3, 121.3], [-96.8, 130.3], [-122.2, 156.5], [-127.4, 156.3], [-129.8, 154.5], [-135.2, 145.8],
  [-138.1, 148.7], [-148.9, 138.0], [-145.9, 135.0], [-153.6, 130.1], [-156.4, 126.3], [-155.2, 118.3], [-125.5, 90.0], [-121.7, 83.3],
  [-110.5, 75.8], [-103.2, 64.5], [-92.5, 57.0], [-85.2, 46.1], [-73.7, 38.8], [-66.2, 27.6], [-55.7, 21.7], [-48.0, 9.8],
  [-36.8, 2.7], [-29.3, -8.4], [-17.8, -16.0], [-10.8, -26.5], [0.3, -33.2], [7.7, -45.0], [19.9, -51.6], [28.1, -65.2],
  [41.1, -74.4], [47.3, -84.8], [60.0, -92.7], [65.3, -103.1], [76.7, -110.8], [85.0, -121.2], [96.7, -130.9], [103.7, -140.3],
  [114.1, -147.4],
];

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export const landmark: Landmark = {
  id: 'salesforce-transit-center',
  build(game: Game) {
    const site = new Site(game, 'salesforce-transit-center', source, 0);
    site.hideInside(RING);
    const H = FACTS.parkHeight;
    const skin = glow('#fff1d6', '#efede6', 0.35);
    const lawn = paint('#7fa65a');
    const path = paint('#d9cfbd');
    const leaves = [paint('#4f7d3b', true), paint('#668f43', true), paint('#3f6a3a', true)];
    const trunk = paint('#6b5440');

    site.extrude(skin, RING, -2, H + 1.4);
    site.extrude(lawn, RING, H + 1.4, 0.3);
    for (let i = 0; i < RING.length; i++) {
      const [ax, az] = RING[i];
      const [bx, bz] = RING[(i + 1) % RING.length];
      site.beam(glass('#9fb6c4'), { x: ax, y: H + 1.7, z: az }, { x: bx, y: H + 1.7, z: bz }, 0.3, 1.2);
    }
    for (let i = 0; i < RING.length; i += 2) {
      const [x, z] = RING[i];
      site.box(paint('#d8d5cc'), 1.6, H, 1.6, x * 0.97, 0, z * 0.97);
    }
    const axis = { x: 168, z: -150 };
    for (let t = -0.85; t <= 0.85; t += 0.1) site.box(path, 9, 0.2, 30, axis.x * t, H + 1.65, axis.z * t, Math.atan2(axis.x, axis.z));
    site.box(glow('#5fc8ff', '#7fb2c9', 1.2), 2.4, 0.25, 180, -14, H + 1.8, 12, Math.atan2(axis.x, axis.z));

    const ring = RING.map(([x, z]) => ({ x, z }));
    const rand = rng(1854);
    const sphere = new THREE.IcosahedronGeometry(1, 0);
    let planted = 0;
    for (let tries = 0; planted < 220 && tries < 3000; tries++) {
      const x = -160 + rand() * 345;
      const z = -185 + rand() * 345;
      if (!inside(ring, x, z) || !inside(ring, x * 1.06, z * 1.06)) continue;
      const along = (x * axis.x + z * axis.z) / Math.hypot(axis.x, axis.z);
      const across = (x * axis.z - z * axis.x) / Math.hypot(axis.x, axis.z);
      if (Math.abs(across + 10) < 7 && Math.abs(along) < 90) continue;
      const h = 4 + rand() * 6;
      const r = 1.8 + rand() * 2.2;
      site.box(trunk, 0.4, h * 0.5, 0.4, x, H + 1.7, z);
      site.add(leaves[planted % 3], sphere.clone(), x, H + 1.7 + h * 0.65, z, rand() * 3, 0, 0, r, h * 0.45, r);
      planted++;
    }

    const g = site.at(GONDOLA.lat, GONDOLA.lon);
    site.box(paint('#c8c8c4'), 0.8, H + 6, 0.8, g.x, 0, g.z).box(glass('#cfe3ec'), 3, 3.2, 3, g.x + 2.2, H * 0.6, g.z);

    site.solidBox(11.5, -2, -10.9, 437.6, H + 3.4, 50, Math.PI / 4);
    site.finish();
  },
};
