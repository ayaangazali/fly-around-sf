import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, inside, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Sutro Baths ruins and Cliff House',
  lat: 37.780161,
  lon: -122.514121,
  url: 'https://www.openstreetmap.org/way/32776564',
};

export const TOP = 27;

export const FACTS = {
  bathsOpened: 1896,
  bathsBurned: 1966,
  cliffHouseBuilt: 1909,
  sources: [
    'https://en.wikipedia.org/wiki/Sutro_Baths',
    'https://en.wikipedia.org/wiki/Cliff_House,_San_Francisco',
    'https://www.openstreetmap.org/way/32776564',
    'https://www.openstreetmap.org/way/168942988',
  ],
};

export const RUINS: Pt[] = [[-31.2, -81.2], [-36.8, -72.6], [-19.5, -56.9], [-9.1, -54.2], [-6.5, -49.4], [-1.7, 6.4], [-1.1, 53.1], [-4.6, 71.6], [-2.1, 85.4], [94.1, 84.4], [89.8, -27.0]];
const CLIFF_HOUSE = { lat: 37.778531, lon: -122.51406 };
export const CLIFF_RING: Pt[] = [
  [6.1, -13.0], [4.7, -8.9], [7.9, -2.0], [12.2, -4.0], [23.5, 20.3], [26.6, 18.9], [29.6, 25.4], [17.6, 30.9], [14.6, 24.4], [3.4, 29.5],
  [1.0, 24.5], [-5.0, 27.2], [-8.6, 17.5], [-11.1, 2.4], [-10.2, -5.1], [-15.2, -16.1], [-5.3, -20.6], [-5.3, -36.8], [0.9, -32.3], [4.2, -28.2],
  [6.6, -20.3],
];
const CAMERA_OBSCURA = { lat: 37.778258, lon: -122.514241 };

export const landmark: Landmark = {
  id: 'sutro-baths',
  exclusions: [circle(CLIFF_HOUSE.lat, CLIFF_HOUSE.lon, 18)],
  build(game: Game) {
    const site = new Site(game, 'sutro-baths', source, 0, 0);
    const ruin = paint('#b9b2a4', true);
    const water = paint('#3f6f6a');
    const zone = RUINS.map(([x, z]) => ({ x, z }));
    const pools: [number, number, number, number][] = [
      [20, -10, 28, 40],
      [52, -10, 22, 40],
      [20, 38, 28, 30],
      [52, 38, 22, 30],
      [78, 20, 12, 70],
    ];
    for (const [cx, cz, w, d] of pools) {
      if (!inside(zone, cx, cz)) continue;
      const floor = Math.max(0, site.groundAt(cx, cz));
      site.box(water, w - 1.5, 0.6, d - 1.5, cx, floor + 0.2, cz);
      for (const [ox, oz, bw, bd] of [
        [0, -d / 2, w, 1.2],
        [0, d / 2, w, 1.2],
        [-w / 2, 0, 1.2, d],
        [w / 2, 0, 1.2, d],
      ]) {
        site.box(ruin, bw, 3, bd, cx + ox, floor - 0.6, cz + oz);
        site.solidBox(cx + ox, floor - 0.6, cz + oz, bw, 3, bd);
      }
    }
    for (let k = 0; k < 6; k++) {
      const z = -40 + k * 6;
      site.box(ruin, 6, 1.2 + k * 1.4, 4, 8, Math.max(0, site.groundAt(8, z)) - 0.5, z);
    }

    const ch = site.at(CLIFF_HOUSE.lat, CLIFF_HOUSE.lon);
    const g = site.groundAt(ch.x, ch.z);
    const ring = CLIFF_RING.map(([x, z]): Pt => [x + ch.x, z + ch.z]);
    site.extrude(paint('#8d887f', true), ring, g - 14, 14);
    site.extrude(glow('#ffe4b8', '#ece8df', 0.5), ring, g, 7.5);
    site.extrude(paint('#6d6a65'), ring, g + 7.5, 0.6);
    for (let i = 0; i < ring.length; i += 2) {
      const [x, z] = ring[i];
      site.box(paint('#2f3a42'), 1.6, 2.4, 1.6, x * 0.98 + ch.x * 0.02, g + 2.4, z * 0.98 + ch.z * 0.02);
    }
    site.solidPrism(ring, g - 14, 22.1);
    const co = site.at(CAMERA_OBSCURA.lat, CAMERA_OBSCURA.lon);
    const cg = site.groundAt(co.x, co.z);
    site.box(paint('#d9d4c8'), 5, 4, 5, co.x, cg, co.z).cyl(paint('#3c3a37'), 1.2, 1.2, 1.6, co.x, cg + 4, co.z, 12).solidBox(co.x, cg, co.z, 5, 5.6, 5);
    site.finish();
  },
};
