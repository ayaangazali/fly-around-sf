import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, glass, glow, loft, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Chase Center',
  lat: 37.767923,
  lon: -122.387514,
  url: 'https://www.openstreetmap.org/way/579646390',
};

export const TOP = 42;

export const FACTS = {
  height: 38.1,
  opened: 2019,
  capacity: 18064,
  sources: ['https://en.wikipedia.org/wiki/Chase_Center', 'https://www.openstreetmap.org/way/579646390'],
};

export const RING: Pt[] = [
  [-35.9, -52.6], [-25.2, -61.1], [-10.3, -68.7], [5.5, -73.5], [22.8, -75.4], [46.7, -71.9], [67.3, -62.4], [74.0, -57.4], [65.1, -46.5],
  [72.9, -35.0], [80.7, -17.6], [86.5, 9.4], [87.0, 30.2], [80.7, 52.7], [69.9, 71.5], [53.6, 60.9], [35.0, 74.1], [27.5, 77.1], [11.1, 82.0],
  [-5.3, 83.3], [-22.8, 80.0], [-29.7, 77.2], [-49.1, 63.6], [-59.4, 50.2], [-63.9, 40.6], [-67.4, 26.8], [-67.7, 11.3], [-70.6, 10.9],
  [-67.8, -5.1], [-61.5, -21.4], [-52.2, -36.4],
];
const C = { x: 8.5, z: 4 };

const scaled = (s: number): Pt[] => RING.map(([x, z]) => [C.x + (x - C.x) * s, C.z + (z - C.z) * s]);

export const landmark: Landmark = {
  id: 'chase-center',
  build(game: Game) {
    const site = new Site(game, 'chase-center', source, 0);
    const fin = glow('#cfe3ff', '#eef0f0', 0.7);
    const core = glass('#4b5d6b', 60);
    const roof = paint('#d3d6d8');

    site.add(core, loft([
      { y: -1, ring: scaled(0.97) },
      { y: FACTS.height - 2, ring: scaled(0.97) },
    ], false));
    for (let k = 0; k < 7; k++) {
      const y = 7 + k * 4.4;
      site.add(fin, loft([
        { y, ring: scaled(1 + 0.004 * k) },
        { y: y + 2.2, ring: scaled(1 + 0.004 * k) },
      ], true));
    }
    site.add(roof, loft([
      { y: FACTS.height - 2, ring: scaled(1.01) },
      { y: FACTS.height, ring: scaled(0.9) },
      { y: FACTS.height + 3, ring: scaled(0.55) },
    ], true));
    site.solidCyl(C.x, -1, C.z, 76, FACTS.height + 3);
    site.finish();
  },
};
