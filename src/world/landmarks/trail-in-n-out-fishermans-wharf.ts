import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';
import { sign, windowsAlong } from '../trail-kit';

export const source: LandmarkSource = {
  name: "In-N-Out Burger, 333 Jefferson Street, Fisherman's Wharf",
  lat: 37.80775,
  lon: -122.41852,
  url: 'https://www.openstreetmap.org/node/434874627',
};

export const FACTS = {
  opened: '2001-09-20',
  height: 12.1,
  sources: ['https://locations.in-n-out.com/154', 'https://localwiki.org/sf/In-N-Out_Burger', 'https://www.openstreetmap.org/node/434874627'],
};

export const TOP = 25;

const YAW = -2.9789;
export const BLOCK: Pt[] = [
  [-11.4, 4.3], [-12.2, 3.1], [8.5, -17.8], [18, -17.2], [16.3, -19], [18.7, -21.2], [19.2, -21.1], [19.4, -43.9], [0.1, -44], [0, -43.5],
  [-0.5, -43.1], [0.2, -35.4], [-1, -34], [-1, -31], [-0.1, -30.3], [0.3, -26.7], [-0.9, -25.4], [0, -18.7], [-15.1, -3.9], [-15.6, -0.5],
  [-16.2, -0.1], [-16.7, -0.1], [-19.2, -0.5], [-19.8, -3.2], [-18.4, -5], [-18.4, -72.9], [-15.3, -76.4], [-15.2, -77.4], [-12.9, -79.1], [-9.3, -79],
  [-8.2, -79.8], [-5.6, -79.9], [-5.2, -79.3], [-0.2, -79], [0.4, -79.9], [8.4, -79.1], [9.1, -80], [16.6, -79.3], [17.7, -80.1], [21.1, -79.1],
  [25.1, -78.9], [26.3, -79.7], [29.7, -79.2], [33.7, -79], [34.9, -79.8], [40.8, -78.9], [40.5, -64.7], [35.6, -59.4], [35.4, -48.8], [33.2, -48.2],
  [30.3, -45.6], [35.3, -45.3], [35.5, -46.8], [40.6, -46.5], [41.9, -45.2], [40.3, 4.7], [-6.9, 5], [-6.3, 4.6],
];
const H = 12.1;
const FRONT = 4.85;
const SHOP = { x0: -5.5, x1: 15.5 };

export const landmark: Landmark = {
  id: 'trail-in-n-out-fishermans-wharf',
  exclusions: [circle(37.807344, -122.418531, 6)],
  build(game: Game) {
    const site = new Site(game, 'trail-in-n-out-fishermans-wharf', source, YAW);
    const stucco = paint('#d7bf98');
    const red = glow('#ff4b4b', '#c8202b', 0.5);
    const yellow = glow('#ffd84a', '#f5c518', 0.4);
    const white = paint('#f5f3ee');
    const glass = glow('#ffe0a8', '#26313a', 0.9);

    site.extrude(stucco, BLOCK, -2, H + 2).extrude(paint('#8a8178'), BLOCK, H, 0.3);
    const info = sign(site, 'IN-N-OUT\nBURGER', (SHOP.x0 + SHOP.x1) / 2, H + 0.8 + 5.8, FRONT - 2.2, 0, 3.6, { panel: '#c8202b', ink: '#ffffff', light: '#fff4e0', accent: '#f5c518' });
    windowsAlong(site, BLOCK, { floors: [4.8, 8.4], w: 1.7, h: 1.9, step: 3.1, frame: '#efe7d8', dark: '#3a4650', clear: [info] });
    for (const s of [-1, 1]) site.box(paint('#3a3f44'), 0.6, 1.2, 0.6, info.x + (s * info.w) / 3, H, info.z + 0.4);

    const mid = (SHOP.x0 + SHOP.x1) / 2;
    const width = SHOP.x1 - SHOP.x0;
    site.box(white, width, 4.4, 0.5, mid, -0.3, FRONT + 0.25);
    site.box(red, width + 0.2, 0.9, 0.7, mid, 4.1, FRONT + 0.35).box(yellow, width + 0.2, 0.3, 0.75, mid, 5, FRONT + 0.35);
    for (let i = 0; i < 6; i++) {
      const x = SHOP.x0 + 1.9 + i * ((width - 3.8) / 5);
      if (i === 2) {
        site.box(paint('#20262c'), 2.2, 2.9, 0.3, x, 0, FRONT + 0.55);
        continue;
      }
      site.box(glass, 2.6, 2.4, 0.3, x, 0.8, FRONT + 0.55);
    }
    for (let i = 0; i < 5; i++) {
      const x = SHOP.x0 + 2.2 + i * ((width - 4.4) / 4);
      site.box(red, 3.6, 0.15, 1.6, x, 3.5, FRONT + 1.2).box(white, 3.6, 0.5, 0.12, x, 3.1, FRONT + 2);
    }
    for (const x of [SHOP.x0 - 0.2, SHOP.x1 + 0.2]) site.box(yellow, 0.4, 5.3, 0.8, x, -0.3, FRONT + 0.35);

    site.solidPrism(BLOCK, -2, H + 2).solidBox(info.x, H, info.z + 0.3, info.w, info.h + 0.8, 1);
    site.finish();
  },
};
