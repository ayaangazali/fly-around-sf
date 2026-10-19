import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Conservatory of Flowers',
  lat: 37.772617,
  lon: -122.460224,
  url: 'https://www.openstreetmap.org/way/30675038',
};

export const TOP = 20;

export const FACTS = {
  built: 1878,
  length: 75,
  sources: ['https://en.wikipedia.org/wiki/Conservatory_of_Flowers', 'https://www.openstreetmap.org/way/30675038'],
};

export const landmark: Landmark = {
  id: 'conservatory-of-flowers',
  exclusions: [circle(source.lat, source.lon, 30)],
  build(game: Game) {
    const site = new Site(game, 'conservatory-of-flowers', source, 0.1047);
    const white = paint('#f6f4ee');
    const pane = glow('#ffe9b8', '#cfdde0', 0.8);
    const base = paint('#d8d2c4', true);
    site.box(base, 76, 1.2, 36, 0, -0.8, 0);
    site.cyl(white, 10, 10, 7, 0, 0, 0, 16).cyl(pane, 9.6, 9.6, 6.6, 0, 0.2, 0, 16);
    site.lathe(pane, [[0, 0], [10, 0], [9.4, 3], [7.6, 5.6], [4.6, 7.4], [1.8, 8.2]], 0, 7, 0, 24);
    site.cyl(white, 2.2, 2.2, 2.2, 0, 15, 0, 8).lathe(white, [[0, 0], [2.4, 0], [1.6, 1.2], [0.3, 2.2], [0, 2.6]], 0, 17.2, 0, 12);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      site.beam(white, { x: Math.cos(a) * 10, y: 7, z: Math.sin(a) * 10 }, { x: Math.cos(a) * 1.8, y: 15.2, z: Math.sin(a) * 1.8 }, 0.3, 0.3);
    }
    const vault = new THREE.CylinderGeometry(6, 6, 1, 16, 1, false, -Math.PI / 2, Math.PI);
    for (const side of [-1, 1]) {
      site.box(white, 17, 5, 12.6, side * 18.5, 0, 0).box(pane, 16.6, 4.6, 12.2, side * 18.5, 0.2, 0);
      site.add(pane, vault.clone(), side * 18.5, 5, 0, 0, 0, Math.PI / 2, 1, 17, 1.05);
      for (let k = 0; k < 6; k++) site.add(white, new THREE.TorusGeometry(6.1, 0.12, 4, 16, Math.PI), side * (10.5 + k * 3.2), 5, 0, Math.PI / 2);
      site.box(white, 9, 7, 26, side * 31.5, 0, 0).box(pane, 8.6, 6.6, 25.6, side * 31.5, 0.2, 0);
      site.add(pane, new THREE.CylinderGeometry(0.1, 9, 5, 4, 1, false, Math.PI / 4), side * 31.5, 9.5, 0, 0, 0, 0, 0.7, 1, 2);
      site.solidBox(side * 18.5, -0.8, 0, 17, 12, 12.6).solidBox(side * 31.5, -0.8, 0, 9, 12.5, 26);
    }
    site.box(white, 8, 6, 6, 0, 0, 12).add(pane, new THREE.CylinderGeometry(4, 4, 6, 12, 1, false, -Math.PI / 2, Math.PI), 0, 6, 12, 0, Math.PI / 2, 0, 1, 1, 0.8);
    site.solidCyl(0, -0.8, 0, 10.4, 20);
    site.finish();
  },
};
