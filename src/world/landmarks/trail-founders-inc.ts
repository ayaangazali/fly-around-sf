import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';
import { gable, sign, windowsAlong } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'Founders, Inc., Fort Mason Center Landmark Building C',
  lat: 37.80676,
  lon: -122.4315,
  url: 'https://www.openstreetmap.org/way/398609305',
};

export const FACTS = {
  height: 14.5,
  buildings: 'A to E',
  sources: ['https://f.inc/', 'https://www.nps.gov/places/000/9-san-francisco-port-of-embarkation.htm', 'https://www.openstreetmap.org/way/398609305'],
};

export const TOP = 17;

const YAW = 1.7279;
export const WAREHOUSES: Pt[] = [
  [35, 12.3], [28.4, 12.3], [28.1, 14.2], [-22.6, 14.3], [-22.8, 12.7], [-29.4, 12.7], [-29.6, -8.6], [3.9, -8.8], [3.8, -18], [-29.2, -17.6],
  [-29.7, -39.5], [-23.2, -39.4], [-22.9, -40.9], [28.2, -40.9], [28, -39.4], [34.5, -39.4], [34.7, -18.1], [5.9, -18.1], [6.4, -8.4], [34.2, -8.6],
];
export const DE: Pt[] = [
  [34.8, 109.4], [27.6, 109.8], [27.9, 111.4], [-22.8, 111.5], [-23, 109.9], [-29.1, 110], [-29.2, 88.2], [-1.4, 88.5], [-1.4, 78.9], [-29.3, 79.1],
  [-29.4, 57.8], [-22.9, 57.8], [-23.1, 56.2], [28, 56.2], [28.3, 57.8], [34.8, 57.8], [34.5, 79], [2.1, 79], [2.1, 88.6], [34.5, 88.7],
];
export const A: Pt[] = [[63.9, -64.6], [32.9, -64.5], [33.2, -53.3], [-46.9, -52.8], [-82.9, -52.4], [-82.8, -68.6], [64, -68.7]];
const C = { x0: -29.6, x1: 35, z0: -8.6, z1: 14.3 };
const ROWS = [
  { ring: WAREHOUSES, eave: 11.5, blocks: [C, { x0: -29.7, x1: 34.7, z0: -40.9, z1: -17.6 }] },
  { ring: DE, eave: 11.5, blocks: [{ x0: -29.4, x1: 34.8, z0: 56.2, z1: 79.1 }, { x0: -29.2, x1: 34.8, z0: 88.2, z1: 111.5 }] },
  { ring: A, eave: 7.6, blocks: [{ x0: -82.9, x1: 64, z0: -68.7, z1: -52.4 }] },
];
const RISE = 3;

export const landmark: Landmark = {
  id: 'trail-founders-inc',
  exclusions: [circle(37.806769, -122.431655, 6), circle(37.806897, -122.430565, 6), circle(37.806651, -122.432176, 6)],
  build(game: Game) {
    const site = new Site(game, 'trail-founders-inc', source, YAW);
    const cream = glow('#ffe6bf', '#eee2c6', 0.12);
    const trim = paint('#d8c9a6');
    const tile = paint('#a9452e');

    const signs = [
      { text: 'FOUNDERS, INC.', x: (C.x0 + C.x1) / 2, z: C.z1 + 0.05, ry: 0, letter: 4, y: 7.6 },
      { text: 'FOUNDERS,\nINC.', x: -12.9, z: C.z0 - 0.05, ry: Math.PI, letter: 3.4, y: 6.2 },
    ];
    const clear = signs.map((s) => sign(site, s.text, s.x, s.y, s.z, s.ry, s.letter, { panel: null, ink: '#24313a', light: '#ffd27a' }));
    for (const row of ROWS) {
      site.extrude(cream, row.ring, -2, row.eave + 2).solidPrism(row.ring, -2, row.eave + 2);
      windowsAlong(site, row.ring, { floors: row.eave > 10 ? [1.2, 4.9, 8.4] : [1.4, 4.6], w: 2.3, h: 2.3, step: 3.3, dark: '#36424b', clear });
      for (const w of row.blocks) {
        const xc = (w.x0 + w.x1) / 2;
        const zc = (w.z0 + w.z1) / 2;
        const len = w.x1 - w.x0;
        const wid = w.z1 - w.z0;
        const rise = Math.min(RISE, wid * 0.13);
        gable(site, tile, len + 1.2, wid + 1.6, rise, xc, row.eave, zc);
        for (const end of [w.x0, w.x1]) {
          const out = Math.sign(end - xc);
          gable(site, cream, 0.8, wid - 2, rise + 1.6, end - out * 0.4, row.eave, zc);
          site.box(trim, 1.1, 0.5, 6, end - out * 0.4, row.eave + rise + 1.4, zc);
          site.box(paint('#4a3b2e'), 0.4, 4.6, 4.2, end + out * 0.05, -0.4, zc).box(trim, 0.5, 0.5, 5, end + out * 0.1, 4.2, zc);
        }
        site.solidBox(xc, row.eave, zc, len, rise * 0.4, wid * 0.6).solidBox(xc, row.eave, zc, len, rise * 0.8, wid * 0.2);
      }
    }
    site.finish();
  },
};
