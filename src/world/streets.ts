import * as THREE from 'three';
import { Road, type Polyline } from './env-data';

export interface RoadClass {
  half: number;
  walk: number;
  rank: number;
  lamp: number;
}

export const ROAD: Record<number, RoadClass> = {
  [Road.Path]: { half: 1.6, walk: 0, rank: 0, lamp: 0 },
  [Road.Freeway]: { half: 11, walk: 0, rank: 7, lamp: 52 },
  [Road.Major]: { half: 8, walk: 3, rank: 5, lamp: 30 },
  [Road.Arterial]: { half: 6.5, walk: 3, rank: 4, lamp: 32 },
  [Road.Collector]: { half: 5.5, walk: 2.5, rank: 3, lamp: 34 },
  [Road.Residential]: { half: 5, walk: 2.5, rank: 2, lamp: 38 },
  [Road.Ramp]: { half: 4.5, walk: 0, rank: 6, lamp: 44 },
  [Road.Boulevard]: { half: 10, walk: 3.5, rank: 6, lamp: 26 },
};

export interface RoadTile {
  key: string;
  cx: number;
  cz: number;
  position: Float32Array;
  normal: Int8Array;
  road: Float32Array;
  index: Uint32Array;
}

export interface RoadBuild {
  tiles: RoadTile[];
  lamps: Float32Array;
  meters: number;
}

export interface RoadOptions {
  step: number;
  tile: number;
  piece: number;
}

type Height = (x: number, z: number) => number;

interface Sample {
  x: number;
  z: number;
  u: number;
}

export function resample(xs: Float32Array, zs: Float32Array, step: number): Sample[] {
  const out: Sample[] = [{ x: xs[0], z: zs[0], u: 0 }];
  let u = 0;
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1];
    const dz = zs[i] - zs[i - 1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push({ x: xs[i - 1] + (dx * k) / n, z: zs[i - 1] + (dz * k) / n, u: u + (len * k) / n });
    u += len;
  }
  return out;
}

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  road: number[] = [];
  idx: number[] = [];
  sx = 0;
  sz = 0;
  n = 0;
}

export function buildRoads(lines: Polyline[], height: Height, opts: RoadOptions): RoadBuild {
  const tiles = new Map<string, Builder>();
  const lamps: number[] = [];
  let meters = 0;
  const normalAt = (x: number, z: number) => {
    const gx = (height(x + 3, z) - height(x - 3, z)) / 6;
    const gz = (height(x, z + 3) - height(x, z - 3)) / 6;
    const l = Math.hypot(gx, 1, gz);
    return [(-gx / l) * 127, (1 / l) * 127, (-gz / l) * 127];
  };
  for (const line of lines) {
    const spec = ROAD[line.cls] ?? ROAD[Road.Residential];
    const s = resample(line.xs, line.zs, opts.step);
    if (s.length < 2) continue;
    const w = spec.half + spec.walk;
    const first = s[0];
    const last = s[s.length - 1];
    const d0 = Math.hypot(s[1].x - first.x, s[1].z - first.z) || 1;
    const d1 = Math.hypot(last.x - s[s.length - 2].x, last.z - s[s.length - 2].z) || 1;
    s.unshift({ x: first.x - ((s[1].x - first.x) / d0) * spec.half, z: first.z - ((s[1].z - first.z) / d0) * spec.half, u: -spec.half });
    s.push({ x: last.x + ((last.x - s[s.length - 2].x) / d1) * spec.half, z: last.z + ((last.z - s[s.length - 2].z) / d1) * spec.half, u: last.u + spec.half });
    const ew = Math.abs(last.x - first.x) > Math.abs(last.z - first.z) ? 0.02 : 0;
    const lift = 0.3 + spec.rank * 0.04 + ew;
    const dry = s.map((p) => height(p.x, p.z) > 0.25);
    let start = 0;
    while (start < s.length - 1) {
      let end = start;
      while (end < s.length - 1 && s[end + 1].u - s[start].u <= opts.piece) end++;
      if (end === start) end++;
      const mid = s[(start + end) >> 1];
      const key = `${Math.floor(mid.x / opts.tile)},${Math.floor(mid.z / opts.tile)}`;
      let b = tiles.get(key);
      if (!b) tiles.set(key, (b = new Builder()));
      let prev = -1;
      for (let i = start; i <= end; i++) {
        const p = s[i];
        const a = s[Math.max(0, i - 1)];
        const c = s[Math.min(s.length - 1, i + 1)];
        let tx = c.x - a.x;
        let tz = c.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        let miter = 1;
        if (i > 0 && i < s.length - 1) {
          const ax = p.x - a.x;
          const az = p.z - a.z;
          const al = Math.hypot(ax, az) || 1;
          miter = Math.min(2, 1 / Math.max(0.5, (ax / al) * tx + (az / al) * tz));
        }
        const nx = -tz * w * miter;
        const nz = tx * w * miter;
        const v = b.pos.length / 3;
        for (const side of [-1, 1]) {
          const x = p.x + nx * side;
          const z = p.z + nz * side;
          b.pos.push(x, height(x, z) + lift, z);
          b.nrm.push(...normalAt(x, z));
          b.road.push(p.u, side * w, line.cls);
        }
        if (prev >= 0 && dry[i] && dry[i - 1]) {
          b.idx.push(prev, prev + 1, v, prev + 1, v + 1, v);
          meters += p.u - s[i - 1].u;
        }
        prev = v;
        b.sx += p.x;
        b.sz += p.z;
        b.n++;
      }
      start = end;
    }
    if (spec.lamp > 0) {
      for (let k = 0, u = spec.lamp / 2; u < last.u; k++, u += spec.lamp) {
        let i = 1;
        while (i < s.length - 1 && s[i].u < u) i++;
        const a = s[i - 1];
        const c = s[i];
        const t = (u - a.u) / (c.u - a.u || 1);
        const x = a.x + (c.x - a.x) * t;
        const z = a.z + (c.z - a.z) * t;
        const len = Math.hypot(c.x - a.x, c.z - a.z) || 1;
        const side = k % 2 === 0 ? 1 : -1;
        const lx = x + (-(c.z - a.z) / len) * spec.half * side;
        const lz = z + ((c.x - a.x) / len) * spec.half * side;
        const g = height(lx, lz);
        if (g > 0.25) lamps.push(lx, g + 7.5, lz, (k * 7919 + line.xs.length * 31) % 97 / 97);
      }
    }
  }
  const out: RoadTile[] = [];
  for (const [key, b] of tiles) {
    if (!b.idx.length) continue;
    out.push({ key, cx: b.sx / b.n, cz: b.sz / b.n, position: Float32Array.from(b.pos), normal: Int8Array.from(b.nrm), road: Float32Array.from(b.road), index: Uint32Array.from(b.idx) });
  }
  return { tiles: out, lamps: Float32Array.from(lamps), meters };
}

