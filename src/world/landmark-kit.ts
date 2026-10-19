import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toLocal } from '../core/geo';
import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import { cityUniforms } from './city';
import type { Exclusion } from './city-data';

export interface LandmarkSource {
  name: string;
  lat: number;
  lon: number;
  url: string;
}

export type Pt = [number, number];

export const landmarkUniforms = { uTime: { value: 0 } };

const NIGHT_GLSL = `#include <emissivemap_fragment>
  totalEmissiveRadiance *= uNight;`;

const mats = new Map<string, THREE.Material>();

function cached<M extends THREE.Material>(key: string, make: () => M): M {
  let m = mats.get(key) as M | undefined;
  if (!m) mats.set(key, (m = make()));
  return m;
}

export function paint(color: string, flat = false, double = false): THREE.MeshLambertMaterial {
  return cached(`paint:${color}:${flat}:${double}`, () => new THREE.MeshLambertMaterial({ color, flatShading: flat, side: double ? THREE.DoubleSide : THREE.FrontSide }));
}

export function glass(color: string, shininess = 80): THREE.MeshPhongMaterial {
  return cached(`glass:${color}:${shininess}`, () => new THREE.MeshPhongMaterial({ color, specular: '#9fb3c8', shininess, flatShading: true }));
}

function withNight(m: THREE.MeshLambertMaterial, extra = ''): THREE.MeshLambertMaterial {
  m.userData.animated = extra !== '';
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = cityUniforms.uNight;
    s.uniforms.uTime = landmarkUniforms.uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLmPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLmPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform float uTime;\nvarying vec3 vLmPos;')
      .replace('#include <emissivemap_fragment>', NIGHT_GLSL + extra);
  };
  return m;
}

export function glow(color: string, base = '#3a3a3a', intensity = 1): THREE.MeshLambertMaterial {
  return cached(`glow:${color}:${base}:${intensity}`, () => withNight(new THREE.MeshLambertMaterial({ color: base, emissive: color, emissiveIntensity: intensity })));
}

export function beacon(color = '#ff2a1a', period = 1.5): THREE.MeshLambertMaterial {
  return cached(`beacon:${color}:${period}`, () =>
    withNight(
      new THREE.MeshLambertMaterial({ color: '#5a1410', emissive: color, emissiveIntensity: 2 }),
      `\n  totalEmissiveRadiance *= step(0.55, fract(uTime / ${period.toFixed(2)} + vLmPos.x * 0.0007));`,
    ),
  );
}

export function sparkle(color = '#ffffff'): THREE.MeshLambertMaterial {
  return cached(`sparkle:${color}`, () =>
    withNight(
      new THREE.MeshLambertMaterial({ color: '#7d7f84', emissive: color, emissiveIntensity: 3 }),
      `\n  float sweep = 0.5 + 0.5 * sin(vLmPos.x * 0.021 - vLmPos.z * 0.017 + uTime * 1.3);
  float rain = fract(vLmPos.y * 0.035 + uTime * 0.6 + sin(floor(vLmPos.x * 0.07)) * 9.0);
  totalEmissiveRadiance *= 0.3 + 0.7 * pow(sweep, 2.0) * smoothstep(0.1, 1.0, rain);`,
    ),
  );
}

export function crown(): THREE.MeshLambertMaterial {
  return cached('crown', () =>
    withNight(
      new THREE.MeshLambertMaterial({ color: '#c9ced3', emissive: '#ffffff', emissiveIntensity: 1.1 }),
      `\n  float wave = 0.5 + 0.5 * sin(vLmPos.y * 0.35 - uTime * 0.8 + sin(vLmPos.x * 0.15 + uTime * 0.3) * 2.0);
  totalEmissiveRadiance *= mix(vec3(0.55, 0.62, 0.8), vec3(1.0, 0.92, 0.8), wave) * (0.35 + 0.65 * wave);`,
    ),
  );
}

type Solid =
  | { kind: 'box'; x: number; y: number; z: number; hx: number; h: number; hz: number; c: number; s: number }
  | { kind: 'cyl'; x: number; y: number; z: number; r: number; h: number }
  | { kind: 'prism'; x: number; y: number; z: number; r: number; h: number; ring: { x: number; z: number }[] };

