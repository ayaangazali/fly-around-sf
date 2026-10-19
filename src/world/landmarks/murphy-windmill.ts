import type { Landmark } from '../world';
import type { Game } from '../../game';
import { circle, type LandmarkSource } from '../landmark-kit';
import { buildWindmill } from '../windmill';

export const source: LandmarkSource = {
  name: 'Murphy Windmill, Golden Gate Park',
  lat: 37.765002,
  lon: -122.508697,
  url: 'https://www.openstreetmap.org/way/287927026',
};

export const TOP = 43;

export const FACTS = {
  height: 29,
  sailSpan: 34.7,
  built: 1908,
  donor: 'Samuel G. Murphy',
  sources: ['https://www.atlasobscura.com/places/murphy-windmill', 'https://windmillworld.com/world/california.htm', 'https://www.openstreetmap.org/way/287927026'],
};

export const landmark: Landmark = {
  id: 'murphy-windmill',
  exclusions: [circle(source.lat, source.lon, 10)],
  build(game: Game) {
    buildWindmill(game, 'murphy-windmill', source, { height: FACTS.height, sailSpan: FACTS.sailSpan, baseRadius: 7.5, body: '#8a7259', facing: -Math.PI / 2 });
  },
};
