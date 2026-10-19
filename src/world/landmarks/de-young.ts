import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glass, loft, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'de Young Museum',
  lat: 37.771585,
  lon: -122.468528,
  url: 'https://www.openstreetmap.org/relation/1652482',
};

export const FACTS = {
  towerHeight: 43.9,
  opened: 2005,
  facade: 'perforated and dimpled copper',
  sources: ['https://en.wikipedia.org/wiki/De_Young_Museum', 'https://www.openstreetmap.org/relation/1652482', 'https://www.openstreetmap.org/way/444230154'],
};

export const FOOTPRINT: Pt[] = [[31.4, 20.6], [-44.8, 89.3], [-96.2, 32.8], [4.9, -57.5], [18.7, -69.9], [22.6, -51.6], [30.5, -43.0], [26.2, -39.1], [32.8, -36.2], [34.9, -38.1], [62.3, -7.7]];
export const TOWER: Pt[] = [[11.5, -50.3], [15.2, -30.1], [30.5, -43.0], [22.6, -51.6], [18.7, -69.9], [4.9, -57.5]];
const TWIST = 0.38;

export const landmark: Landmark = {
  id: 'de-young',
  exclusions: [circle(37.771529, -122.468549, 20)],
  build(game: Game) {
    const site = new Site(game, 'de-young', source, 0);
    const copper = paint('#6d4c38', true);
    const patina = paint('#59665a', true);
    const roof = paint('#5b4a3e');
    site.extrude(copper, FOOTPRINT, -2, 15).extrude(roof, FOOTPRINT, 13, 1.4);
    site.extrude(glass('#7f97a6'), FOOTPRINT.map(([x, z]): Pt => [x * 0.98, z * 0.98]), -0.5, 4.2);
    site.solidPrism(FOOTPRINT, -2, 16.4);

    let cx = 0;
    let cz = 0;
    for (const [x, z] of TOWER) {
      cx += x / TOWER.length;
      cz += z / TOWER.length;
    }
    const twisted = (t: number): Pt[] =>
      TOWER.map(([x, z]) => {
        const a = TWIST * t;
        const dx = x - cx;
        const dz = z - cz;
        return [cx + dx * Math.cos(a) - dz * Math.sin(a), cz + dx * Math.sin(a) + dz * Math.cos(a)];
      });
    const sections = [];
    for (let i = 0; i <= 10; i++) sections.push({ y: -2 + ((FACTS.towerHeight + 2) * i) / 10, ring: twisted(i / 10) });
    site.add(copper, loft(sections));
    for (let k = 1; k < 10; k += 3) site.add(patina, loft([{ y: sections[k].y, ring: sections[k].ring }, { y: sections[k].y + 0.6, ring: sections[k].ring }], false));
    site.add(glass('#9bb3c0'), loft([{ y: FACTS.towerHeight - 4, ring: twisted(0.98).map(([x, z]): Pt => [cx + (x - cx) * 1.01, cz + (z - cz) * 1.01]) }, { y: FACTS.towerHeight - 0.5, ring: twisted(1).map(([x, z]): Pt => [cx + (x - cx) * 1.01, cz + (z - cz) * 1.01]) }], false));
    for (let i = 0; i < 6; i++) site.solidPrism(twisted((i + 0.5) / 6), -2 + ((FACTS.towerHeight + 2) * i) / 6, (FACTS.towerHeight + 2) / 6);
    site.finish();
  },
};
