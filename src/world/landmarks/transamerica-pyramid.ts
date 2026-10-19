import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, circle, glow, loft, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Transamerica Pyramid',
  lat: 37.795166,
  lon: -122.402786,
  url: 'https://www.openstreetmap.org/way/24222973',
};

export const FACTS = {
  height: 260,
  topFloor: 212,
  spire: 65,
  base: 53.3,
  wingsFrom: 29,
  floors: 48,
  sources: ['https://en.wikipedia.org/wiki/Transamerica_Pyramid', 'https://skyscraperpage.com/b1601', 'https://www.openstreetmap.org/way/24222973'],
};

const YAW = 0.1571;
const FLOOR = FACTS.topFloor / FACTS.floors;

const square = (w: number): Pt[] => [
  [w / 2, w / 2],
  [-w / 2, w / 2],
  [-w / 2, -w / 2],
  [w / 2, -w / 2],
];

const widthAt = (y: number) => FACTS.base - ((FACTS.base - 11) * y) / FACTS.topFloor;

export const landmark: Landmark = {
  id: 'transamerica-pyramid',
  exclusions: [circle(source.lat, source.lon, 24)],
  build(game: Game) {
    const site = new Site(game, 'transamerica-pyramid', source, YAW);
    const white = '#e9e6de';
    const spire = glow('#ffe7c2', '#d9d6cf', 0.45);
    const frame = paint('#d7d3ca', true);

    const sections = [];
    for (let i = 0; i <= 12; i++) {
      const y = 14 + ((FACTS.topFloor - 14) * i) / 12;
      sections.push({ y, ring: square(widthAt(y)) });
    }
    site.windows(white, loft(sections));
    site.box(frame, FACTS.base + 1, 1.2, FACTS.base + 1, 0, 13.4, 0);
    for (const [ax, az] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const off = FACTS.base / 2 - 0.6;
      for (let k = -3; k <= 3; k++) {
        const t = (k / 3) * (FACTS.base / 2 - 2);
        const x = ax ? ax * off : t;
        const z = az ? az * off : t;
        const lean = 3.4;
        const dx = ax ? 0 : lean;
        const dz = az ? 0 : lean;
        site.beam(frame, { x: x - dx, y: 0, z: z - dz }, { x, y: 14, z }, 1, 1.4).beam(frame, { x: x + dx, y: 0, z: z + dz }, { x, y: 14, z }, 1, 1.4);
      }
    }

    const wingBase = FACTS.wingsFrom * FLOOR;
    for (const side of [-1, 1]) {
      const outer = widthAt(wingBase) / 2 + 1.2;
      const inner = widthAt(FACTS.topFloor + 8) / 2 - 1;
      const w = 9;
      const wing = loft([
        { y: wingBase, ring: [[side * inner, w / 2], [side * outer, w / 2], [side * outer, -w / 2], [side * inner, -w / 2]] },
        { y: FACTS.topFloor + 8, ring: [[side * inner, w / 2], [side * outer, w / 2], [side * outer, -w / 2], [side * inner, -w / 2]] },
      ]);
      site.windows(white, wing);
      site.solidBox(side * (outer + inner) / 2, wingBase, 0, outer - inner, FACTS.topFloor + 8 - wingBase, w);
    }

    site.add(spire, loft([
      { y: FACTS.topFloor, ring: square(widthAt(FACTS.topFloor)) },
      { y: FACTS.height - 2, ring: square(0.6) },
    ]));
    site.box(beacon('#ff2a1a', 2), 0.8, 1.2, 0.8, 0, FACTS.height - 2, 0);

    for (let i = 0; i < 12; i++) {
      const y = (FACTS.topFloor * i) / 12;
      site.solidBox(0, y, 0, widthAt(y + FACTS.topFloor / 24), FACTS.topFloor / 12, widthAt(y + FACTS.topFloor / 24));
    }
    for (let i = 0; i < 4; i++) {
      const y = FACTS.topFloor + (i * (FACTS.height - FACTS.topFloor)) / 4;
      const w = widthAt(FACTS.topFloor) * (1 - i / 4);
      site.solidBox(0, y, 0, w, (FACTS.height - FACTS.topFloor) / 4, w);
    }
    site.finish();
  },
};
