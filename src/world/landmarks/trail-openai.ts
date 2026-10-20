import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, glow, paint, type LandmarkSource } from '../landmark-kit';
import { facet, sign } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'OpenAI, 1455 Third Street, Mission Bay',
  lat: 37.77,
  lon: -122.38874,
  url: 'https://www.openstreetmap.org/way/1047709621',
};

export const FACTS = {
  height: 53.7,
  south: 31.9,
  sources: ['https://sfstandard.com/2023/10/27/openai-uber-headquarters-mission-bay/', 'https://www.worldconstructionnetwork.com/projects/uber-headquarters-san-francisco/', 'https://www.openstreetmap.org/way/1047709621', 'https://www.openstreetmap.org/way/1047709622'],
};

export const TOP = 59;

const YAW = -1.4933;
const TOWER = { x0: -19.7, x1: 10, z0: -32.9, z1: 40.8, h: FACTS.height, floor: 4.9 };
const SOUTH = { x0: 31.6, x1: 115.2, z0: -4, z1: 41.4, h: FACTS.south, floor: 4.5 };

export const landmark: Landmark = {
  id: 'trail-openai',
  build(game: Game) {
    const site = new Site(game, 'trail-openai', source, YAW);
    const slab = paint('#e3e6e8');
    const bridge = glow('#fff3dc', '#cfe2ea', 0.6);

    for (const b of [TOWER, SOUTH]) {
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      const x = (b.x0 + b.x1) / 2;
      const z = (b.z0 + b.z1) / 2;
      site.windows('#bcd4df', new THREE.BoxGeometry(w, b.h + 2, d), x, (b.h + 2) / 2 - 2, z);
      for (let y = b.floor; y < b.h; y += b.floor) site.box(slab, w + 0.6, 0.45, d + 0.6, x, y, z);
      site.box(slab, w + 1, 1.2, d + 1, x, b.h, z).box(paint('#8f969b'), w * 0.4, 3.4, d * 0.3, x, b.h + 1.2, z - d * 0.15);
      for (let k = 0; k <= 8; k++) {
        const fz = b.z0 + (d * k) / 8;
        for (const fx of [b.x0 - 0.3, b.x1 + 0.3]) site.box(slab, 0.5, b.h - 4, 0.5, fx, 4, fz);
      }
      site.solidBox(x, -2, z, w, b.h + 3.6, d);
    }

    const gap = { x0: TOWER.x1 + 0.3, x1: SOUTH.x0 - 0.3 };
    [[14, 8, 28], [21, 26, 4], [28, 6, 30], [35, 24, 10]].forEach(([y, za, zb]) => {
      const a = { x: gap.x0, y, z: za };
      const b = { x: gap.x1, y, z: zb };
      site.beam(bridge, a, b, 3.4, 3).beam(slab, { ...a, y: y - 1.7 }, { ...b, y: y - 1.7 }, 3.8, 0.5);
      site.solidBeam({ ...a, y: y + 1.5 }, { ...b, y: y + 1.5 }, 3.6, 3.2);
    });

    const leaf = paint('#4b7a3c');
    for (let i = 0; i < 6; i++) {
      const z = -1 + i * 7.6;
      const x = (gap.x0 + gap.x1) / 2 + (i % 2 ? 3 : -3);
      site.cyl(paint('#5b4636'), 0.25, 0.2, 3, x, 0, z, 6).add(leaf, facet(new THREE.IcosahedronGeometry(2.2, 0)), x, 4.6, z);
    }

    sign(site, 'OPENAI', (TOWER.x0 + TOWER.x1) / 2, TOWER.h - 6, TOWER.z1 + 0.4, 0, 4.5, { panel: '#15191c', ink: '#f4f6f7', light: '#ffffff' });
    site.solidBox((TOWER.x0 + TOWER.x1) / 2, TOWER.h - 10, TOWER.z1 + 0.6, 26, 8, 1.2);
    site.finish();
  },
};
