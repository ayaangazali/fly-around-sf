import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, glow, paint, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Ghirardelli sign, Ghirardelli Square',
  lat: 37.805589,
  lon: -122.422996,
  url: 'https://www.openstreetmap.org/way/939539840',
};

export const TOP = 24;

export const FACTS = {
  signLength: 46,
  letters: 'GHIRARDELLI',
  sources: ['https://en.wikipedia.org/wiki/Ghirardelli_Square', 'https://www.openstreetmap.org/way/939539840'],
};

const FONT: Record<string, string[]> = {
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
};

export const landmark: Landmark = {
  id: 'ghirardelli-square',
  build(game: Game) {
    const yaw = Math.atan2(-(-1.9 - 1.4), 27.9 + 18.5) + Math.PI;
    const p = { x: 4.7, z: -0.4 };
    const site = new Site(game, 'ghirardelli-square', source, 0);
    let roof = -Infinity;
    for (let u = -20; u <= 20; u += 2) {
      const w = site.world(p.x + u * Math.cos(yaw), p.z - u * Math.sin(yaw));
      roof = Math.max(roof, game.world.groundAt(w.x, w.z));
    }
    const base = roof - site.y;
    const bulb = glow('#fff1c2', '#efe6cf', 1.5);
    const frame = paint('#4b4f53');
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const cell = 0.62;
    let cursor = -20.5;
    for (const ch of FACTS.letters) {
      const rows = FONT[ch];
      const wide = rows[0].length;
      for (let r = 0; r < rows.length; r++) {
        for (let k = 0; k < wide; k++) {
          if (rows[r][k] !== '1') continue;
          const u = cursor + k * cell;
          site.box(bulb, cell * 0.9, cell * 0.9, 0.35, p.x + u * c, base + 2 + (6 - r) * cell, p.z - u * s, yaw);
        }
      }
      cursor += (wide + 1) * cell;
    }
    for (let u = -21; u <= 21; u += 3.5) site.box(frame, 0.2, 7, 0.2, p.x + u * c + 0.5 * s, base, p.z - u * s + 0.5 * c, yaw);
    site.box(frame, 43, 0.3, 0.3, p.x + 0.5 * s, base + 1.7, p.z + 0.5 * c, yaw).box(frame, 43, 0.3, 0.3, p.x + 0.5 * s, base + 6.6, p.z + 0.5 * c, yaw);
    site.solidBox(p.x, base, p.z, 43, 7, 1.4, yaw);
    site.finish();
  },
};