const ROAD_GLSL = /* glsl */ `
float roadHalf(float c) {
  return c < 0.5 ? 1.6 : c < 1.5 ? 11.0 : c < 2.5 ? 8.0 : c < 3.5 ? 6.5 : c < 4.5 ? 5.5 : c < 5.5 ? 5.0 : c < 6.5 ? 4.5 : 10.0;
}
float roadLamp(float c) {
  return c < 0.5 ? 0.0 : c < 1.5 ? 52.0 : c < 2.5 ? 30.0 : c < 3.5 ? 32.0 : c < 4.5 ? 34.0 : c < 5.5 ? 38.0 : c < 6.5 ? 44.0 : 26.0;
}
float band(float x, float a, float b, float aa) {
  return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x));
}
`;

export function createRoadMaterial(night: { value: number }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad;\nvarying vec3 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRoad;\nuniform float uNight;\n${ROAD_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float cls = floor(vRoad.z + 0.5);
        float h = roadHalf(cls);
        float a = abs(vRoad.y);
        float u = vRoad.x;
        float aa = max(fwidth(vRoad.y), 0.02);
        float fade = 1.0 - smoothstep(0.12, 0.45, aa);
        float n = fract(sin(dot(floor(vec2(u, vRoad.y) * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 asphalt = mix(vec3(0.23, 0.235, 0.25), vec3(0.27, 0.27, 0.28), n * fade);
        if (cls < 0.5) asphalt = vec3(0.62, 0.59, 0.52);
        if (cls > 0.5 && cls < 1.5) asphalt *= 1.08;
        vec3 walk = mix(vec3(0.66, 0.64, 0.6), vec3(0.72, 0.7, 0.66), n * fade);
        vec3 col = mix(asphalt, walk, smoothstep(h - aa, h + aa, a));
        col = mix(col, vec3(0.8, 0.78, 0.74), band(a, h, h + 0.3, aa) * fade);
        float yellow = 0.0;
        float white = 0.0;
        if (cls > 1.5 && cls < 4.5 || cls > 6.5) {
          yellow = band(a, 0.1, 0.24, aa);
          float lane = h * 0.5;
          white = band(a, lane - 0.07, lane + 0.07, aa) * step(fract(u / 12.0), 0.3) * step(4.5, h);
        }
        if (cls > 0.5 && cls < 1.5) {
          col = mix(col, vec3(0.55, 0.55, 0.53), band(a, 0.0, 0.6, aa));
          white = max(band(a, 4.25, 4.4, aa), band(a, 7.95, 8.1, aa)) * step(fract(u / 12.0), 0.3) + band(a, h - 0.5, h - 0.35, aa);
        }
        col = mix(col, vec3(0.86, 0.68, 0.22), yellow * fade);
        col = mix(col, vec3(0.86, 0.86, 0.84), white * fade);
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sp = roadLamp(cls);
        if (sp > 0.0 && uNight > 0.01) {
          float pool = 0.0;
          float k0 = floor(u / sp);
          for (float j = -1.0; j <= 1.0; j += 1.0) {
            float k = k0 + j;
            float side = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
            float du = u - sp * (k + 0.5);
            float dv = vRoad.y - side * h;
            pool += exp(-(du * du + dv * dv) / 70.0);
          }
          totalEmissiveRadiance += uNight * (0.035 + 0.5 * min(pool, 1.2)) * vec3(1.0, 0.72, 0.42) * diffuseColor.rgb * 1.6;
        }`,
      );
  };
  return mat;
}

export function roadMesh(t: RoadTile, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(t.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(t.normal, 3, true));
  g.setAttribute('aRoad', new THREE.BufferAttribute(t.road, 3));
  g.setIndex(new THREE.BufferAttribute(t.index, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = `roads:${t.key}`;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}
