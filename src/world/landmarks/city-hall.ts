import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'San Francisco City Hall',
  lat: 37.779274,
  lon: -122.419256,
  url: 'https://www.openstreetmap.org/relation/7261820',
};

export const FACTS = {
  domeHeight: 93.7,
  completed: 1916,
  floors: 5,
  sources: ['https://en.wikipedia.org/wiki/San_Francisco_City_Hall', 'https://www.openstreetmap.org/relation/7261820'],
};

const OFFSET = { x: -2.5, z: -5.4 };
export const FOOTPRINT: Pt[] = [
  [-45.4, -48.5], [-44.7, -51.5], [-27.5, -54.3], [-26.2, -52.3], [14.8, -58.8], [16.2, -61.1], [33.3, -63.8], [34.6, -61.6], [38.7, -60.1],
  [44.6, -17.0], [45.8, -17.2], [46.3, -13.9], [48.8, -14.3], [52.8, 10.2], [50.2, 10.6], [50.7, 13.5], [49.5, 13.7], [57.6, 56.1], [57.3, 57.6],
  [54.4, 58.4], [54.1, 61.5], [36.3, 64.3], [35.9, 62.1], [-8.3, 69.1], [-8.0, 71.3], [-24.7, 74.0], [-26.3, 71.9], [-29.7, 71.6], [-35.7, 27.2],
  [-37.8, 27.6], [-40.3, 24.7], [-43.9, 25.3], [-47.8, 1.1], [-44.7, 0.5], [-42.4, -1.3], [-42.7, -2.9], [-40.6, -3.3], [-48.4, -45.8],
];
const YAW = 1.7279;

export const landmark: Landmark = {
  id: 'city-hall',
  exclusions: [circle(37.779272, -122.419316, 15)],
  build(game: Game) {
    const site = new Site(game, 'city-hall', source, 0);
    const granite = glow('#ffe9c4', '#dedbd2', 0.4);
    const trim = paint('#cbc7bc');
    const roof = paint('#8a8d8f');
    const dome = paint('#7c8a8a');
    const gold = glow('#ffcf6a', '#c9a24a', 0.9);
    const ring = FOOTPRINT.map(([x, z]): Pt => [x + OFFSET.x, z + OFFSET.z]);

    site.extrude(granite, ring, -2, 27).extrude(trim, ring, 25, 1.4).extrude(roof, ring, 26.4, 0.6);
    const c = Math.cos(YAW);
    const s = Math.sin(YAW);
    const along = (u: number, v: number) => ({ x: u * c + v * s, z: -u * s + v * c });
    for (const side of [-1, 1]) {
      const p = along(0, side * 47);
      site.box(granite, 34, 32, 6, p.x, 0, p.z, YAW);
      for (let k = -3; k <= 3; k++) {
        const q = along(k * 4.4, side * 50.6);
        site.cyl(trim, 0.9, 0.8, 20, q.x, 6, q.z, 10);
      }
      const ped = along(0, side * 48.5);
      site.box(trim, 30, 4, 3, ped.x, 32, ped.z, YAW);
    }
    site.box(granite, 40, 44, 40, 0, 0, 0, YAW).box(trim, 42, 1.6, 42, 0, 44, 0, YAW);
    site.cyl(granite, 18.5, 18.5, 4, 0, 45.6, 0, 32).cyl(dome, 16.6, 16.6, 13, 0, 49.6, 0, 32);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      site.cyl(trim, 0.7, 0.6, 12, Math.cos(a) * 18, 49.6, Math.sin(a) * 18, 8);
    }
    site.cyl(trim, 19, 19, 2.4, 0, 61.6, 0, 32);
    site.lathe(dome, [[0, 0], [17, 0], [16.6, 4], [15.2, 8.5], [12.6, 12.8], [8.8, 16.4], [4.6, 18.6], [3.2, 19]], 0, 64, 0, 32);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      site.beam(gold, { x: Math.cos(a) * 17.1, y: 64, z: Math.sin(a) * 17.1 }, { x: Math.cos(a) * 12.9, y: 76.8, z: Math.sin(a) * 12.9 }, 0.5, 0.5);
      site.beam(gold, { x: Math.cos(a) * 12.9, y: 76.8, z: Math.sin(a) * 12.9 }, { x: Math.cos(a) * 3.4, y: 82.8, z: Math.sin(a) * 3.4 }, 0.5, 0.5);
    }
    site.cyl(trim, 3.4, 3, 6, 0, 82.6, 0, 12);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      site.cyl(trim, 0.3, 0.3, 4.4, Math.cos(a) * 3.6, 83, Math.sin(a) * 3.6, 6);
    }
    site.lathe(gold, [[0, 0], [3.4, 0], [2.4, 1.6], [0.9, 2.8], [0.4, 4.6], [0, 5.1]], 0, 88.6, 0, 16);
    site.box(beacon('#ff2a1a', 2.4), 0.5, 0.5, 0.5, 0, FACTS.domeHeight - 0.2, 0);

    site.solidBox(0, -2, 0, 120, 29, 92, YAW).solidBox(0, 0, 0, 40, 45.6, 40, YAW);
    site.solidCyl(0, 45.6, 0, 19, 18.4).solidCyl(0, 64, 0, 15.5, 10).solidCyl(0, 74, 0, 9, 9).solidCyl(0, 83, 0, 3.6, 10.7);
    site.finish();
  },
};
