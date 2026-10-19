import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, beacon, glow, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Alcatraz Island',
  lat: 37.826667,
  lon: -122.422778,
  url: 'https://en.wikipedia.org/wiki/Alcatraz_Island',
};

export const TOP = 27;

export const FACTS = {
  nrhpAcres: 47,
  lighthouse: 25.6,
  lighthouseBuilt: 1909,
  prisonYears: '1934 to 1963',
  sources: [
    'https://en.wikipedia.org/wiki/Alcatraz_Island',
    'https://en.wikipedia.org/wiki/Alcatraz_Island_Lighthouse',
    'https://www.openstreetmap.org/way/128245373',
    'https://www.openstreetmap.org/way/660870452',
  ],
};

interface Block {
  lat: number;
  lon: number;
  h: number;
  ring: Pt[];
  ruin?: boolean;
}

export const BUILDINGS: Record<string, Block> = {
  cellhouse: { lat: 37.826659, lon: -122.423015, h: 15, ring: [[-23.3, -12.3], [-33.0, -2.9], [0.5, 31.6], [8.5, 23.9], [20.2, 36.0], [47.7, 9.5], [14.3, -24.9], [6.8, -17.7], [-5.0, -29.9]] },
  administration: { lat: 37.826398, lon: -122.422581, h: 12, ring: [[-15.6, 4.8], [-5.3, 15.4], [19.8, -8.8], [9.5, -19.4]] },
  building64: { lat: 37.826707, lon: -122.421705, h: 13, ring: [[-26.6, -34.8], [-37.1, -20.3], [14.3, 17.1], [11.9, 29.8], [29.6, 33.3], [34.4, 9.5]] },
  industries: { lat: 37.827573, lon: -122.424737, h: 9, ring: [[-24.1, -25.5], [-6.4, -35.3], [38.9, 46.0], [21.2, 55.8]] },
  dining: { lat: 37.82703, lon: -122.423454, h: 11, ring: [[15.5, 28.8], [29.9, 14.9], [-1.3, -17.3], [-3.7, -14.9], [-8.8, -20.1], [-18.2, -11.1], [-13.1, -5.8], [-15.8, -3.3]] },
  powerhouse: { lat: 37.828197, lon: -122.424592, h: 8, ring: [[-7.8, 11.2], [17.9, 10.4], [21.0, 0.9], [20.8, -4.3], [6.2, -3.8], [5.9, -14.3], [-1.2, -14.1], [-0.9, -4.7], [-8.4, -4.4], [-8.4, -2.3], [-23.1, -1.9], [-22.8, 10.4], [-7.9, 9.9]] },
  quartermaster: { lat: 37.828088, lon: -122.424142, h: 8, ring: [[-5.9, -12.3], [-13.4, -2.8], [12.8, 17.7], [20.3, 8.1]] },
  sallyPort: { lat: 37.827226, lon: -122.422307, h: 7, ring: [[-7.3, -13.8], [3.1, -6.9], [0.5, -2.9], [9.7, 3.2], [3.8, 11.3], [-15.6, -1.6]] },
  wardensHouse: { lat: 37.826316, lon: -122.421914, h: 6, ring: [[-10.8, -2.8], [-0.3, 9.9], [3.7, 6.6], [4.9, 8.0], [9.7, 4.0], [1.8, -5.5], [2.9, -6.4], [-1.0, -11.0]], ruin: true },
};
export const COAST: Pt[] = [
  [71.1, -59.1], [9.6, -90.1], [-30.0, -131.3], [-41.4, -147.1], [-68.5, -159.3], [-90.6, -159.7], [-123.3, -187.8], [-133.1, -187.8], [-144.6, -182.4],
  [-162.6, -187.8], [-178.5, -184.0], [-186.1, -189.3], [-193.6, -187.8], [-204.2, -190.8], [-214.0, -184.0], [-220.1, -188.5], [-235.2, -184.0],
  [-245.8, -175.8], [-249.6, -167.3], [-250.0, -152.7], [-243.8, -142.8], [-245.2, -135.1], [-224.4, -123.4], [-219.0, -126.8], [-212.5, -122.3],
  [-198.9, -101.2], [-199.1, -94.2], [-181.6, -50.0], [-166.9, -31.7], [-148.6, -23.6], [-157.7, -2.2], [-154.4, 3.7], [-142.4, 12.7], [-129.8, 9.1],
  [-109.7, 19.9], [-94.1, 15.4], [-83.9, 29.0], [-87.0, 56.0], [-81.7, 64.3], [-50.7, 79.4], [-43.9, 86.9], [-18.9, 93.7], [-0.8, 105.0], [6.2, 128.5],
  [28.7, 135.1], [92.8, 175.5], [139.1, 173.3], [141.2, 175.6], [180.6, 159.4], [196.7, 137.6], [210.9, 103.7], [202.7, 61.0], [167.5, 22.7],
  [170.0, 19.8], [150.9, 0.9], [159.5, -10.3], [121.3, -41.7], [114.5, -32.2], [86.2, -51.3], [81.3, -44.5], [76.4, -47.8],
];
const LIGHTHOUSE = { lat: 37.826254, lon: -122.422296 };
const WATER_TOWER = { lat: 37.827573, lon: -122.423935 };
const CHIMNEY = { lat: 37.828261, lon: -122.424414 };

