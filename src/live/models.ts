import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface VehicleModel {
  paint: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  wake?: THREE.BufferGeometry;
  length: number;
}

class Parts {
  readonly list: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): this {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.list.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rx = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return this.add(g, color);
  }

  cyl(r1: number, r2: number, len: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10): this {
    const g = new THREE.CylinderGeometry(r1, r2, len, seg);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    return this.add(g, color);
  }

  wheel(r: number, w: number, x: number, y: number, z: number): this {
    const g = new THREE.CylinderGeometry(r, r, w, 12);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return this.add(g, DARK);
  }

  slab(outline: [number, number][], y0: number, h: number, color: THREE.ColorRepresentation): this {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return this.add(g, color);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.list);
    if (!g) throw new Error('model merge failed');
    g.computeBoundingSphere();
    return g;
  }
}

const WOOD = '#6b4528';
const DARK = '#262421';
const CREAM = '#efe2bf';
const GOLD = '#c9a646';
const WHITE = '#ffffff';
const RIDERS = ['#3e7cb1', '#e8c547', '#c4473a', '#f2efe6', '#4a8a5a', '#8a5aa8'];
const SKIN = ['#c68e64', '#8d5a3b', '#e7b98f', '#5c3b28'];

function cableCar(california: boolean): VehicleModel {
  const len = california ? 9.2 : 8.3;
  const half = len / 2;
  const paint = new Parts();
  const trim = new Parts();
  const glass = new Parts();
  paint.box(2.4, 0.75, len - 0.2, 0, 0.85, 0, WHITE);
  trim.box(2.62, 0.12, len, 0, 0.42, 0, WOOD);
  trim.box(2.44, 0.06, len - 0.1, 0, 1.25, 0, GOLD);
  trim.box(2.0, 0.3, len - 1.2, 0, 0.25, 0, DARK);
  for (const z of [-half + 1.3, half - 1.3]) for (const x of [-0.75, 0.75]) trim.wheel(0.33, 0.14, x, 0.33, z);
  const cab = california ? [-2.3, 2.3] : [-0.8, half - 0.15];
  const cabLen = cab[1] - cab[0];
  const cabZ = (cab[0] + cab[1]) / 2;
  paint.box(2.42, 0.35, cabLen, 0, 1.45, cabZ, WHITE);
  glass.box(2.36, 0.85, cabLen - 0.2, 0, 2.05, cabZ, WHITE);
  trim.box(2.44, 0.32, cabLen, 0, 2.62, cabZ, CREAM);
  for (const z of [cab[0], cab[1]]) trim.box(2.46, 1.55, 0.12, 0, 1.95, z, CREAM);
  const open = california ? [[-half + 0.2, cab[0]], [cab[1], half - 0.2]] : [[-half + 0.2, cab[0]]];
  for (const [a, b] of open) {
    const mid = (a + b) / 2;
    trim.box(0.4, 0.5, b - a - 0.2, 0, 1.55, mid, WOOD);
    trim.box(0.12, 0.6, b - a - 0.2, 0, 1.95, mid, CREAM);
    for (const x of [-1.15, 1.15]) for (const z of [a + 0.1, mid, b - 0.1]) trim.box(0.08, 1.5, 0.08, x, 2.0, z, GOLD);
    for (const x of [-1.32, 1.32]) trim.box(0.12, 0.08, b - a, x, 1.0, mid, WOOD);
    RIDERS.forEach((shirt, i) => {
      const x = i % 2 ? 1.42 : -1.42;
      const z = a + 0.5 + ((b - a - 1) * Math.floor(i / 2)) / 2;
      trim.box(0.34, 0.72, 0.3, x, 1.5, z, shirt).box(0.2, 0.24, 0.22, x, 2.0, z, SKIN[i % SKIN.length]).box(0.26, 0.6, 0.24, x, 0.95, z, '#2d3340');
    });
  }
  trim.box(0.4, 0.75, 0.3, 0, 1.6, -half + 1.5, '#2b3a55').box(0.22, 0.26, 0.22, 0, 2.1, -half + 1.5, SKIN[1]);
  trim.box(0.22, 0.2, 0.22, 0, 3.04, -half + 0.6, GOLD);
  trim.box(2.56, 0.16, len + 0.1, 0, 2.86, 0, DARK);
  trim.box(1.3, 0.22, len - 1.6, 0, 3.04, 0, CREAM);
  trim.box(1.36, 0.06, len - 1.5, 0, 3.17, 0, DARK);
  for (const z of california ? [-half + 0.05, half - 0.05] : [-half + 0.05]) glass.box(0.34, 0.34, 0.1, 0, 2.6, z, WHITE);
  return { paint: paint.build(), trim: trim.build(), glass: glass.build(), length: len };
}

