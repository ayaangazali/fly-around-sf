import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, circle, crown, glass, loft, paint, roundedRect, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Salesforce Tower',
  lat: 37.789775,
  lon: -122.39693,
  url: 'https://www.openstreetmap.org/way/431972186',
};

export const FACTS = {
  height: 326,
  roof: 296,
  floors: 61,
  base: 54.4,
  crownLeds: 11000,
  crownFloors: 6,
  sources: [
    'https://en.wikipedia.org/wiki/Salesforce_Tower',
    'https://www.ledsmagazine.com/articles/2018/06/salesforce-tower-skyscraper-crowned-with-six-floor-led-art-project-in-san-francisco.html',
    'https://www.openstreetmap.org/way/431972186',
  ],
};

const YAW = 0.7069;

const width = (y: number) => FACTS.base * (1 - 0.24 * (y / FACTS.roof) ** 1.3);
const corner = (y: number) => 13 + 6 * (y / FACTS.height);

export const landmark: Landmark = {
  id: 'salesforce-tower',
  exclusions: [circle(source.lat, source.lon, 26)],
  build(game: Game) {
    const site = new Site(game, 'salesforce-tower', source, YAW);
    const fins = paint('#e9ece9');
    const lobby = glass('#7f97a6');

    const body = [];
    for (let i = 0; i <= 16; i++) {
      const y = 12 + ((FACTS.roof - 12) * i) / 16;
      body.push({ y, ring: roundedRect(width(y), width(y), corner(y), 5) });
    }
    site.windows('#c5d2da', loft(body, false));
    site.add(lobby, loft([
      { y: 0, ring: roundedRect(width(0) - 3, width(0) - 3, corner(0), 5) },
      { y: 12, ring: roundedRect(width(0) - 3, width(0) - 3, corner(0), 5) },
    ], false));
    for (let k = 0; k < 4; k++) {
      const c = Math.cos((k * Math.PI) / 2);
      const sn = Math.sin((k * Math.PI) / 2);
      const rot = ([x, z]: [number, number]): [number, number] => [x * c + z * sn, -x * sn + z * c];
      for (let j = -3; j <= 3; j++) {
        const fin = [];
        for (let i = 0; i <= 8; i++) {
          const y = 12 + ((FACTS.roof - 12) * i) / 8;
          const flat = width(y) / 2 - corner(y);
          const u = (j / 3) * flat * 0.9;
          const f = width(y) / 2;
          fin.push({ y, ring: [rot([u - 0.3, f - 0.2]), rot([u + 0.3, f - 0.2]), rot([u + 0.3, f + 0.9]), rot([u - 0.3, f + 0.9])] });
        }
        site.add(fins, loft(fin, true));
      }
    }

    const crownRings = [];
    for (let i = 0; i <= 6; i++) {
      const y = FACTS.roof + ((FACTS.height - FACTS.roof) * i) / 6;
      const w = width(FACTS.roof) * (1 - 0.32 * (i / 6) ** 1.6);
      crownRings.push({ y, ring: roundedRect(w, w, corner(y) * (1 - 0.2 * (i / 6)), 5) });
    }
    const top = crownRings[crownRings.length - 1];
    site.add(crown(), loft(crownRings, false));
    site.add(paint('#b9bec2'), loft([{ y: FACTS.roof, ring: crownRings[0].ring }], true));
    site.add(paint('#c8ccce'), loft([top, { y: top.y + 0.6, ring: top.ring }], true));
    site.box(beacon('#ff2a1a', 2.2), 1, 1.2, 1, 0, FACTS.height, 0);

    for (let i = 0; i < 14; i++) {
      const y = (FACTS.height * i) / 14;
      const w = y < FACTS.roof ? width(y + FACTS.height / 28) : width(FACTS.roof) * 0.82;
      site.solidBox(0, y, 0, w * 0.96, FACTS.height / 14, w * 0.96);
    }
    site.finish();
  },
};