function nearestEdge(ring: { x: number; z: number }[], x: number, z: number): { d: number; nx: number; nz: number } {
  let best = { d: Infinity, nx: 0, nz: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const px = a.x + ex * t;
    const pz = a.z + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, nx: d > 1e-6 ? (x - px) / d : -ez / Math.sqrt(l2), nz: d > 1e-6 ? (z - pz) / d : ex / Math.sqrt(l2) };
  }
  return best;
}

export class Site {
  readonly group = new THREE.Group();
  readonly x: number;
  readonly z: number;
  readonly y: number;
  private readonly c: number;
  private readonly s: number;
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private solids: Solid[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(
    readonly game: Game,
    readonly id: string,
    at: { lat: number; lon: number },
    readonly yaw = 0,
    y?: number,
  ) {
    const p = toLocal(at.lat, at.lon);
    this.x = p.x;
    this.z = p.z;
    this.y = y ?? game.world.surfaceAt(p.x, p.z);
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
    this.group.name = `landmark:${id}`;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = yaw;
  }

  local(wx: number, wz: number): { x: number; z: number } {
    const dx = wx - this.x;
    const dz = wz - this.z;
    return { x: dx * this.c - dz * this.s, z: dx * this.s + dz * this.c };
  }

  world(lx: number, lz: number): { x: number; z: number } {
    return { x: this.x + lx * this.c + lz * this.s, z: this.z - lx * this.s + lz * this.c };
  }

  at(lat: number, lon: number): { x: number; z: number } {
    const p = toLocal(lat, lon);
    return this.local(p.x, p.z);
  }

  groundAt(lx: number, lz: number): number {
    const w = this.world(lx, lz);
    return this.game.world.surfaceAt(w.x, w.z) - this.y;
  }

  add(mat: THREE.Material, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(this.m);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(geo);
    return this;
  }

  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): this {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry);
  }

  cyl(mat: THREE.Material, rBottom: number, rTop: number, h: number, x: number, y: number, z: number, seg = 16, open = false): this {
    return this.add(mat, new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open), x, y + h / 2, z);
  }

  beam(mat: THREE.Material, a: Vec3, b: Vec3, w: number, d = w): this {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(w, len, d);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.m.compose(new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), this.q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m);
    return this.add(mat, g);
  }

  tube(mat: THREE.Material, pts: Vec3[], r: number, radial = 6): this {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    return this.add(mat, new THREE.TubeGeometry(curve, pts.length * 2, r, radial, false));
  }

  lathe(mat: THREE.Material, profile: Pt[], x: number, y: number, z: number, seg = 24): this {
    return this.add(mat, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), x, y, z);
  }

  windows(color: string, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0): this {
    const geo = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(color);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return this.add(this.game.cityRenderer.material, geo, x, y, z, ry);
  }

  hideInside(ring: Pt[]): this {
    const city = this.game.world.city;
    const w = ring.map(([x, z]) => this.world(x, z));
    let r = 0;
    for (const [x, z] of ring) r = Math.max(r, Math.hypot(x, z));
    for (const b of city.near(this.x, this.z, r)) if (inside(w, city.cx[b], city.cz[b])) city.hidden[b] = 1;
    return this;
  }

  hideCovered(ring: Pt[], margin = 1.5): this {
    const city = this.game.world.city;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x / ring.length;
      cz += z / ring.length;
    }
    let r = 0;
    for (const [x, z] of ring) r = Math.max(r, Math.hypot(x - cx, z - cz));
    const grown = ring.map(([x, z]) => {
      const d = Math.hypot(x - cx, z - cz) || 1;
      return this.world(x + ((x - cx) / d) * margin, z + ((z - cz) / d) * margin);
    });
    const c = this.world(cx, cz);
    for (const b of city.near(c.x, c.z, r + margin)) {
      let all = true;
      for (let k = city.start[b]; k < city.start[b] + city.len[b] && all; k++) all = inside(grown, city.xs[k], city.zs[k]);
      if (all) city.hidden[b] = 1;
    }
    return this;
  }

  extrude(mat: THREE.Material, ring: Pt[], y: number, h: number, holes: Pt[][] = []): this {
    return this.add(mat, prism(ring, y, h, holes));
  }

  solidBox(x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): this {
    this.solids.push({ kind: 'box', x, y, z, hx: w / 2, h, hz: d / 2, c: Math.cos(ry), s: Math.sin(ry) });
    return this;
  }

  solidCyl(x: number, y: number, z: number, r: number, h: number): this {
    this.solids.push({ kind: 'cyl', x, y, z, r, h });
    return this;
  }

  solidPrism(ring: Pt[], y: number, h: number): this {
    let x = 0;
    let z = 0;
    for (const [px, pz] of ring) {
      x += px / ring.length;
      z += pz / ring.length;
    }
    let r = 0;
    for (const [px, pz] of ring) r = Math.max(r, Math.hypot(px - x, pz - z));
    this.solids.push({ kind: 'prism', x, y, z, r, h, ring: ring.map(([px, pz]) => ({ x: px, z: pz })) });
    return this;
  }

  solidBeam(a: Vec3, b: Vec3, w: number, h: number): this {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(Math.abs(b.y - a.y) / Math.max(h, 1)));
    const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const y = a.y + (b.y - a.y) * t;
      this.solidBox(a.x + (b.x - a.x) * t, y - h / 2, a.z + (b.z - a.z) * t, len / steps + 0.5, h, w, ry);
    }
    return this;
  }

  get solidCount(): number {
    return this.solids.length;
  }

  collide(p: Vec3, r: number): boolean {
    const l = this.local(p.x, p.z);
    let lx = l.x;
    let lz = l.z;
    let ly = p.y - this.y;
    let hit = false;
    for (const s of this.solids) {
      const dy = ly - s.y;
      if (dy < -r || dy > s.h + r) continue;
      if (s.kind === 'prism') {
        if (Math.hypot(lx - s.x, lz - s.z) > s.r + r) continue;
        const isIn = inside(s.ring, lx, lz);
        const e = nearestEdge(s.ring, lx, lz);
        if (!isIn && e.d >= r) continue;
        const side = isIn ? e.d + r : r - e.d;
        const up = s.h + r - dy;
        const down = dy + r;
        if (up <= side && up <= down) ly += up;
        else if (down < side) ly -= down;
        else {
          const dir = isIn ? -1 : 1;
          lx += e.nx * dir * side;
          lz += e.nz * dir * side;
        }
      } else if (s.kind === 'cyl') {
        const dx = lx - s.x;
        const dz = lz - s.z;
        const d = Math.hypot(dx, dz);
        if (d >= s.r + r) continue;
        const side = s.r + r - d;
        const up = s.h + r - dy;
        const down = dy + r;
        if (up <= side && up <= down) ly += up;
        else if (down < side) ly -= down;
        else if (d > 1e-6) {
          lx += (dx / d) * side;
          lz += (dz / d) * side;
        } else lx += side;
      } else {
        const ox = lx - s.x;
        const oz = lz - s.z;
        const bx = ox * s.c - oz * s.s;
        const bz = ox * s.s + oz * s.c;
        const px = s.hx + r - Math.abs(bx);
        const pz = s.hz + r - Math.abs(bz);
        if (px <= 0 || pz <= 0) continue;
        const up = s.h + r - dy;
        const down = dy + r;
        const m = Math.min(px, pz, up, down);
        if (m === up) ly += up;
        else if (m === down) ly -= down;
        else {
          const nbx = m === px ? Math.sign(bx || 1) * px : 0;
          const nbz = m === pz ? Math.sign(bz || 1) * pz : 0;
          lx += nbx * s.c + nbz * s.s;
          lz += -nbx * s.s + nbz * s.c;
        }
      }
      hit = true;
    }
    if (!hit) return false;
    const w = this.world(lx, lz);
    p.x = w.x;
    p.z = w.z;
    p.y = ly + this.y;
    return true;
  }

  finish(): THREE.Group {
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list);
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mat.userData.animated) mesh.onBeforeRender = () => void (landmarkUniforms.uTime.value = performance.now() / 1000);
      this.group.add(mesh);
    }
    this.parts.clear();
    let reach = 0;
    let top = 0;
    for (const s of this.solids) {
      reach = Math.max(reach, Math.hypot(s.x, s.z) + (s.kind === 'box' ? Math.hypot(s.hx, s.hz) : s.r));
      top = Math.max(top, s.y + s.h);
    }
    if (this.solids.length) {
      const R = reach + 4;
      this.game.world.colliders.push((p, r) => (Math.hypot(p.x - this.x, p.z - this.z) > R + r || p.y - r > this.y + top ? false : this.collide(p, r)));
    }
    this.group.updateMatrixWorld(true);
    this.game.world.root.add(this.group);
    return this.group;
  }
}

