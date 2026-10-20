import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, paint, type LandmarkSource, type Pt } from '../landmark-kit';
import { outward, sign, windowsAlong } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'Andreessen Horowitz, 180 Townsend Street',
  lat: 37.7794,
  lon: -122.39266,
  url: 'https://www.openstreetmap.org/way/129176903',
};

export const FACTS = {
  height: 14.3,
  floors: 3,
  sources: ['https://a16z.com/offices/', 'https://therealdeal.com/san-francisco/2022/05/06/sobrato-buys-into-soma-with-record-setting-office-deal-for-sf/', 'https://www.openstreetmap.org/way/129176903'],
};

export const TOP = 16;

const YAW = 0.7947;
export const TOWNSEND_180: Pt[] = [[12.6, 24], [-8.9, 23.5], [-8.7, 0.8], [-8.2, -13.6], [12.6, -13.8]];
const H = FACTS.height;

export const landmark: Landmark = {
  id: 'trail-a16z',
  exclusions: [circle(37.779373, -122.392627, 5)],
  build(game: Game) {
    const site = new Site(game, 'trail-a16z', source, YAW);
    const brick = paint('#9a4733');
    const stone = paint('#d9cdb4');
    const ring = TOWNSEND_180;

    site.extrude(brick, ring, -2, H + 2).extrude(paint('#6d6a66'), ring, H, 0.25);
    const n = outward(ring, 0);
    const ry = Math.atan2(n.x, n.z);
    const mx = (ring[0][0] + ring[1][0]) / 2;
    const mz = (ring[0][1] + ring[1][1]) / 2;
    const name = sign(site, 'A16Z', mx + n.x * 0.05, 9.7, mz + n.z * 0.05, ry, 4.5, { panel: null, ink: '#f4efe6', light: '#fff1cf' });
    windowsAlong(site, ring, { floors: [1.3, 5.9, 10.3], w: 3.1, h: 3.3, step: 4.2, frame: '#e9e3d8', dark: '#2d3a40', clear: [name] });
    for (let i = 0; i < ring.length; i++) {
      const e = outward(ring, i);
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const er = Math.atan2(e.x, e.z);
      for (const [y, h, d] of [[H - 1.2, 0.5, 0.8], [H, 1.1, 0.5], [4.9, 0.35, 0.5], [9.3, 0.35, 0.5]]) {
        site.box(y > H ? brick : stone, e.len + d, h, d, (ax + bx) / 2 + e.x * (d / 2 - 0.05), y, (az + bz) / 2 + e.z * (d / 2 - 0.05), er);
      }
    }
    site.box(paint('#23292e'), 2.6, 3.3, 0.3, mx + n.x * 0.15, 0, mz + n.z * 0.15, ry).box(stone, 4, 0.4, 1.6, mx + n.x * 0.8, 3.4, mz + n.z * 0.8, ry);

    site.solidPrism(ring, -2, H + 3.1);
    site.finish();
  },
};
