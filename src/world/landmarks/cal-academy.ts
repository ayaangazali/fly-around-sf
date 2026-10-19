import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glass, paint, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'California Academy of Sciences',
  lat: 37.769827,
  lon: -122.466091,
  url: 'https://www.openstreetmap.org/way/28695389',
};

export const TOP = 25;

export const FACTS = {
  roofAcres: 2.5,
  roofPlants: 1700000,
  opened: 2008,
  architect: 'Renzo Piano',
  sources: ['https://en.wikipedia.org/wiki/California_Academy_of_Sciences', 'https://www.openstreetmap.org/way/28695389'],
};

const L = 161.2;
const W = 103.2;
const H = 11;
export const HILLS: [number, number, number, number][] = [
  [-38, 0, 24, 13],
  [38, 0, 24, 13],
  [-5, -32, 13, 6],
  [-5, 32, 13, 6],
  [-68, -30, 11, 5],
  [66, 30, 12, 5],
  [10, 0, 10, 4],
];

export const landmark: Landmark = {
  id: 'cal-academy',
  exclusions: [circle(37.769759, -122.465904, 22)],
  build(game: Game) {
    const site = new Site(game, 'cal-academy', source, 0.733);
    const sod = paint('#79a04f', true);
    const flowers = paint('#b8c46a', true);
    const edge = paint('#e8e6e0');
    const portal = paint('#2e3a42');
    site.box(glass('#8fb0c0'), L - 6, H - 1, W - 6, 0, -1, 0);
    site.box(edge, L + 8, 0.8, W + 8, 0, H - 1, 0);
    site.box(sod, L, 0.6, W, 0, H - 0.2, 0);
    for (let c = -14; c <= 14; c++) site.box(paint('#cfcbc2'), 0.3, H - 1, 0.3, (c * (L + 6)) / 28, -1, W / 2 + 3.5);
    const dome = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const [x, z, r, h] of HILLS) {
      site.add(sod, dome.clone(), x, H + 0.3, z, 0, 0, 0, r, h, r);
      site.add(flowers, dome.clone(), x, H + 0.35, z, 0.4, 0, 0, r * 0.7, h * 1.02, r * 0.55);
      const n = Math.round(r / 2);
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const rr = r * 0.55;
        const y = h * Math.sqrt(Math.max(0, 1 - 0.55 * 0.55));
        site.cyl(portal, 0.9, 0.9, 0.3, x + Math.cos(a) * rr, H + 0.3 + y - 0.1, z + Math.sin(a) * rr, 10);
      }
      site.solidCyl(x, H, z, r * 0.8, h);
    }
    site.solidBox(0, -1, 0, L + 8, H + 0.6, W + 8);
    site.finish();
  },
};