function streetcar(): VehicleModel {
  const len = 14.2;
  const paint = new Parts();
  const trim = new Parts();
  const glass = new Parts();
  const half = len / 2;
  const body: [number, number][] = [
    [-1.3, -half + 1.2],
    [-0.9, -half + 0.2],
    [0.9, -half + 0.2],
    [1.3, -half + 1.2],
    [1.3, half - 1.2],
    [0.9, half - 0.2],
    [-0.9, half - 0.2],
    [-1.3, half - 1.2],
  ];
  paint.slab(body, 0.55, 1.1, WHITE);
  glass.slab(body.map(([x, z]) => [x * 0.99, z * 0.995]), 1.65, 0.85, WHITE);
  trim.slab(body, 2.5, 0.35, CREAM);
  trim.slab(body.map(([x, z]) => [x * 0.8, z * 0.97]), 2.85, 0.22, '#9a9890');
  trim.box(2.2, 0.35, len - 2, 0, 0.35, 0, DARK);
  for (const z of [-half + 2.5, half - 2.5]) trim.box(2.0, 0.55, 2.2, 0, 0.3, z, '#3b3a37');
  trim.box(0.08, 0.08, 6.5, 0, 4.4, 1.6, DARK, -0.42);
  trim.box(0.5, 0.25, 0.6, 0, 3.15, -1.2, DARK);
  for (let z = -half + 2; z <= half - 2; z += 1.25) trim.box(2.66, 0.85, 0.14, 0, 2.07, z, CREAM);
  glass.box(0.3, 0.3, 0.1, 0, 1.3, -half + 0.15, WHITE);
  return { paint: paint.build(), trim: trim.build(), glass: glass.build(), length: len };
}

function bus(trolley: boolean): VehicleModel {
  const len = 12.2;
  const half = len / 2;
  const paint = new Parts();
  const trim = new Parts();
  const glass = new Parts();
  paint.box(2.55, 1.0, len, 0, 0.95, 0, WHITE);
  paint.box(2.55, 0.42, len, 0, 2.86, 0, WHITE);
  glass.box(2.5, 1.2, len - 0.6, 0, 2.05, 0.1, WHITE);
  glass.box(2.3, 1.5, 0.08, 0, 1.9, -half - 0.02, WHITE);
  trim.box(2.57, 0.22, len + 0.02, 0, 1.38, 0, '#c1272d');
  for (let z = -half + 1.6; z <= half - 0.6; z += 1.45) trim.box(2.56, 1.2, 0.14, 0, 2.05, z, '#d9dcde');
  trim.box(2.3, 0.18, len - 0.4, 0, 3.15, 0, '#b9bcbf');
  for (const z of [-half + 2.4, half - 2.9]) for (const x of [-1.15, 1.15]) trim.wheel(0.5, 0.3, x, 0.5, z);
  trim.box(2.5, 0.35, len - 0.2, 0, 0.4, 0, '#3a3c3e');
  if (trolley) {
    trim.box(1.4, 0.3, 1.6, 0, 3.4, 1.2, '#6e7377');
    for (const x of [-0.3, 0.3]) trim.box(0.07, 0.07, 6.2, x, 4.55, 4.3, DARK, -0.36);
  }
  return { paint: paint.build(), trim: trim.build(), glass: glass.build(), length: len };
}