export function prism(ring: Pt[], y: number, h: number, holes: Pt[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  return g.rotateX(-Math.PI / 2).translate(0, y, 0);
}

export function inside(ring: { x: number; z: number }[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

export function roundedRect(w: number, d: number, r: number, seg = 4): Pt[] {
  const out: Pt[] = [];
  const cr = Math.min(r, w / 2, d / 2);
  for (const [cx, cz, a0] of [
    [w / 2 - cr, d / 2 - cr, 0],
    [-w / 2 + cr, d / 2 - cr, Math.PI / 2],
    [-w / 2 + cr, -d / 2 + cr, Math.PI],
    [w / 2 - cr, -d / 2 + cr, (3 * Math.PI) / 2],
  ]) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((Math.PI / 2) * i) / seg;
      out.push([cx + Math.cos(a) * cr, cz + Math.sin(a) * cr]);
    }
  }
  return out;
}

export function loft(input: { y: number; ring: Pt[] }[], cap = true): THREE.BufferGeometry {
  const r0 = input[0].ring;
  let area = 0;
  for (let i = 0; i < r0.length; i++) area += r0[i][0] * r0[(i + 1) % r0.length][1] - r0[(i + 1) % r0.length][0] * r0[i][1];
  const sections = area < 0 ? input.map((s) => ({ y: s.y, ring: [...s.ring].reverse() })) : input;
  const n = sections[0].ring.length;
  const pos: number[] = [];
  const push = (p: Pt, y: number) => pos.push(p[0], y, p[1]);
  for (let s = 0; s < sections.length - 1; s++) {
    const a = sections[s];
    const b = sections[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(a.ring[i], a.y);
      push(b.ring[i], b.y);
      push(a.ring[j], a.y);
      push(a.ring[j], a.y);
      push(b.ring[i], b.y);
      push(b.ring[j], b.y);
    }
  }
  if (cap) {
    const t = sections[sections.length - 1];
    let cx = 0;
    let cz = 0;
    for (const [x, z] of t.ring) {
      cx += x / n;
      cz += z / n;
    }
    for (let i = 0; i < n; i++) {
      push([cx, cz], t.y);
      push(t.ring[(i + 1) % n], t.y);
      push(t.ring[i], t.y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function taper(w0: number, d0: number, w1: number, d1: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, h, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) > 0 ? 1 : 0;
    pos.setXYZ(i, pos.getX(i) * (w0 + (w1 - w0) * t), pos.getY(i) + h / 2, pos.getZ(i) * (d0 + (d1 - d0) * t));
  }
  g.computeVertexNormals();
  return g;
}

export function yawBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p = toLocal(a.lat, a.lon);
  const q = toLocal(b.lat, b.lon);
  return Math.atan2(q.x - p.x, q.z - p.z);
}

export function circle(lat: number, lon: number, r: number): Exclusion {
  const p = toLocal(lat, lon);
  return { x: p.x, z: p.z, r };
}

export function catenary(span: number, sag: number): (x: number) => number {
  let lo = span / 40;
  let hi = span * 1e3;
  for (let i = 0; i < 80; i++) {
    const a = (lo + hi) / 2;
    if (a * (Math.cosh(span / (2 * a)) - 1) > sag) lo = a;
    else hi = a;
  }
  const a = (lo + hi) / 2;
  return (x) => a * (Math.cosh(x / a) - 1);
}
