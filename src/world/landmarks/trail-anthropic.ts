import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, paint, prism, type LandmarkSource, type Pt } from '../landmark-kit';
import { facet, outward, sign } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'Anthropic, Foundry Square IV, 500 Howard Street',
  lat: 37.78846,
  lon: -122.39675,
  url: 'https://www.openstreetmap.org/way/113505811',
};

export const FACTS = {
  height: 46.1,
  floors: 10,
  completed: 2003,
  sources: ['https://en.wikipedia.org/wiki/Foundry_Square', 'https://www.connectcre.com/stories/ai-company-anthropic-subleases-former-slack-headquarters-building/', 'https://www.openstreetmap.org/way/113505811'],
};

export const TOP = 52;

const YAW = 0.7727;
export const FOUNDRY_IV: Pt[] = [
  [35, -1.7], [38.5, -1.7], [39, 12.8], [27, 12.9], [27.2, 26.4], [-17.7, 25.9], [-18.8, 25.5], [-18.8, 24.8], [-18.8, 21.3], [-20.3, 21.3],
  [-20.9, -0.3], [-24.4, -0.2], [-25, -19.6], [-21.5, -19.7], [-21.5, -21.1], [34.4, -21.1],
];
const H = FACTS.height;
const HOWARD = 4;

export const landmark: Landmark = {
  id: 'trail-anthropic',
  exclusions: [circle(37.788423, -122.396711, 6)],
  build(game: Game) {
    const site = new Site(game, 'trail-anthropic', source, YAW);
    const frame = paint('#d9dde0');
    const ring = FOUNDRY_IV;

    site.windows('#9db4c3', prism(ring, -2, H + 2));
    site.extrude(paint('#8d9296'), ring, H, 0.3);
    for (let i = 0; i < ring.length; i++) {
      const e = outward(ring, i);
      if (e.len < 3) continue;
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const ry = Math.atan2(e.x, e.z);
      const at = (t: number, off: number) => [ax + (bx - ax) * t + e.x * off, az + (bz - az) * t + e.z * off] as const;
      const [px, pz] = at(0.5, 0.35);
      const [qx, qz] = at(0.5, 0.25);
      site.box(frame, e.len + 0.8, 1.6, 0.8, px, H, pz, ry).box(paint('#3b4248'), e.len + 0.4, 4.6, 0.5, qx, -0.3, qz, ry);
      for (let y = 8.8; y < H - 2; y += 4.2) site.box(frame, e.len, 0.35, 0.5, qx, y, qz, ry);
      const fins = Math.floor(e.len / 4.5);
      for (let j = 1; j < fins; j++) {
        const [fx, fz] = at(j / fins, 0.3);
        site.box(frame, 0.35, H - 4.4, 0.7, fx, 4.3, fz, ry);
      }
    }
    site.box(paint('#7c8186'), 18, 5, 12, 2, H + 0.3, -4).box(paint('#9aa0a5'), 10, 3, 8, -12, H + 0.3, 8);

    const leaf = paint('#4f7d3e');
    const bark = paint('#5a4636');
    const planter = paint('#b9b2a5');
    for (const [x, z, s] of [[30, 16, 1], [35, 21, 1.15], [31, 23.5, 0.9], [37, 15.5, 0.85], [42, 24, 1], [33, 30, 1.1], [24, 31, 0.9], [44, 18, 0.95]]) {
      site.box(planter, 3.4 * s, 1, 3.4 * s, x, 0, z).cyl(bark, 0.25, 0.2, 3.2 * s, x, 1, z, 6);
      site.add(leaf, facet(new THREE.IcosahedronGeometry(2.4 * s, 0)), x, 1 + 4.2 * s, z);
    }

    const [ax, az] = ring[HOWARD];
    const [bx, bz] = ring[HOWARD + 1];
    const n = outward(ring, HOWARD);
    const name = sign(site, 'ANTHROPIC', (ax + bx) / 2 + n.x * 0.8, H - 4.4, (az + bz) / 2 + n.z * 0.8, Math.atan2(n.x, n.z), 4.5, { panel: '#1f1e1c', ink: '#f2eee6', light: '#fff1d8', accent: '#d97a55' });

    site.solidPrism(ring, -2, H + 2.3).solidBox(name.x, name.y - name.h / 2, name.z, name.w, name.h, 1.2, name.ry);
    site.finish();
  },
};
