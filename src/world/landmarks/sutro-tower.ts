import type { Landmark } from '../world';
import type { Game } from '../../game';
import type { Vec3 } from '../../player/flight';
import { Site, beacon, circle, paint, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Sutro Tower',
  lat: 37.75523,
  lon: -122.45284,
  url: 'https://en.wikipedia.org/wiki/Sutro_Tower',
};

export const TOP = 299;

export const FACTS = {
  height: 297.8,
  baseElevation: 254.2,
  baseSide: 45.7,
  waistSide: 18.3,
  antennaSide: 30.5,
  observatory: 228.8,
  platform: 232,
  completed: 1973,
  sources: ['https://en.wikipedia.org/wiki/Sutro_Tower', 'https://www.sutrotower.com/about'],
};

const WAIST = 165;
const R = (side: number) => side / Math.sqrt(3);

export const landmark: Landmark = {
  id: 'sutro-tower',
  exclusions: [circle(source.lat, source.lon, 32)],
  build(game: Game) {
    const site = new Site(game, 'sutro-tower', source, 0.35);
    const red = paint('#c43a2c');
    const white = paint('#f1efea');
    const steel = paint('#9b9ea2');
    const blink = beacon('#ff2a1a', 1.4);

    const radius = (y: number) => {
      if (y <= WAIST) return R(FACTS.baseSide) + (R(FACTS.waistSide) - R(FACTS.baseSide)) * Math.sin(((y / WAIST) * Math.PI) / 2);
      if (y <= FACTS.platform) return R(FACTS.waistSide) + ((R(FACTS.antennaSide) - R(FACTS.waistSide)) * (y - WAIST)) / (FACTS.platform - WAIST);
      return R(FACTS.antennaSide);
    };
    const leg = (k: number, y: number): Vec3 => {
      const a = (k * 2 * Math.PI) / 3;
      const r = radius(y);
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
    };
    const band = (y: number) => (Math.floor((y / FACTS.height) * 7) % 2 === 0 ? red : white);

    const levels = [0, 20, 42, 66, 92, 118, 142, WAIST, 190, 212, FACTS.platform];
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < levels.length - 1; i++) {
        const a = leg(k, levels[i]);
        const b = leg(k, levels[i + 1]);
        const mid = (levels[i] + levels[i + 1]) / 2;
        site.beam(band(mid), a, b, 2.6, 2.6);
        site.solidBeam(a, b, 3.4, 4);
      }
      for (const y of levels.slice(1)) {
        const a = leg(k, y);
        const b = leg((k + 1) % 3, y);
        site.beam(band(y), a, b, 0.9, 1.2);
        site.solidBeam(a, b, 1.6, 2);
      }
      for (let i = 0; i < levels.length - 1; i++) {
        const a = leg(k, levels[i]);
        const b = leg((k + 1) % 3, levels[i + 1]);
        site.beam(steel, a, b, 0.4, 0.4);
        site.beam(steel, leg((k + 1) % 3, levels[i]), leg(k, levels[i + 1]), 0.4, 0.4);
      }
      for (const [y, reach] of [
        [WAIST, 22],
        [FACTS.platform, 26],
      ]) {
        const a = (k * 2 * Math.PI) / 3;
        const o = { x: Math.cos(a) * reach, y, z: Math.sin(a) * reach };
        const c = leg(k, y);
        site.beam(red, { x: -o.x * 0.15, y, z: -o.z * 0.15 }, o, 1.6, 2.2);
        site.beam(white, { ...o, y: y - 6 }, c, 0.7, 0.7);
        site.solidBeam({ x: 0, y, z: 0 }, o, 2.4, 3);
        site.cyl(white, 0.7, 0.5, 9, o.x, y, o.z, 8).box(blink, 0.8, 0.8, 0.8, o.x, y + 9, o.z);
      }
      const top = leg(k, FACTS.platform);
      site.cyl(band(FACTS.platform + 20), 1.3, 0.9, 40, top.x, FACTS.platform, top.z, 10);
      site.cyl(white, 0.9, 0.35, FACTS.height - FACTS.platform - 40, top.x, FACTS.platform + 40, top.z, 8);
      site.box(blink, 1, 1, 1, top.x, FACTS.height, top.z);
      site.solidCyl(top.x, FACTS.platform, top.z, 1.8, FACTS.height - FACTS.platform);
      site.box(paint('#8f8b84', true), 7, 4, 7, leg(k, 0).x, -2, leg(k, 0).z);
    }
    site.cyl(paint('#d6d3cc'), R(FACTS.antennaSide) + 3, R(FACTS.antennaSide) + 3, 2, 0, FACTS.platform - 2, 0, 3);
    site.solidCyl(0, FACTS.platform - 2, 0, R(FACTS.antennaSide) + 2, 3);
    site.finish();
  },
};
