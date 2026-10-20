import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';
import { outward, sign, windowsAlong } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'Corgi, W. & J. Sloane Building, 222 Sutter Street',
  lat: 37.79012,
  lon: -122.40457,
  url: 'https://www.openstreetmap.org/way/260280326',
};

export const FACTS = {
  height: 42.1,
  floors: 8,
  sources: ['https://sf.gazetteer.co/come-for-the-all-night-coffee-stay-for-the-ai-insurance', 'https://www.sgh.com/project/222-sutter-street/', 'https://www.openstreetmap.org/way/260280326'],
};

export const TOP = 53;

const YAW = 0.1688;
export const SLOANE: Pt[] = [[-5.3, -14], [2.3, -14.2], [21.5, -13.9], [21.5, 30.7], [-13.4, 30.3], [-12.9, -5.6], [-12.8, -6.1], [-5.7, -5.9]];
const H = FACTS.height;
const SUTTER = 3;
const CLAUDE = 2;

export const landmark: Landmark = {
  id: 'trail-corgi',
  exclusions: [circle(37.790118, -122.404576, 6)],
  build(game: Game) {
    const site = new Site(game, 'trail-corgi', source, YAW);
    const terra = glow('#ffe7c4', '#e4d5b6', 0.12);
    const trim = paint('#cdb991');
    const bronze = paint('#5a4632');
    const shop = glow('#ffd59a', '#2c3238', 1.1);

    site.extrude(terra, SLOANE, -2, H + 2).extrude(paint('#7d7a74'), SLOANE, H, 0.25);
    const cafe = sign(site, 'CORGI', 21.5 + 1.1, 6.6, 18, Math.PI / 2, 1.8, { panel: '#2a2420', ink: '#fff4e2', light: '#ffd27a' });
    windowsAlong(site, SLOANE, { floors: [9, 12.7, 16.4, 20.1, 23.8, 27.5, 31.2], w: 2, h: 2.5, step: 3.4, frame: '#c4ae86', dark: '#2f3a42', clear: [cafe] });
    windowsAlong(site, SLOANE, { floors: [35], w: 1.6, h: 3.6, step: 2.4, frame: '#c4ae86', dark: '#2f3a42' });

    for (const edge of [SUTTER, CLAUDE]) {
      const [ax, az] = SLOANE[edge];
      const [bx, bz] = SLOANE[(edge + 1) % SLOANE.length];
      const n = outward(SLOANE, edge);
      const ry = Math.atan2(n.x, n.z);
      const at = (t: number, off: number) => [ax + (bx - ax) * t + n.x * off, az + (bz - az) * t + n.z * off] as const;
      const count = Math.floor((n.len - 1) / 3.4);
      for (let j = 0; j <= count; j++) {
        const [x, z] = at(j / count, 0.35);
        site.box(trim, 0.8, H - 8.2, 0.7, x, 8, z, ry);
      }
      for (let j = 0; j < count; j++) {
        const [x, z] = at((j + 0.5) / count, 0.3);
        site.box(j % 3 === 1 ? shop : glow('#ffe3b4', '#38424a', 0.4), (n.len / count) * 0.82, 5.6, 0.4, x, 0.4, z, ry);
        site.box(bronze, (n.len / count) * 0.9, 0.4, 0.6, x, 6, z, ry);
      }
      const [mx, mz] = at(0.5, 0.6);
      site.box(trim, n.len + 1.6, 1.2, 1.4, mx, H - 1.6, mz, ry).box(trim, n.len + 0.6, 0.8, 0.9, mx, 7.2, mz, ry);
      for (let j = 0; j <= count * 2; j++) {
        const [x, z] = at(j / (count * 2), 0.2);
        site.box(terra, 0.9, 1.4, 0.6, x, H, z, ry);
      }
    }

    const roof = sign(site, 'CORGI', 4, H + 1.2 + 4.4, 26.5, 0, 5, { panel: '#24201d', ink: '#fff4e2', light: '#ffd27a', accent: '#e8b04a' });
    for (const s of [-1, 0, 1]) site.box(paint('#3a3f44'), 0.5, 1.4, 2.4, roof.x + (s * roof.w) / 3, H, roof.z - 0.9);

    site.solidPrism(SLOANE, -2, H + 2).solidBox(roof.x, H, roof.z, roof.w, roof.h + 1.2, 1.4);
    site.finish();
  },
};
