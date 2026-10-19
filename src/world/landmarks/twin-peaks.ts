import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Twin Peaks, Christmas Tree Point viewing area',
  lat: 37.75493,
  lon: -122.446642,
  url: 'https://www.openstreetmap.org/node/599157316',
};

export const FACTS = {
  summit: 281.9,
  sources: ['https://en.wikipedia.org/wiki/Twin_Peaks_(San_Francisco)', 'https://www.openstreetmap.org/way/101523335', 'https://www.openstreetmap.org/way/101522936'],
};

export const LOT: Pt[] = [
  [-68.2, 0.3], [-70.1, 5.3], [-75.2, -2.2], [-77.1, -8.0], [-75.0, -13.6], [-67.0, -17.5], [-55.4, -16.7], [-30.3, -5.0], [-14.0, -0.1], [-2.8, 7.8],
  [11.1, 8.8], [18.6, 14.7], [23.9, 22.1], [27.6, 33.6], [26.8, 47.4], [19.6, 59.8], [8.5, 59.3], [15.3, 52.4], [19.9, 40.9], [17.7, 29.0],
  [10.1, 19.7], [3.2, 15.7], [-30.5, 4.6], [-53.8, -6.4], [-61.4, -5.8],
];
export const WALL: Pt[] = [
  [17.9, 63.9], [21.5, 63.0], [23.0, 61.7], [29.9, 49.9], [33.0, 48.6], [35.3, 46.2], [36.3, 41.1], [35.1, 37.9], [31.4, 35.0], [29.7, 26.7],
  [25.4, 17.6], [21.2, 12.2], [15.6, 7.6], [11.9, 0.9], [6.4, -4.3], [-0.6, -7.1], [-5.9, -7.7], [-10.8, -6.9], [-17.0, -4.2], [-31.6, -9.4],
  [-49.3, -18.4], [-55.2, -20.2], [-64.0, -21.2], [-71.8, -19.8], [-77.8, -15.5], [-80.0, -11.9], [-80.5, -7.8], [-79.6, -4.2], [-76.9, -2.4],
];

export const landmark: Landmark = {
  id: 'twin-peaks',
  build(game: Game) {
    const site = new Site(game, 'twin-peaks', source, 0);
    const asphalt = paint('#4a4c50', true);
    const stone = paint('#9b9285', true);
    const steel = paint('#3b6e8f');
    const stripe = paint('#efefe8');
    const lotY = Math.max(...LOT.map(([x, z]) => site.groundAt(x, z))) - 0.6;
    site.extrude(asphalt, LOT, lotY - 6, 6.2);
    for (let i = 2; i < LOT.length / 2; i += 2) {
      const [x, z] = LOT[i];
      site.box(stripe, 0.2, 0.05, 4.5, x * 0.98, lotY + 0.21, z * 0.98 + 2, Math.atan2(z, x));
    }
    for (let i = 0; i < WALL.length - 1; i++) {
      const [ax, az] = WALL[i];
      const [bx, bz] = WALL[i + 1];
      const a = { x: ax, y: lotY + 0.5, z: az };
      const b = { x: bx, y: lotY + 0.5, z: bz };
      site.beam(stone, a, b, 0.7, 1.1);
      site.solidBeam(a, b, 0.8, 1.4);
      if (i % 4 === 1) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        site.cyl(stone, 0.12, 0.12, 1.2, mx, lotY + 1, mz, 6).box(steel, 0.5, 0.45, 0.9, mx, lotY + 2.2, mz, Math.atan2(-(bz - az), bx - ax));
      }
      if (i % 6 === 3) site.box(paint('#7a5a3c'), 2.2, 0.15, 0.6, (ax + bx) / 2 - 1.2, lotY + 0.9, (az + bz) / 2 - 1.2, Math.atan2(-(bz - az), bx - ax));
    }
    site.solidPrism(LOT, lotY - 6, 6.2);
    site.finish();
  },
};
