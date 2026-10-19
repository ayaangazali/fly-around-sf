import * as THREE from 'three';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, inside, paint, type LandmarkSource, type Pt } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'Oracle Park',
  lat: 37.778628,
  lon: -122.389799,
  url: 'https://www.openstreetmap.org/relation/7325085',
};

export const FACTS = {
  opened: 2000,
  bottle: 24.4,
  rightFieldWall: 7.3,
  leftField: 103,
  sources: [
    'https://en.wikipedia.org/wiki/Oracle_Park',
    'https://ktvu.com/news/oracle-park-coca-cola-bottle-slide-sf-giants-changes',
    'https://www.mlb.com/news/featured/oracle-park-guide-capacity-seating-chart-parking-and-more',
    'https://www.openstreetmap.org/relation/7325085',
  ],
};

const OUTER: Pt[] = [
  [5.9, 120.6], [-54.8, 74.6], [-65.9, 63.3], [-71.1, 53.0], [-72.6, 40.2], [-85.3, 26.2], [-93.4, 35.0], [-103.5, 25.9], [45.1, -124.6],
  [81.3, -90.2], [69.7, -79.0], [137.3, -12.3], [142.1, 49.6],
];
const FIELD: Pt[] = [
  [-19.1, 29.0], [-17.5, 34.4], [-8.1, 43.3], [35.7, 73.1], [51.9, 74.9], [61.0, 82.1], [106.7, 58.5], [101.4, -1.8], [60.6, -42.4],
  [57.7, -43.4], [53.6, -38.6], [18.1, -12.4], [4.5, -0.1], [-16.8, 22.8],
];
const INFIELD: Pt[] = [
  [37.9, 25.1], [35.4, 15.8], [29.9, 7.8], [22.5, 2.1], [13.8, -1.0], [-8.4, 25.5], [-12.7, 27.0], [-13.4, 30.1], [-11.4, 32.8], [-7.8, 32.9],
  [18.8, 55.1], [27.2, 50.4], [33.5, 43.4], [37.1, 34.8],
];
const HOME = { x: -11.6, z: 30.4 };
const FAN_LOT = { x: 78, z: -92 };