export const landmark: Landmark = {
  id: 'alcatraz',
  build(game: Game) {
    const site = new Site(game, 'alcatraz', source, 0);
    const concrete = glow('#ffd59a', '#d3cab7', 0.25);
    const ruin = paint('#a39886', true);
    const roof = paint('#7d7a73');
    const white = paint('#f1efe8');
    const rust = paint('#8c6a4f');

    for (const b of Object.values(BUILDINGS)) {
      const o = site.at(b.lat, b.lon);
      const ring: Pt[] = b.ring.map(([x, z]) => [x + o.x, z + o.z]);
      let g = Infinity;
      for (const [x, z] of ring) g = Math.min(g, site.groundAt(x, z));
      const base = Math.max(-1, g) - 3;
      const top = Math.max(...ring.map(([x, z]) => site.groundAt(x, z))) + b.h;
      site.extrude(b.ruin ? ruin : concrete, ring, base, top - base);
      if (!b.ruin) site.extrude(roof, ring, top, 0.6);
      site.solidPrism(ring, base, top - base + 0.6);
    }

    const rock = paint('#8b8376', true, true);
    let cx = 0;
    let cz = 0;
    for (const [x, z] of COAST) {
      cx += x / COAST.length;
      cz += z / COAST.length;
    }
    const cliffTop = COAST.map(([x, z]) => {
      const d = Math.hypot(cx - x, cz - z) || 1;
      return Math.max(3 - site.y, site.groundAt(x + ((cx - x) / d) * 14, z + ((cz - z) / d) * 14)) + 1;
    });
    const pos: number[] = [];
    for (let i = 0; i < COAST.length; i++) {
      const j = (i + 1) % COAST.length;
      const [ax, az] = COAST[i];
      const [bx, bz] = COAST[j];
      const lo = -site.y - 3;
      pos.push(ax, lo, az, bx, lo, bz, bx, cliffTop[j], bz, ax, lo, az, bx, cliffTop[j], bz, ax, cliffTop[i], az);
    }
    const cliff = new THREE.BufferGeometry();
    cliff.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cliff.computeVertexNormals();
    site.add(rock, cliff);

    const cell = BUILDINGS.cellhouse;
    const co = site.at(cell.lat, cell.lon);
    const cellTop = site.groundAt(co.x, co.z) + cell.h + 0.6;
    for (let k = -3; k <= 3; k++) site.box(paint('#9aa3a8'), 4, 1.4, 22, co.x + k * 6 * 0.71, cellTop, co.z + k * 6 * 0.71, Math.PI / 4);

    const lh = site.at(LIGHTHOUSE.lat, LIGHTHOUSE.lon);
    const lg = site.groundAt(lh.x, lh.z);
    site.cyl(white, 4.4, 3.2, FACTS.lighthouse - 5, lh.x, lg, lh.z, 8);
    site.cyl(paint('#2c2f33'), 2.4, 2.4, 0.6, lh.x, lg + FACTS.lighthouse - 5, lh.z, 8);
    site.cyl(glow('#fff7d6', '#e9e4cf', 1.2), 1.7, 1.7, 2.6, lh.x, lg + FACTS.lighthouse - 4.4, lh.z, 8);
    site.cyl(paint('#2c2f33'), 2, 0.3, 1.8, lh.x, lg + FACTS.lighthouse - 1.8, lh.z, 8);
    site.box(beacon('#fffbe0', 5), 1.2, 1.2, 1.2, lh.x, lg + FACTS.lighthouse - 3.6, lh.z);
    site.solidCyl(lh.x, lg, lh.z, 3, FACTS.lighthouse);

    const wt = site.at(WATER_TOWER.lat, WATER_TOWER.lon);
    const wg = site.groundAt(wt.x, wt.z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      site.beam(rust, { x: wt.x + Math.cos(a) * 6.4, y: wg, z: wt.z + Math.sin(a) * 6.4 }, { x: wt.x + Math.cos(a) * 5.2, y: wg + 20, z: wt.z + Math.sin(a) * 5.2 }, 0.6, 0.6);
    }
    site.cyl(paint('#c9c2b2'), 6, 6, 10, wt.x, wg + 20, wt.z, 16);
    site.cyl(paint('#b5503f'), 6.05, 6.05, 1.2, wt.x, wg + 25, wt.z, 16);
    site.cyl(paint('#c9c2b2'), 6.2, 0.6, 3, wt.x, wg + 30, wt.z, 16);
    site.solidCyl(wt.x, wg, wt.z, 6.5, 33);

    const ch = site.at(CHIMNEY.lat, CHIMNEY.lon);
    const cg = site.groundAt(ch.x, ch.z);
    site.cyl(paint('#b6a690'), 2, 1.5, 32, ch.x, cg, ch.z, 12).solidCyl(ch.x, cg, ch.z, 2.2, 32);
    site.finish();
  },
};
