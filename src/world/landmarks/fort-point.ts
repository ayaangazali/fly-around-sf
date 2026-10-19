import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, circle, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Fort Point',
  lat: 37.810592,
  lon: -122.477081,
  url: 'https://www.openstreetmap.org/relation/5504536',
};

export const TOP = 24;

export const FACTS = {
  built: 1861,
  tiers: 3,
  height: 15,
  sources: ['https://en.wikipedia.org/wiki/Fort_Point,_San_Francisco', 'https://www.openstreetmap.org/relation/5504536', 'https://www.openstreetmap.org/way/1358282761'],
};

export const OUTER: Pt[] = [
  [-15.1, 40.9], [32.6, 8.5], [31.1, -12.9], [39.9, -18.8], [40.2, -20.7], [40.6, -23.0], [36.2, -29.3], [32.1, -30.3], [23.3, -24.4], [11.7, -30.2],
  [6.9, -29.5], [-27.2, -6.6], [-36.9, -11.6], [-41.3, -10.3], [-44.7, -3.3], [-43.2, 0.7], [-33.5, 5.7], [-30.7, 46.8], [-26.9, 48.8],
];
export const COURTYARD: Pt[] = [
  [9.7, -20.4], [-13.6, -4.6], [-17.9, 3.7], [-16.9, 6.1], [-17.8, 7.2], [-19.3, 7.4], [-23.6, 14.9], [-22.6, 28.1], [-19.4, 29.8], [22.2, 1.5],
  [22.8, -1.8], [17.7, -9.1], [16.4, -8.7], [14.2, -9.9], [13.8, -11.0], [14.7, -13.3],
];
const LIGHT = { lat: 37.810543, lon: -122.477295 };

export const landmark: Landmark = {
  id: 'fort-point',
  exclusions: [circle(37.810661, -122.477128, 12)],
  build(game: Game) {
    const site = new Site(game, 'fort-point', source, 0);
    const brick = paint('#9b5440', true);
    const granite = paint('#a9a49a', true);
    const dark = paint('#2b2522');
    const h = FACTS.height;
    site.extrude(granite, OUTER, -3, 5, [COURTYARD]);
    site.extrude(brick, OUTER, 2, h - 2, [COURTYARD]);
    site.extrude(paint('#b7ad9a'), OUTER, h, 0.4, [COURTYARD]);
    site.extrude(paint('#8d8a82'), COURTYARD, -0.5, 1);
    for (let i = 0; i < OUTER.length; i++) {
      const [ax, az] = OUTER[i];
      const [bx, bz] = OUTER[(i + 1) % OUTER.length];
      const len = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(-(bz - az), bx - ax);
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      for (let t = 3; t < len - 2; t += 4.2) {
        const x = ax + ((bx - ax) * t) / len;
        const z = az + ((bz - az) * t) / len;
        for (const y of [3.2, 7.4, 11.4]) site.box(dark, 1.2, 1.6, 0.3, x + nx * 0.1, y, z + nz * 0.1, ry);
      }
      for (let t = 1; t < len; t += 2.4) site.box(brick, 1.2, 1, 1, ax + ((bx - ax) * t) / len, h + 0.4, az + ((bz - az) * t) / len, ry);
    }
    const l = site.at(LIGHT.lat, LIGHT.lon);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      site.beam(paint('#3e5b4c'), { x: l.x + Math.cos(a) * 2, y: h, z: l.z + Math.sin(a) * 2 }, { x: l.x + Math.cos(a) * 1, y: h + 7, z: l.z + Math.sin(a) * 1 }, 0.25, 0.25);
    }
    site.cyl(paint('#3e5b4c'), 1.4, 1.4, 2, l.x, h + 7, l.z, 6).box(beacon('#fff4d0', 4), 0.9, 0.9, 0.9, l.x, h + 7.6, l.z);
    site.solidPrism(OUTER, -3, h + 1.4);
    site.solidCyl(l.x, h, l.z, 2.2, 9.5);
    site.finish();
  },
};
