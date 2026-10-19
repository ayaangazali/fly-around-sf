import type { Landmark } from '../world';
import type { Game } from '../../game';
import { toLocal } from '../../core/geo';
import { Site, beacon, glass, prism, type LandmarkSource, type Pt } from '../landmark-kit';

export interface Tower {
  name: string;
  lat: number;
  lon: number;
  roof: number;
  top: number;
  year: number;
  url: string;
  osm: string;
  ring: Pt[];
  spire?: boolean;
}

export interface HeightFix {
  name: string;
  lat: number;
  lon: number;
  height: number;
  url: string;
}

export const TOWERS: Tower[] = [
  { name: '181 Fremont', spire: true, lat: 37.789788, lon: -122.395356, roof: 213.4, top: 244.6, year: 2018, url: 'https://en.wikipedia.org/wiki/181_Fremont', osm: 'https://www.openstreetmap.org/way/445566153', ring: [[5.8, -24.3], [-22.8, 4.3], [2.5, 29.4], [21.2, 10.6], [13.8, 3.3], [23.7, -6.6]] },
  { name: 'Park Tower at Transbay', lat: 37.790427, lon: -122.394260, roof: 167.6, top: 184.4, year: 2018, url: 'https://en.wikipedia.org/wiki/Park_Tower_at_Transbay', osm: 'https://www.openstreetmap.org/way/611390934', ring: [[-41.1, -0.7], [-2.5, 38.0], [37.8, -1.7], [12.4, -19.7], [-11.8, -29.9]] },
  { name: 'The Avery', lat: 37.787813, lon: -122.394429, roof: 188.4, top: 188.4, year: 2019, url: 'https://en.wikipedia.org/wiki/The_Avery_(San_Francisco)', osm: 'https://www.openstreetmap.org/way/693629257', ring: [[-15.0, -19.8], [-38.5, 4.2], [-10.4, 31.5], [2.7, 24.0], [31.0, -7.9], [12.0, -10.6], [11.1, -12.4], [2.0, -3.0]] },
  { name: '350 Mission Street', lat: 37.790894, lon: -122.396756, roof: 129.2, top: 138.7, year: 2015, url: 'https://en.wikipedia.org/wiki/350_Mission_Street', osm: 'https://www.openstreetmap.org/way/226514310', ring: [[3.8, 29.4], [30.3, 3.2], [2.6, -24.6], [-24.0, 1.6]] },
  { name: '399 Fremont Street', lat: 37.787266, lon: -122.392280, roof: 122, top: 122, year: 2016, url: 'https://en.wikipedia.org/wiki/399_Fremont_Street', osm: 'https://www.openstreetmap.org/way/251587650', ring: [[-11.5, -51.3], [46.7, 6.3], [17.8, 35.2], [-40.4, -22.4]] },
  { name: 'Mira', lat: 37.789972, lon: -122.391717, roof: 130, top: 130, year: 2020, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/939499092', ring: [[12.0, -45.7], [45.9, -12.1], [-13.0, 46.8], [-46.9, 13.1]] },
  { name: '500 Folsom', lat: 37.787208, lon: -122.395228, roof: 132.6, top: 132.6, year: 2019, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/438098525', ring: [[-10.7, 38.1], [-18.3, 30.6], [-6.5, -13.4], [4.8, -24.4], [-0.9, -30.1], [14.2, -45.0], [44.5, -14.4]] },
  { name: '340 Fremont Street', lat: 37.787015, lon: -122.392881, roof: 121.9, top: 134.1, year: 2016, url: 'https://en.wikipedia.org/wiki/340_Fremont_Street', osm: 'https://www.openstreetmap.org/way/359267373', ring: [[-12.7, -37.5], [31.5, 6.8], [12.6, 25.5], [3.5, 16.3], [-4.9, 24.6], [-40.0, -10.6]] },
  { name: 'Jasper', lat: 37.785802, lon: -122.393735, roof: 131.1, top: 131.1, year: 2015, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/227689990', ring: [[-8.1, -34.8], [23.3, -3.3], [2.0, 17.7], [-29.3, -13.7]] },
  { name: 'Four Seasons Private Residences at 706 Mission Street', lat: 37.786091, lon: -122.402795, roof: 155.5, top: 155.5, year: 2020, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/693632325', ring: [[-9.6, -13.6], [-5.9, -9.8], [2.0, -17.5], [23.9, 5.1], [-2.3, 30.3], [-27.8, 3.9]] },
  { name: '33 Tehama', lat: 37.787270, lon: -122.396291, roof: 109.7, top: 115.8, year: 2017, url: 'https://en.wikipedia.org/wiki/33_Tehama', osm: 'https://www.openstreetmap.org/way/441638842', ring: [[18.7, -36.3], [36.2, -19.0], [-18.7, 36.3], [-36.2, 19.0]] },
  { name: 'Fifteen Fifty', lat: 37.773916, lon: -122.418299, roof: 128.6, top: 128.6, year: 2020, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/693627612', ring: [[18.7, -46.3], [13.6, -45.8], [-28.9, -11.4], [-31.1, -7.9], [-31.5, -2.2], [-19.5, 46.5], [-10.8, 48.6], [17.9, 20.3], [18.6, 16.0], [17.2, 12.0], [21.8, 16.4], [50.7, -13.8]] },
  { name: '8 NEMA', lat: 37.776033, lon: -122.417446, roof: 118, top: 118, year: 2014, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/285840933', ring: [[-12.6, 2.7], [-5.6, 14.8], [8.4, 21.6], [21.2, 15.9], [27.7, 3.1], [20.4, -10.0], [14.7, -14.1], [9.9, -16.0], [-1.5, -16.0], [-11.9, -25.0], [-41.8, 5.0], [-29.0, 17.8]] },
  { name: 'The Infinity I', lat: 37.789384, lon: -122.391391, roof: 106.7, top: 106.7, year: 2008, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/421816062', ring: [[11.1, 10.6], [7.2, 18.0], [4.8, 19.8], [-1.1, 20.9], [-4.1, 20.0], [-6.6, 18.2], [-10.7, 11.0], [-18.1, 7.2], [-19.9, 4.8], [-20.9, 1.9], [-20.1, -4.0], [-18.3, -6.5], [-11.1, -10.6], [-7.2, -18.0], [-4.8, -19.8], [1.1, -20.9], [4.1, -20.0], [6.6, -18.2], [10.7, -11.0], [18.1, -7.2], [20.9, -1.9], [20.1, 4.0], [18.3, 6.5]] },
  { name: '345 California Center', lat: 37.792618, lon: -122.400453, roof: 189, top: 211.8, year: 1986, url: 'https://en.wikipedia.org/wiki/345_California_Center', osm: 'https://www.openstreetmap.org/way/588355355', ring: [[44.7, 17.3], [38.4, -23.7], [-45.4, -10.7], [-39.0, 30.2]] },
  { name: 'Two Embarcadero Center', lat: 37.794989, lon: -122.398579, roof: 125.9, top: 125.9, year: 1974, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/32612520', ring: [[-30.0, -11.4], [-29.1, -5.9], [-35.3, -4.9], [-33.3, 6.8], [-27.8, 5.9], [-26.9, 11.2], [-24.5, 10.8], [-23.8, 14.8], [-19.2, 14.1], [-18.1, 20.9], [47.2, 10.3], [45.5, 0.1], [42.0, 0.7], [39.8, -12.1], [43.8, -12.7], [42.0, -23.2]] },
  { name: 'Three Embarcadero Center', lat: 37.795141, lon: -122.397309, roof: 125.9, top: 125.9, year: 1976, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/32612538', ring: [[-45.2, -9.3], [-43.7, 0.1], [-41.2, -0.3], [-39.5, 11.1], [-42.4, 11.5], [-40.3, 25.0], [26.9, 14.8], [25.9, 8.2], [30.5, 7.5], [29.0, -1.9], [35.4, -2.9], [33.1, -17.9], [24.8, -16.7], [24.3, -19.9]] },
  { name: 'Hilton San Francisco Financial District', lat: 37.795146, lon: -122.404311, roof: 111.3, top: 111.3, year: 1971, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/260922316', ring: [[41.3, 12.2], [-18.6, 22.4], [-20.1, 20.9], [-20.6, 17.4], [-15.0, 15.6], [-15.3, 13.7], [-31.2, 16.0], [-36.8, 9.8], [-37.9, 2.2], [-34.5, -6.4], [-18.6, -8.8], [-18.8, -9.8], [-23.4, -9.1], [-25.0, -10.3], [-25.5, -14.0], [-24.4, -15.4], [35.9, -24.3], [37.2, -15.4], [35.8, -15.2], [36.6, -9.8], [38.9, -10.2], [40.1, -2.2], [37.7, -1.9], [38.6, 3.9], [40.1, 3.7]] },
  { name: 'The Paramount', lat: 37.786808, lon: -122.401971, roof: 127.4, top: 127.4, year: 2002, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/160673823', ring: [[-5.6, 43.4], [-39.4, 9.5], [-12.6, -17.0], [-6.8, -11.2], [2.2, -20.1], [30.2, 8.0]] },
  { name: 'Providian Financial Building', lat: 37.791022, lon: -122.394884, roof: 127.1, top: 127.1, year: 1983, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/32862919', ring: [[-45.1, -9.8], [-55.7, -21.1], [-17.2, -58.0], [51.7, 14.3], [44.9, 21.1], [29.7, 21.8], [22.2, 14.3], [11.6, 15.1], [-1.3, 2.3], [-17.2, 3.0], [-31.1, -10.4]] },
  { name: 'InterContinental San Francisco', lat: 37.782107, lon: -122.404589, roof: 103.6, top: 103.6, year: 2008, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/256029743', ring: [[-46.9, 33.6], [-54.0, 26.4], [-47.4, 20.0], [-55.2, 12.0], [-2.2, -39.4], [23.1, -13.8], [25.2, -9.5], [22.2, -8.9], [22.6, -6.9], [19.2, -6.1], [19.7, -4.1], [16.6, -3.5], [17.0, -1.4], [13.9, -0.8], [14.3, 1.2], [11.2, 1.9], [11.6, 3.9], [7.7, 4.6], [9.4, 6.3], [-8.4, 24.1], [-9.4, 23.2], [-33.0, 47.6]] },
  { name: 'Shell Building', lat: 37.791605, lon: -122.399987, roof: 115.2, top: 115.2, year: 1929, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/260282390', ring: [[-20.8, -13.5], [15.9, -19.7], [22.1, 21.6], [-14.5, 27.2]] },
  { name: 'Royal Towers Apartments', lat: 37.798577, lon: -122.413119, roof: 100.6, top: 100.6, year: 1964, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/257026417', ring: [[-18.5, -33.9], [22.8, -40.5], [29.4, 0.9], [-1.1, 5.8], [3.1, 31.9], [-7.8, 33.7], [-14.0, -4.8], [-21.1, -3.7], [-21.8, -8.6], [-14.7, -9.7]] },
  { name: 'San Francisco Marriott Union Square', lat: 37.789463, lon: -122.408315, roof: 100.3, top: 100.3, year: 1972, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/32946774', ring: [[-22.5, -7.2], [-19.1, 13.8], [22.5, 7.2], [19.1, -13.8]] },
  { name: 'Parc 55 San Francisco', lat: 37.785026, lon: -122.408929, roof: 106.7, top: 106.7, year: 1984, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/288512967', ring: [[-35.6, 7.0], [-39.3, -10.7], [-38.0, -12.2], [-39.7, -12.6], [-40.8, -20.2], [-39.5, -22.1], [-33.1, -23.0], [-33.1, -21.2], [-31.4, -23.3], [-25.7, -24.2], [-24.8, -23.4], [-23.7, -24.8], [-20.6, -24.5], [-18.5, -25.6], [-17.2, -24.7], [-16.2, -25.9], [-12.9, -25.7], [-11.0, -26.9], [-9.6, -25.9], [-8.6, -27.3], [-6.2, -26.8], [-3.5, -28.0], [-2.1, -27.0], [0.7, -28.4], [5.3, -28.3], [6.4, -29.7], [12.2, -29.7], [13.3, -28.8], [12.6, -26.8], [13.7, -25.3], [14.2, -15.3], [15.7, -13.0], [14.9, -12.0], [16.2, -9.2], [15.1, -7.8], [16.7, -6.9], [16.1, -4.5], [17.5, -1.8], [16.3, -0.3], [17.9, 0.6], [17.3, 3.1], [18.5, 4.4], [20.3, 22.0], [21.7, 30.0], [22.8, 30.6], [22.2, 33.1], [23.4, 34.3], [22.8, 37.5], [24.0, 38.2], [23.4, 41.3], [24.6, 41.9], [23.9, 44.5], [25.4, 47.1], [24.6, 48.7], [26.2, 52.0], [24.7, 54.2], [20.3, 54.0], [19.0, 55.1], [11.2, 55.4], [10.5, 56.5], [7.2, 56.0], [-26.9, 61.5], [-30.3, 40.5], [-4.2, 36.1], [-9.5, 2.9]] },
  { name: 'McAllister Tower Apartments', lat: 37.781168, lon: -122.414099, roof: 94.5, top: 94.5, year: 1930, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco', osm: 'https://www.openstreetmap.org/way/256042681', ring: [[17.0, -24.2], [23.5, 17.1], [-17.9, 23.7], [-24.5, -17.7]] },

];

export const HEIGHT_FIXES: HeightFix[] = [
  { name: 'Lumina I', lat: 37.788708, lon: -122.392216, height: 121.9, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco' },
  { name: 'Lumina II', lat: 37.788722, lon: -122.391495, height: 106.7, url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_San_Francisco' },
  { name: 'The Harrison', lat: 37.786411, lon: -122.392051, height: 164.9, url: 'https://en.wikipedia.org/wiki/The_Harrison_(San_Francisco)' },
];

export const source: LandmarkSource = { name: TOWERS[0].name, lat: TOWERS[0].lat, lon: TOWERS[0].lon, url: TOWERS[0].url };

const MODERN = ['#b9c8d3', '#a7b9c6', '#c4ccd2', '#9fb1bf', '#cfd6db'];
const CLASSIC = ['#d9d1c3', '#cfc6b6', '#c9c2b8', '#e1dacb'];

export const landmark: Landmark = {
  id: 'skyline-modern',
  build(game: Game) {
    const site = new Site(game, 'skyline-modern', source, 0);
    const city = game.world.city;
    for (const fix of HEIGHT_FIXES) {
      const p = toLocal(fix.lat, fix.lon);
      let best = -1;
      for (const b of city.near(p.x, p.z, 0)) if (city.contains(b, p.x, p.z) && (best < 0 || city.height[b] > city.height[best])) best = b;
      if (best >= 0) city.height[best] = fix.height;
    }
    TOWERS.forEach((t, i) => {
      const o = site.at(t.lat, t.lon);
      const ring: Pt[] = t.ring.map(([x, z]) => [x + o.x, z + o.z]);
      const base = Math.min(...ring.map(([x, z]) => site.groundAt(x, z))) - 2;
      const roof = site.groundAt(o.x, o.z) + t.roof;
      site.hideCovered(ring);
      const palette = t.year >= 1990 ? MODERN : CLASSIC;
      site.windows(palette[i % palette.length], prism(ring, base, roof - base));
      site.solidPrism(ring, base, roof - base);
      if (t.top > t.roof + 1) {
        const slim = t.spire ? 0.1 : 0.45;
        const crown: Pt[] = t.ring.map(([x, z]) => [o.x + x * slim, o.z + z * slim]);
        site.add(glass('#d7dde2'), prism(crown, roof, t.top - t.roof));
        site.solidPrism(crown, roof, t.top - t.roof);
      }
      if (t.top > 150) site.box(beacon('#ff2a1a', 2), 1, 1, 1, o.x, site.groundAt(o.x, o.z) + t.top, o.z);
    });
    site.finish();
  },
};