function ferry(catamaran: boolean): VehicleModel {
  const len = catamaran ? 40 : 50;
  const half = len / 2;
  const w = catamaran ? 5.4 : 5.2;
  const paint = new Parts();
  const trim = new Parts();
  const glass = new Parts();
  const hull = (x: number, hw: number): [number, number][] => [
    [x - hw, half - 1],
    [x - hw, -half + 9],
    [x, -half],
    [x + hw, -half + 9],
    [x + hw, half - 1],
  ];
  if (catamaran) {
    for (const x of [-3.6, 3.6]) trim.slab(hull(x, 1.4), -1, 2.2, '#1f3b63');
    paint.slab(hull(0, w), 1.2, 1.4, WHITE);
  } else {
    trim.slab(hull(0, w), -1.5, 1.8, '#7b1e22');
    paint.slab(hull(0, w), 0.3, 2.1, WHITE);
  }
  const deck = (s: number, z: number): [number, number][] => hull(0, w * s).map(([x, zz]) => [x, zz * s * 0.9 + z]);
  glass.slab(deck(0.86, 1), 2.6, 1.6, WHITE);
  trim.slab(deck(0.88, 1), 4.2, 0.35, WHITE);
  glass.slab(deck(0.62, 4), 4.55, 1.4, WHITE);
  trim.slab(deck(0.66, 4), 5.95, 0.3, '#e6e8ea');
  trim.box(3.4, 1.2, 3.2, 0, 6.8, -half * 0.25, WHITE);
  glass.box(3.42, 0.6, 3.22, 0, 6.9, -half * 0.25, WHITE);
  trim.box(0.25, 2.4, 0.25, 0, 8.4, -half * 0.25 + 0.6, DARK);
  const wake = new Parts()
    .slab([[-w * 0.6, half - 2], [w * 0.6, half - 2], [w * 1.4, half + 70], [-w * 1.4, half + 70]], 0.06, 0.02, '#e9f4f7')
    .slab([[-w - 0.4, -half + 10], [-w + 0.6, -half + 10], [-w - 14, half + 60], [-w - 16, half + 60]], 0.08, 0.02, WHITE)
    .slab([[w - 0.6, -half + 10], [w + 0.4, -half + 10], [w + 16, half + 60], [w + 14, half + 60]], 0.08, 0.02, WHITE);
  return { paint: paint.build(), trim: trim.build(), glass: glass.build(), wake: wake.build(), length: len };
}

export const MODELS = {
  powell: cableCar(false),
  california: cableCar(true),
  streetcar: streetcar(),
  trolley: bus(true),
  bus: bus(false),
  ferry: ferry(false),
  catamaran: ferry(true),
};

export type ModelId = keyof typeof MODELS;

export const TAILS = ['#1d3f8f', '#c0392b', '#0f7a6c', '#e4a316', '#5b2a86', '#2b2d31'];

export function airliner(): THREE.BufferGeometry {
  const p = new Parts();
  const len = 37.6;
  const r = 1.98;
  p.cyl(r, r, len - 9, 0, 0, 0.5, WHITE, 14);
  p.cyl(0.25, r, 4.6, 0, -0.2, -len / 2 + 2.3 + 0.5, WHITE, 14);
  p.cyl(r, 0.35, 5.2, 0, 0.5, len / 2 - 2.6 + 0.5, WHITE, 14);
  p.box(3.2, 0.9, 6, 0, -1.4, 0.5, '#b9bec4');
  p.box(0.3, 0.32, len - 12, r * 0.98, 0.35, -0.3, '#2c3440');
  p.box(0.3, 0.32, len - 12, -r * 0.98, 0.35, -0.3, '#2c3440');
  const wing: [number, number][] = [
    [0, -3.5],
    [17, 4.5],
    [17, 6.2],
    [0, 3.5],
  ];
  for (const s of [1, -1]) {
    p.slab(wing.map(([x, z]) => [x * s + s * 1.5, z]), -0.9, 0.35, '#d8dce0');
    p.cyl(1.05, 0.9, 4.2, s * 5.8, -1.7, -1.6, '#c8cdd2', 12);
    p.slab([[s * 1, len / 2 - 4], [s * 6.5, len / 2 - 0.6], [s * 6.5, len / 2 + 0.6], [s * 1, len / 2 + 0.2]], 0.6, 0.22, '#d8dce0');
  }
  return p.build();
}

export function fin(): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(
    new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(4.6, 7.2), new THREE.Vector2(6.8, 7.2), new THREE.Vector2(6.4, 0)]),
    { depth: 0.35, bevelEnabled: false },
  );
  g.translate(0, 0, -0.175);
  g.rotateY(-Math.PI / 2);
  g.translate(0, 1.4, 18.8 - 6.4 + 0.5);
  g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}
