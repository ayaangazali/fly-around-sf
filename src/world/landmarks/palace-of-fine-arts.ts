import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Palace of Fine Arts',
  lat: 37.80292,
  lon: -122.4484,
  url: 'https://www.openstreetmap.org/way/288371295',
};

export const FACTS = {
  rotundaHeight: 50,
  colonnadeHeight: 20,
  built: 1915,
  sources: [
    'https://en.wikipedia.org/wiki/Palace_of_Fine_Arts',
    'https://www.openstreetmap.org/way/288371295',
    'https://www.openstreetmap.org/relation/7471537',
  ],
};

const SOUTH_ARC: Pt[] = [
  [-23.0, 32.5], [-19.8, 36.4], [-15.0, 46.8], [-11.8, 50.7], [-7.5, 53.1], [-1.1, 61.9], [3.6, 65.6], [8.4, 67.0], [12.5, 71.2], [22.5, 74.2],
  [29.3, 70.3], [37.8, 71.5], [42.4, 70.9], [46.6, 75.8], [47.3, 95.9], [51.5, 100.5], [47.8, 104.7], [43.0, 105.4], [42.3, 100.1], [44.4, 96.5],
  [39.9, 74.7], [28.8, 76.5], [25.7, 79.1], [21.9, 79.0], [14.3, 75.1], [5.6, 70.8], [0.7, 69.5], [-11.0, 56.3], [-15.5, 53.9], [-24.0, 38.6],
  [-27.8, 35.2], [-28.1, 33.4],
];
const NORTH_ARC: Pt[] = [
  [13.2, -110.7], [17.5, -111.1], [18.1, -105.8], [15.2, -105.4], [17.8, -85.8], [20.5, -86.2], [21.2, -80.9], [18.8, -77.0], [13.5, -79.6], [5.6, -78.3],
  [1.6, -74.6], [-1.9, -77.5], [-13.5, -68.2], [-15.8, -61.5], [-19.4, -60.1], [-25.3, -48.4], [-28.0, -42.1], [-31.9, -28.0], [-33.1, -20.2], [-35.6, -20.0],
  [-37.4, -24.0], [-36.6, -28.8], [-30.0, -45.4], [-28.2, -49.7], [-19.7, -64.6], [-16.8, -68.6], [-12.9, -73.3], [-3.3, -80.3], [-0.4, -83.0], [2.0, -86.5],
  [3.5, -81.2], [14.6, -82.9], [12.1, -105.0],
];
export const LAGOON: Pt[] = [
  [43.7, -110.3], [35.6, -131.2], [39.0, -135.1], [45.8, -133.1], [59.6, -135.0], [80.4, -121.3], [85.7, -108.2], [94.1, -96.4], [90.0, -75.2], [103.5, -54.2],
  [108.4, -12.5], [106.7, -8.2], [97.8, -4.9], [96.7, 1.1], [101.5, 12.7], [117.8, 32.8], [117.7, 36.4], [111.1, 47.1], [117.7, 60.0], [117.2, 63.0],
  [110.0, 71.5], [106.5, 83.3], [95.3, 91.0], [102.7, 99.0], [100.7, 104.3], [90.2, 103.0], [82.2, 106.9], [78.1, 105.9], [56.6, 90.7], [50.2, 68.6],
  [45.8, 61.9], [39.3, 59.2], [17.3, 64.2], [4.0, 56.4], [-7.0, 45.0], [-7.2, 40.1], [0.1, 35.1], [20.7, 36.4], [35.1, 30.3], [40.6, 20.9],
  [47.4, -6.5], [32.9, -29.7], [20.3, -41.0], [10.2, -42.1], [-3.1, -34.4], [-11.0, -32.9], [-18.1, -36.2], [-19.6, -45.0], [-10.3, -61.6], [-4.0, -68.1],
  [19.6, -71.1], [31.8, -78.5], [24.1, -91.2], [23.4, -103.4], [29.8, -107.6], [34.0, -95.1], [39.3, -96.6], [43.1, -99.6],
];

export const landmark: Landmark = {
  id: 'palace-of-fine-arts',
  exclusions: [circle(source.lat, source.lon, 20), circle(37.802329, -122.448277, 6), circle(37.803542, -122.448508, 6)],
  build(game: Game) {
    const site = new Site(game, 'palace-of-fine-arts', source, 0);
    const stone = glow('#ffd9a8', '#d9bd96', 0.5);
    const column = paint('#e3cfb0');
    const dome = paint('#c48f5f');
    const water = paint('#4a7f88');

    site.extrude(water, LAGOON, -0.5, 0.9);

    for (const arc of [SOUTH_ARC, NORTH_ARC]) {
      site.extrude(stone, arc, 15, 3.2);
      site.extrude(paint('#cdb38f'), arc, 18.2, 1.3);
      for (let i = 0; i < arc.length; i++) {
        const [x, z] = arc[i];
        const [nx, nz] = arc[(i + 1) % arc.length];
        site.cyl(column, 0.75, 0.6, 15, x, 0, z, 10).box(column, 1.8, 0.6, 1.8, x, 0, z);
        if (i % 3 === 0) site.box(stone, 2.6, 3.4, 2.6, x, 19.5, z).box(paint('#b49b7a'), 0.6, 1.6, 0.6, x, 22.9, z);
        site.solidCyl(x, 0, z, 1, 19.5);
        if (Math.hypot(nx - x, nz - z) < 22) site.solidBeam({ x, y: 17, z }, { x: nx, y: 17, z: nz }, 2.5, 4);
      }
    }

    const piers = 8;
    const pr = 23;
    for (let i = 0; i < piers; i++) {
      const a = ((i + 0.5) / piers) * Math.PI * 2;
      const x = Math.cos(a) * pr;
      const z = Math.sin(a) * pr;
      site.box(stone, 5.5, 33, 5.5, x, 0, z, -a).solidBox(x, 0, z, 5.5, 33, 5.5, -a);
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const c = Math.cos(-a);
        const s = Math.sin(-a);
        const ox = dx * 3.3;
        const oz = dz * 3.3;
        site.cyl(column, 0.8, 0.65, 30, x + ox * c + oz * s, 0, z - ox * s + oz * c, 10);
      }
      site.box(stone, 6.5, 3, 6.5, x, 33, z, -a).box(paint('#b49b7a'), 1.4, 3.4, 1.4, x, 36, z, -a);
      const b = ((i + 1.5) / piers) * Math.PI * 2;
      const nx = Math.cos(b) * pr;
      const nz = Math.sin(b) * pr;
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        const y = 22 + Math.sin(Math.PI * t) * 7;
        const p = { x: x + (nx - x) * t, z: z + (nz - z) * t };
        site.box(stone, 2.6, 33 - y, 2.4, p.x, y, p.z, -(a + b) / 2 + Math.PI / 2);
      }
    }
    site.cyl(stone, 17, 16.5, 12, 0, 25, 0, 8).solidCyl(0, 25, 0, 17, 15);
    site.cyl(paint('#cdb38f'), 17.6, 17.6, 1.4, 0, 36.6, 0, 8);
    site.lathe(dome, [[0, 0], [16.4, 0], [15.8, 3], [13.8, 6.5], [10.4, 9.4], [5.6, 11.6], [0, 12.4]], 0, 38, 0, 24);
    site.cyl(stone, 1.4, 1, 1.6, 0, 50.2, 0, 8);
    site.solidCyl(0, 38, 0, 15, 11);
    site.finish();
  },
};
