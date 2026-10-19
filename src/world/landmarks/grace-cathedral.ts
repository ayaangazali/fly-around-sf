import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Grace Cathedral',
  lat: 37.791852,
  lon: -122.413502,
  url: 'https://www.openstreetmap.org/way/32946942',
};

export const TOP = 53;

export const FACTS = {
  towerHeight: 53,
  length: 100,
  style: 'French Gothic',
  sources: ['https://en.wikipedia.org/wiki/Grace_Cathedral,_San_Francisco', 'https://www.openstreetmap.org/way/32946942'],
};

export const FOOTPRINT: Pt[] = [
  [-22.5, -18.5], [-10.0, -20.4], [-8.6, -11.6], [43.5, -19.7], [44.8, -11.6], [46.6, -11.9], [48.2, -1.7], [46.5, -1.4], [47.7, 7.0],
  [-4.3, 14.9], [-3.1, 22.6], [-16.1, 24.6], [-17.9, 12.9], [-38.3, 16.0], [-44.4, 13.4], [-46.3, 11.2], [-47.3, 8.1], [-47.1, 5.2],
  [-45.4, 1.7], [-41.1, -1.4], [-20.3, -4.7],
];
const AXIS = 0.1571;

export const landmark: Landmark = {
  id: 'grace-cathedral',
  exclusions: [circle(37.791859, -122.413591, 14)],
  build(game: Game) {
    const site = new Site(game, 'grace-cathedral', source, 0);
    const stone = glow('#ffe7c0', '#d6d0c2', 0.45);
    const roof = paint('#5f6f6c', true);
    const rose = glow('#ff9b5a', '#4a3a5a', 1.6);
    const glassMat = glow('#ffc070', '#3c4658', 1.1);
    site.extrude(stone, FOOTPRINT, -2, 26);
    const c = Math.cos(AXIS);
    const s = Math.sin(AXIS);
    const at = (u: number, v: number) => ({ x: u * c + v * s, z: -u * s + v * c });
    const gable = new THREE.CylinderGeometry(10, 10, 1, 3, 1, false, Math.PI / 2);
    const nave = at(0, 0);
    site.add(roof, gable.clone(), nave.x, 24, nave.z, AXIS, 0, Math.PI / 2, 0.9, 88, 1.05);
    const transept = at(-13, 2);
    site.add(roof, gable.clone(), transept.x, 24, transept.z, AXIS + Math.PI / 2, 0, Math.PI / 2, 0.9, 44, 0.9);
    for (const v of [-8, 8]) {
      const t = at(44, v);
      site.box(stone, 10, FACTS.towerHeight - 6, 10, t.x, -2, t.z, AXIS);
      site.box(stone, 8, 4, 8, t.x, FACTS.towerHeight - 8, t.z, AXIS);
      for (const [dx, dz] of [[-4, -4], [-4, 4], [4, -4], [4, 4]]) {
        const p = at(44 + dx, v + dz);
        site.cyl(stone, 0.7, 0.1, 6, p.x, FACTS.towerHeight - 6, p.z, 4);
      }
      for (let k = 0; k < 3; k++) {
        const w = at(48.7, v);
        site.box(glassMat, 0.3, 6, 2, w.x, 22 + k * 8, w.z, AXIS);
      }
      site.solidBox(t.x, -2, t.z, 10, FACTS.towerHeight, 10, AXIS);
    }
    const r = at(48.4, 0);
    site.add(rose, new THREE.CircleGeometry(4.4, 16), r.x, 17, r.z, AXIS + Math.PI / 2);
    const door = at(48.4, 0);
    site.box(paint('#a68437'), 0.3, 7, 4.6, door.x, -0.5, door.z, AXIS);
    for (let k = -4; k <= 4; k++) {
      for (const side of [-1, 1]) {
        const p = at(k * 9, side * 10.2);
        site.box(glassMat, 2.4, 10, 0.3, p.x, 9, p.z, AXIS);
      }
    }
    site.solidPrism(FOOTPRINT, -2, 33);
    site.finish();
  },
};
