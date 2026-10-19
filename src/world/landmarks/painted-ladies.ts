import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, yawBetween, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Painted Ladies (Postcard Row, Steiner Street)',
  lat: 37.776262,
  lon: -122.432732,
  url: 'https://en.wikipedia.org/wiki/Painted_ladies',
};

export const TOP = 16;

export const FACTS = {
  houses: 7,
  built: '1892 to 1896',
  sources: ['https://en.wikipedia.org/wiki/Painted_ladies', 'https://data.sfgov.org/Housing-and-Buildings/Building-Footprints/ynuv-fyni'],
};

export const LOTS = [
  { lat: 37.776466, lon: -122.432803 },
  { lat: 37.77638, lon: -122.432798 },
  { lat: 37.776323, lon: -122.432786 },
  { lat: 37.776262, lon: -122.432732 },
  { lat: 37.776203, lon: -122.432713 },
  { lat: 37.776142, lon: -122.432722 },
  { lat: 37.776086, lon: -122.432678 },
];

const BODY = ['#9cc6cc', '#e9c9a0', '#c5d6a4', '#e8b9b2', '#b7c7e2', '#f0dc9c', '#c9b5d8'];
const ACCENT = ['#3e6f78', '#8f5b3a', '#5d7a3a', '#9a4f5a', '#4d5f8f', '#a57d2c', '#6c4f86'];

export const landmark: Landmark = {
  id: 'painted-ladies',
  exclusions: LOTS.map((l) => circle(l.lat, l.lon, 2.5)),
  build(game: Game) {
    const yaw = yawBetween(LOTS[LOTS.length - 1], LOTS[0]) + Math.PI;
    const site = new Site(game, 'painted-ladies', source, yaw);
    const trim = paint('#fbf7ee');
    const roof = paint('#57534f', true);
    const win = glow('#ffd79a', '#2f3740', 0.9);
    const W = 7;
    const D = 17;
    for (let i = 0; i < LOTS.length; i++) {
      const p = site.at(LOTS[i].lat, LOTS[i].lon);
      const g = site.groundAt(p.x, p.z);
      const body = paint(BODY[i]);
      const accent = paint(ACCENT[i]);
      const fx = p.x - D / 2;
      site.box(paint('#d9d3c7'), D, 1.6, W - 0.2, p.x, g - 1.2, p.z);
      site.box(body, D, 9.5, W - 0.2, p.x, g + 0.4, p.z);
      const gable = new THREE.CylinderGeometry(W / 2, W / 2, D, 3, 1, false, Math.PI / 2);
      site.add(roof, gable, p.x, g + 9.9, p.z, 0, 0, Math.PI / 2, 1.1, 1, 1.05);
      site.add(body, new THREE.CylinderGeometry(W / 2 - 0.3, W / 2 - 0.3, 0.4, 3, 1, false, Math.PI / 2), fx - 0.05, g + 9.9, p.z, 0, 0, Math.PI / 2, 1.05, 1, 1);
      site.box(accent, 0.25, 0.5, W, fx - 0.2, g + 9.6, p.z);
      site.box(body, 2.6, 6.8, 4, fx - 1.3, g + 1.8, p.z - 0.6);
      site.box(roof, 3, 0.5, 4.4, fx - 1.4, g + 8.6, p.z - 0.6);
      for (const y of [2.6, 5.8]) {
        site.box(win, 0.2, 2, 2.6, fx - 2.62, g + y, p.z - 0.6);
        site.box(win, 0.2, 2, 0.9, fx - 1.5, g + y, p.z - 2.62, Math.PI / 2);
        site.box(accent, 0.3, 0.3, 4.2, fx - 2.7, g + y + 2.1, p.z - 0.6);
      }
      site.box(win, 0.2, 2, 1.2, fx - 0.12, g + 10.6, p.z);
      site.box(accent, 0.2, 2.6, 1.2, fx - 0.12, g + 1.4, p.z + 2.2);
      for (let s = 0; s < 6; s++) site.box(trim, 1.8 - s * 0.3, 0.25, 1.4, fx - 0.9 + s * 0.05, g - 0.2 + s * 0.28, p.z + 2.2);
      for (const y of [0.4, 4.6, 8.8]) site.box(trim, 0.3, 0.35, W - 0.1, fx - 0.08, g + y, p.z);
      site.box(trim, 0.25, 9.4, 0.3, fx - 0.08, g + 0.4, p.z - W / 2 + 0.25).box(trim, 0.25, 9.4, 0.3, fx - 0.08, g + 0.4, p.z + W / 2 - 0.25);
      site.solidBox(p.x - 1, g - 1.2, p.z, D + 2, 13.6, W);
    }
    site.finish();
  },
};
