import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';
import { outward, sign, windowsAlong } from '../trail-kit';

export const source: LandmarkSource = {
  name: 'Airbnb, 888 Brannan Street',
  lat: 37.77208,
  lon: -122.40542,
  url: 'https://www.openstreetmap.org/way/224938559',
};

export const FACTS = {
  height: 19,
  floors: 5,
  sources: ['https://www.sfexaminer.com/news/airbnb-unveils-new-san-francisco-headquarters-at-888-brannan-street/article_d4e028d6-b013-5f2b-8a88-c5b0daac5e05.html', 'https://www.openstreetmap.org/way/224938559'],
};

export const TOP = 24;

const YAW = 0.7854;
export const BRANNAN_888: Pt[] = [
  [-13.5, -30], [-13.5, -17.9], [-7.5, -17.6], [-7.5, -9.1], [30.4, -8.8], [30.4, -3.1], [31.8, -3.1], [31.4, 12.1], [33.9, 11.8], [34.2, 48.2],
  [-49.9, 47.5], [-49.9, -39.5], [-13.5, -40.6],
];
const H = FACTS.height;
const BRANNAN = 9;

export const landmark: Landmark = {
  id: 'trail-airbnb',
  exclusions: [circle(37.772123, -122.405428, 6)],
  build(game: Game) {
    const site = new Site(game, 'trail-airbnb', source, YAW);
    const concrete = paint('#ddd6c8');
    const band = paint('#c9c1b1');
    const ring = BRANNAN_888;

    site.extrude(concrete, ring, -2, H + 2).extrude(paint('#7f7b75'), ring, H, 0.25);
    const [ax, az] = ring[BRANNAN];
    const [bx, bz] = ring[BRANNAN + 1];
    const n = outward(ring, BRANNAN);
    const name = sign(site, 'AIRBNB', (ax + bx) / 2 + n.x * 0.05, 12.6, (az + bz) / 2 + n.z * 0.05, Math.atan2(n.x, n.z), 5, { panel: null, ink: '#30343a', light: '#ffb4a8' });
    windowsAlong(site, ring, { floors: [0.9, 4.6, 8.3, 12, 15.6], w: 2.6, h: 2.4, step: 3.9, frame: '#8d969c', dark: '#4d606d', clear: [name] });
    for (let i = 0; i < ring.length; i++) {
      const e = outward(ring, i);
      if (e.len < 3) continue;
      const [px, pz] = ring[i];
      const [qx, qz] = ring[(i + 1) % ring.length];
      const ry = Math.atan2(e.x, e.z);
      for (const y of [4.1, 7.8, 11.5, 15.1]) site.box(band, e.len + 0.6, 0.35, 0.6, (px + qx) / 2 + e.x * 0.25, y, (pz + qz) / 2 + e.z * 0.25, ry);
      site.box(band, e.len + 0.8, 1.2, 0.6, (px + qx) / 2 + e.x * 0.25, H, (pz + qz) / 2 + e.z * 0.25, ry);
    }

    const sky = glow('#ffe7c0', '#a9c3cf', 0.7);
    const rib = paint('#d6d8da');
    for (const z of [10, 19.5, 29]) {
      site.add(sky, new THREE.CylinderGeometry(3.4, 3.4, 34, 14, 1, true, 0, Math.PI), -8, H + 0.25, z, 0, 0, Math.PI / 2);
      for (let k = -2; k <= 2; k++) site.add(rib, new THREE.TorusGeometry(3.45, 0.12, 4, 14, Math.PI), -8 + k * 8, H + 0.25, z, Math.PI / 2);
      site.box(rib, 34, 0.4, 0.6, -8, H + 0.25, z - 3.4).box(rib, 34, 0.4, 0.6, -8, H + 0.25, z + 3.4);
    }
    site.box(paint('#8d9196'), 12, 3.2, 8, 18, H + 0.25, 30);

    site.solidPrism(ring, -2, H + 3.4);
    site.finish();
  },
};