export const landmark: Landmark = {
  id: 'oracle-park',
  exclusions: [circle(37.778451, -122.389588, 30)],
  build(game: Game) {
    const site = new Site(game, 'oracle-park', source, 0);
    const brick = glow('#ffd9a6', '#9a5b3e', 0.25);
    const seats = paint('#2f5a49', true, true);
    const concrete = paint('#cfcac0', false, true);
    const grass = paint('#4f9a45');
    const dirt = paint('#b98a5a');
    const white = paint('#f4f2ec');
    const outer = OUTER.map(([x, z]) => ({ x, z }));

    site.extrude(grass, FIELD, -0.3, 0.6).extrude(dirt, INFIELD, -0.2, 0.55);
    const first = { x: 0.829, z: 0.559 };
    const third = { x: 0.712, z: -0.702 };
    const base = 27.43;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) site.box(white, 0.6, 0.15, 0.6, HOME.x + base * (u * first.x + v * third.x), 0.35, HOME.z + base * (u * first.z + v * third.z));
    const m = Math.hypot(first.x + third.x, first.z + third.z);
    site.cyl(dirt, 2.8, 2.4, 0.5, HOME.x + (18.44 * (first.x + third.x)) / m, 0.3, HOME.z + (18.44 * (first.z + third.z)) / m, 12);

    const n = FIELD.length;
    let area = 0;
    for (let i = 0; i < n; i++) area += FIELD[i][0] * FIELD[(i + 1) % n][1] - FIELD[(i + 1) % n][0] * FIELD[i][1];
    const sign = Math.sign(area);
    const normal = (i: number) => {
      const [ax, az] = FIELD[(i + n - 1) % n];
      const [bx, bz] = FIELD[i];
      const [cx, cz] = FIELD[(i + 1) % n];
      const l1 = Math.hypot(bx - ax, bz - az);
      const l2 = Math.hypot(cx - bx, cz - bz);
      const nx = ((bz - az) / l1 + (cz - bz) / l2) * sign;
      const nz = (-(bx - ax) / l1 - (cx - bx) / l2) * sign;
      const l = Math.hypot(nx, nz) || 1;
      return { x: nx / l, z: nz / l };
    };
    const ring = (d: number) => FIELD.map(([x, z], i) => ({ x: x + normal(i).x * d, z: z + normal(i).z * d }));
    for (let k = 0; k < 10; k++) {
      const r0 = ring(3 + k * 4.2);
      const r1 = ring(3 + (k + 1) * 4.2);
      const y = 1.2 + k * 2.6;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const far = Math.hypot(FIELD[i][0] - HOME.x, FIELD[i][1] - HOME.z) > 80 && Math.hypot(FIELD[j][0] - HOME.x, FIELD[j][1] - HOME.z) > 80;
        if (far && k > 2) continue;
        const quad = [r0[i], r0[j], r1[j], r1[i]];
        if (!quad.every((q) => inside(outer, q.x, q.z))) continue;
        const g = new THREE.BufferGeometry();
        const v = (q: { x: number; z: number }, h: number) => [q.x, h, q.z];
        g.setAttribute('position', new THREE.Float32BufferAttribute([...v(quad[0], y), ...v(quad[2], y + 2.6), ...v(quad[1], y), ...v(quad[0], y), ...v(quad[3], y + 2.6), ...v(quad[2], y + 2.6)], 3));
        g.computeVertexNormals();
        site.add(k === 4 ? concrete : seats, g);
      }
    }

    for (let i = 0; i < OUTER.length; i++) {
      const [ax, az] = OUTER[i];
      const [bx, bz] = OUTER[(i + 1) % OUTER.length];
      const cove = i === 11 || i === 12;
      const outfield = i >= 8 && i <= 10;
      const h = cove ? FACTS.rightFieldWall : outfield ? 12 : 24;
      const len = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(-(bz - az), bx - ax);
      site.box(brick, len + 3, h, 3, (ax + bx) / 2, -1, (az + bz) / 2, ry);
      if (!cove) site.box(concrete, len + 3, 1.2, 6, (ax + bx) / 2, h - 1, (az + bz) / 2, ry);
      site.solidBox((ax + bx) / 2, -1, (az + bz) / 2, len + 3, h + 1, 3.5, ry);
    }

    const lights = glow('#fffbe8', '#d8d8d4', 2.2);
    for (const [x, z] of [
      [-60, 20], [-30, 75], [20, 105], [-40, -10], [10, -70], [60, -100],
    ]) {
      site.box(concrete, 1.4, 48, 1.4, x, 0, z).box(lights, 9, 5, 1.2, x, 48, z, Math.atan2(-(HOME.z + 20 - z), HOME.x + 40 - x) + Math.PI / 2);
      site.solidBox(x, 0, z, 2, 53, 2);
    }
    site.box(paint('#2a2d31'), 30, 14, 2, 108, 14, 22, Math.atan2(-(22 - HOME.z), 108 - HOME.x) + Math.PI / 2);
    site.box(glow('#9fd2ff', '#1f2a36', 1.3), 27, 11, 0.4, 107, 15.5, 22, Math.atan2(-(22 - HOME.z), 108 - HOME.x) + Math.PI / 2);
    site.box(concrete, 2, 14, 2, 108, 0, 22);
    site.solidBox(108, 0, 22, 30, 28, 4, Math.atan2(-(22 - HOME.z), 108 - HOME.x) + Math.PI / 2);

    const glass = paint('#3f7a52');
    site.lathe(glass, [[0, 0], [2.6, 0], [3.1, 2], [3.4, 6], [2.5, 10], [2.7, 13], [3.3, 16], [2.4, 19.5], [1.2, 21.5], [1, 23.6], [0, 23.6]], FAN_LOT.x, 2, FAN_LOT.z, 20);
    site.cyl(paint('#c8352d'), 1.1, 1.1, 0.8, FAN_LOT.x, 25.6, FAN_LOT.z, 12);
    site.cyl(white, 3.45, 3.45, 2.2, FAN_LOT.x, 8, FAN_LOT.z, 20);
    site.box(concrete, 10, 2, 10, FAN_LOT.x, 0, FAN_LOT.z);
    site.solidCyl(FAN_LOT.x, 0, FAN_LOT.z, 3.6, 26.4);
    const leather = paint('#8a5a32');
    const gx = FAN_LOT.x - 16;
    const gz = FAN_LOT.z + 8;
    site.add(leather, new THREE.SphereGeometry(5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gx, 3, gz, 0.6, -0.4, 0, 1.2, 1.5, 0.6);
    for (let f = 0; f < 4; f++) site.cyl(leather, 1.1, 0.9, 6, gx - 3 + f * 2, 6, gz - 1, 8);
    site.cyl(leather, 1.2, 1, 4, gx + 6, 3, gz + 1, 8);
    site.add(white, new THREE.SphereGeometry(1.6, 12, 8), gx, 8, gz + 2.4);
    site.solidBox(gx, 0, gz, 12, 12, 7, 0.6);
    site.finish();
  },
};
