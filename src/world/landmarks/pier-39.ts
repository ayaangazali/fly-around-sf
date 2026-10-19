import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Pier 39 sea lion docks (K-Dock)',
  lat: 37.810636,
  lon: -122.41158,
  url: 'https://www.openstreetmap.org/node/1417635914',
};

export const FACTS = {
  arrived: 1990,
  floats: 43,
  sources: ['https://en.wikipedia.org/wiki/Pier_39', 'https://www.openstreetmap.org/way/1103154712', 'https://www.openstreetmap.org/way/23605142'],
};

export const FLOATS: Pt[] = [
  [-11.3, 21.6], [-15.1, 23.6], [-7.6, 20.1], [-4.0, 18.4], [-1.1, 16.9], [2.5, 15.0], [5.9, 13.6], [3.0, 7.1], [0.3, 8.6], [-3.1, 10.6],
  [-6.6, 12.3], [-9.8, 13.9], [-13.3, 15.3], [-16.7, 16.7], [-20.5, 10.6], [-15.0, 8.5], [-11.6, 7.4], [-8.5, 5.8], [-5.4, 3.8], [-1.6, 2.1],
  [1.3, 0.1], [-0.7, -6.8], [-4.6, -5.4], [-8.1, -3.1], [-11.5, -1.4], [-14.9, -0.4], [-18.4, 1.1], [-15.1, -7.8], [-12.2, -9.7], [-7.4, -12.7],
  [-2.2, -15.5], [2.6, -19.0], [6.4, -21.6], [10.2, -24.4], [12.8, -16.9], [16.0, -9.7], [13.2, -8.4], [16.5, -1.4], [19.9, -2.7], [13.4, 1.5],
  [16.1, 7.7], [19.7, 5.6], [24.6, 4.3],
];
const FLOAT_YAW = 2.13;

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const landmark: Landmark = {
  id: 'pier-39',
  build(game: Game) {
    const site = new Site(game, 'pier-39', source, 0, 0);
    const deck = paint('#8d8a83', true);
    const lion = [paint('#5a4232', true), paint('#6e523d', true), paint('#46352a', true)];
    const rand = rng(1990);
    const body = new THREE.CapsuleGeometry(0.45, 1.5, 2, 6).rotateZ(Math.PI / 2);

    for (const [x, z] of FLOATS) {
      site.box(deck, 6.2, 0.5, 2.9, x, 0.1, z, FLOAT_YAW);
      const pups = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < pups; k++) {
        const t = (rand() - 0.5) * 4.2;
        const u = (rand() - 0.5) * 1.6;
        const c = Math.cos(FLOAT_YAW);
        const s = Math.sin(FLOAT_YAW);
        const lx = x + t * c + u * s;
        const lz = z - t * s + u * c;
        site.add(lion[k % 3], body.clone(), lx, 1.05, lz, FLOAT_YAW + (rand() - 0.5) * 1.2, 0, (rand() - 0.5) * 0.4, 1, 0.8, 1);
        if (rand() > 0.6) site.add(lion[(k + 1) % 3], new THREE.SphereGeometry(0.35, 6, 4), lx + 0.9 * c, 1.5, lz - 0.9 * s);
      }
      site.solidBox(x, -0.5, z, 6.2, 1.6, 2.9, FLOAT_YAW);
    }

    site.finish();
  },
};
