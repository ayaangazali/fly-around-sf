import type { Landmark } from '../world';
import type { Game } from '../../game';
import { circle, paint, type LandmarkSource } from '../landmark-kit';
import { buildWindmill } from '../windmill';

export const source: LandmarkSource = {
  name: 'Dutch Windmill, Golden Gate Park',
  lat: 37.770441,
  lon: -122.509406,
  url: 'https://www.openstreetmap.org/way/287921407',
};

export const FACTS = {
  height: 22.9,
  sailSpan: 31.1,
  built: 1903,
  sources: ['https://windmillworld.com/world/california.htm', 'https://ronhenggeler.com/Newsletters/2008/12.12/Newsletter.html', 'https://www.openstreetmap.org/way/287921407'],
};

const TULIPS = ['#e2394f', '#f6c445', '#f08bb0', '#ffffff', '#b04fd1', '#ff8a3d'];

export const landmark: Landmark = {
  id: 'dutch-windmill',
  exclusions: [circle(source.lat, source.lon, 9)],
  build(game: Game) {
    buildWindmill(game, 'dutch-windmill', source, { height: FACTS.height, sailSpan: FACTS.sailSpan, baseRadius: 6.5, body: '#6e5a48', facing: -Math.PI / 2 }, (site) => {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 3; col++) {
          const x = -14 + col * 7;
          const z = 14 + row * 2.2;
          site.box(paint('#5b4636'), 6, 0.3, 1.6, x, site.groundAt(x, z) - 0.1, z);
          site.box(paint(TULIPS[(row + col) % TULIPS.length]), 5.6, 0.35, 1.2, x, site.groundAt(x, z) + 0.2, z);
        }
      }
    });
  },
};
