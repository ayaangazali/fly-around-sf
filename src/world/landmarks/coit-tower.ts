import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, loft, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Coit Tower',
  lat: 37.802373,
  lon: -122.405834,
  url: 'https://www.openstreetmap.org/way/28824850',
};

export const FACTS = {
  height: 64,
  shaft: 54.9,
  deckBelowTop: 9.8,
  built: 1933,
  sources: ['https://en.wikipedia.org/wiki/Coit_Tower', 'https://www.openstreetmap.org/way/28824850', 'https://structurae.net/fr/ouvrages/coit-tower'],
};

function fluted(r: number, flutes = 20, depth = 0.06): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < flutes * 2; i++) {
    const a = (i / (flutes * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * (1 - depth) : r;
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

export const landmark: Landmark = {
  id: 'coit-tower',
  exclusions: [circle(source.lat, source.lon, 15)],
  build(game: Game) {
    const site = new Site(game, 'coit-tower', source, 0.2531);
    const stone = glow('#fff0d2', '#e9e1cf', 0.55);
    const dark = paint('#6d6a63');
    const roof = paint('#b9b2a2');
    const base = 9;

    site.box(stone, 22, base + 4, 22, 0, -4, 0).box(roof, 23, 0.8, 23, 0, base, 0);
    for (const s of [-1, 1]) {
      site.box(stone, 6, 4, 4, s * 7, -2, 12.5);
      site.box(dark, 3.2, 3.4, 0.3, s * 6, 1.2, 11.1);
    }
    const r0 = 5.9;
    const r1 = 5.3;
    const deck = FACTS.height - FACTS.deckBelowTop;
    site.add(stone, loft([
      { y: base, ring: fluted(r0) },
      { y: deck - 1, ring: fluted(r1) },
    ], false));
    site.lathe(stone, [[0, 0], [r1 + 0.6, 0], [r1 + 0.6, 1], [r1 + 0.2, 1.2]], 0, deck - 1, 0, 40);
    const arches = 12;
    for (let i = 0; i < arches; i++) {
      const a = (i / arches) * Math.PI * 2;
      site.box(stone, 1, 5.4, 1.4, Math.cos(a) * (r1 - 0.2), deck, Math.sin(a) * (r1 - 0.2), -a);
    }
    site.cyl(dark, r1 - 0.8, r1 - 0.8, 5.4, 0, deck, 0, 24);
    site.lathe(stone, [[0, 0], [r1 + 0.4, 0], [r1 + 0.4, 1.2], [r1 - 0.2, 1.6], [r1 - 0.3, 3.4], [r1 - 1.2, 3.8], [0, 4.2]], 0, deck + 5.4, 0, 40);
    site.cyl(paint('#a39d90'), 0.25, 0.25, 0.8, 0, FACTS.height - 0.4, 0, 8);

    site.solidBox(0, -4, 0, 22, base + 4.8, 22).solidCyl(0, base, 0, r0 + 0.2, FACTS.height - base);
    site.finish();
  },
};
