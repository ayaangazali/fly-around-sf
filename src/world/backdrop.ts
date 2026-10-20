import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toLocal } from '../core/geo';
import { inside } from './landmark-kit';
import type { Terrain } from './terrain';

type LL = [number, number];
type Peak = [number, number, number, number];

const local = (pts: LL[]) => pts.map(([lat, lon]) => toLocal(lat, lon));

const EAST_BAY = local([[38.06, -122.36], [37.965, -122.43], [37.92, -122.39], [37.905, -122.33], [37.87, -122.315], [37.835, -122.3], [37.822, -122.312], [37.805, -122.335], [37.79, -122.3], [37.765, -122.27], [37.735, -122.24], [37.7, -122.23], [37.65, -122.18], [37.55, -122.12], [37.45, -122.05], [37.45, -121.8], [38.06, -121.8]]);
const MARIN = local([[37.82, -122.49], [37.855, -122.476], [37.875, -122.498], [37.93, -122.51], [37.97, -122.49], [38.06, -122.47], [38.06, -122.85], [38.0, -122.85], [37.95, -122.72], [37.9, -122.64], [37.86, -122.59], [37.83, -122.545], [37.815, -122.53]]);
const TIBURON = local([[37.906, -122.512], [37.892, -122.468], [37.872, -122.451], [37.866, -122.462], [37.882, -122.492], [37.898, -122.522]]);
const PENINSULA = local([[37.7, -122.54], [37.7, -122.385], [37.66, -122.38], [37.62, -122.375], [37.6, -122.36], [37.55, -122.3], [37.45, -122.2], [37.45, -122.55], [37.6, -122.52], [37.65, -122.5]]);
const ANGEL = local([[37.869, -122.44], [37.866, -122.425], [37.858, -122.419], [37.851, -122.426], [37.853, -122.439], [37.861, -122.446]]);

const peaks = (list: Peak[]): Peak[] => list.map(([lat, lon, h, r]) => {
  const p = toLocal(lat, lon);
  return [p.x, p.z, h, r];
});

const RIDGE = peaks([
  [38.0, -122.25, 300, 2600], [37.93, -122.24, 450, 2600], [37.88, -122.23, 520, 2400], [37.83, -122.19, 460, 2400],
  [37.78, -122.15, 400, 2600], [37.72, -122.1, 330, 2800], [37.65, -122.05, 320, 3000], [37.55, -121.98, 380, 3200],
]);
const PEAKS = peaks([
  [37.9235, -122.5965, 784, 3600], [37.845, -122.52, 290, 1800], [37.866, -122.51, 280, 1700], [37.89, -122.535, 360, 2400],
  [37.94, -122.54, 460, 3000], [37.857, -122.49, 160, 900], [37.885, -122.47, 160, 1100], [37.872, -122.466, 90, 500],
  [37.861, -122.432, 240, 900], [37.688, -122.45, 380, 1600], [37.685, -122.42, 360, 1500], [37.68, -122.47, 120, 3000],
  [37.56, -122.48, 580, 4000], [37.62, -122.45, 200, 3000],
]);

const TOWERS: LL[] = [[37.8085, -122.2685], [37.8105, -122.2665], [37.8045, -122.2715], [37.8025, -122.2745], [37.807, -122.2735], [37.8115, -122.2635], [37.799, -122.2705]];
const SAS_EAST = toLocal(37.817675, -122.354682);
const SAS_WEST = toLocal(37.814408, -122.36041);
const TOUCHDOWN = toLocal(37.8228, -122.3155);

function bump(peaks: Peak[], x: number, z: number): number {
  let h = 0;
  for (const [px, pz, ph, r] of peaks) h = Math.max(h, ph * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (r * r)));
  return h;
}

export function backdropHeight(x: number, z: number): { h: number; urban: number } {
  if (inside(EAST_BAY, x, z)) {
    const ridge = bump(RIDGE, x, z);
    return { h: 6 + ridge, urban: ridge < 90 ? 1 : 0 };
  }
  if (inside(PENINSULA, x, z)) {
    const hill = bump(PEAKS, x, z);
    return { h: 20 + hill, urban: hill < 100 ? 0.8 : 0 };
  }
  if (inside(MARIN, x, z) || inside(TIBURON, x, z)) return { h: 15 + bump(PEAKS, x, z), urban: 0 };
  if (inside(ANGEL, x, z)) return { h: 4 + bump(PEAKS, x, z), urban: 0 };
  return { h: -12, urban: 0 };
}

const DRY = new THREE.Color('#a8915c');
const OAK = new THREE.Color('#5b6b3c');
const TOWN = new THREE.Color('#9b968c');

function hills(t: Terrain): THREE.BufferGeometry {
  const step = 450;
  const a = toLocal(38.06, -122.85);
  const b = toLocal(37.45, -121.8);
  const cols = Math.ceil((b.x - a.x) / step) + 1;
  const rows = Math.ceil((b.z - a.z) / step) + 1;
  const ext = { x0: t.minX, z0: t.minZ, x1: t.minX + (t.w - 1) * t.cell, z1: t.minZ + (t.h - 1) * t.cell };
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const urban = new Float32Array(cols * rows);
  const covered = new Uint8Array(cols * rows);
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const k = r * cols + q;
      const x = a.x + q * step;
      const z = a.z + r * step;
      const out = Math.max(ext.x0 - x, x - ext.x1, ext.z0 - z, z - ext.z1);
      const f = backdropHeight(x, z);
      const edge = t.heightAt(x, z);
      const y = out <= 0 ? edge - 8 : edge + (f.h - edge) * Math.min(1, out / 1500);
      covered[k] = out <= 0 ? 1 : 0;
      pos.set([x, y, z], k * 3);
      const n = Math.sin(x * 0.0021 + z * 0.0013) * Math.sin(x * 0.0007 - z * 0.0017);
      c.copy(DRY).lerp(OAK, Math.min(1, Math.max(0, n * 0.8 + 0.35 + y / 1500)));
      if (f.urban > 0) c.lerp(TOWN, f.urban * 0.85);
      col.set([c.r, c.g, c.b], k * 3);
      urban[k] = f.urban;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let q = 0; q < cols - 1; q++) {
      const k = [r * cols + q, r * cols + q + 1, (r + 1) * cols + q, (r + 1) * cols + q + 1];
      if (k.every((v) => covered[v]) || k.every((v) => pos[v * 3 + 1] < 0)) continue;
      idx.push(k[0], k[2], k[1], k[1], k[2], k[3]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aUrban', new THREE.BufferAttribute(urban, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number, color: string, glow = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y + h / 2, z);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  g.setAttribute('aUrban', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g;
}

function skyway(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const u = new THREE.Vector2(SAS_EAST.x - SAS_WEST.x, SAS_EAST.z - SAS_WEST.z).normalize();
  const p0 = new THREE.Vector2(SAS_EAST.x, SAS_EAST.z).addScaledVector(u, 40);
  const p2 = new THREE.Vector2(TOUCHDOWN.x, TOUCHDOWN.z);
  const p1 = p0.clone().addScaledVector(u, p0.distanceTo(p2) * 0.45);
  const at = (t: number) => p0.clone().multiplyScalar((1 - t) ** 2).addScaledVector(p1, 2 * t * (1 - t)).addScaledVector(p2, t * t);
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = at(i / n);
    const b = at((i + 1) / n);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const yaw = Math.atan2(dir.x, dir.y);
    const side = new THREE.Vector2(dir.y, -dir.x).normalize();
    const y = 46 - 38 * ((i + 0.5) / n);
    for (const s of [-1, 1]) {
      const c = mid.clone().addScaledVector(side, s * 20);
      out.push(box(24, 3, dir.length() + 0.5, c.x, y - 3, c.y, yaw, '#8d9093'));
      if (i % 2 === 0) out.push(box(7, y - 3, 4, c.x, -2, c.y, yaw, '#b4b1a9'));
    }
  }
  return out;
}

export function createBackdrop(t: Terrain, night: { value: number }): THREE.Mesh {
  const parts = [hills(t), ...skyway(), ...TOWERS.map(([lat, lon], i) => {
    const p = toLocal(lat, lon);
    return box(28 + (i % 3) * 8, 70 + ((i * 37) % 60), 28, p.x, 0, p.z, 0.3, i % 2 ? '#c7c2b6' : '#8fa3b0', 1);
  })];
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNight = night;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aUrban;\nvarying float vUrban;\nvarying float vTrueDist;\nvarying vec2 vBdXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 bdW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 bdD = bdW - cameraPosition;
        vTrueDist = length(bdD);
        vUrban = aUrban;
        vBdXZ = bdW.xz;
        float bdLim = 0.95 * projectionMatrix[3][2] / (projectionMatrix[2][2] + 1.0);
        if (vTrueDist > bdLim) {
          mvPosition = viewMatrix * vec4(cameraPosition + bdD * (bdLim / vTrueDist), 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vUrban;\nvarying float vTrueDist;\nvarying vec2 vBdXZ;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vUrban * uNight * vec3(1.0, 0.6, 0.28) * (0.05 + 0.14 * step(0.7, fract(sin(dot(floor(vBdXZ / 260.0), vec2(12.9898, 78.233))) * 43758.5453)));`,
      )
      .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('smoothstep(fogNear, fogFar, vFogDepth)', 'min(smoothstep(fogNear, fogFar, vTrueDist), 0.66 + 0.3 * smoothstep(fogFar, 45000.0, vTrueDist))'));
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'backdrop';
  mesh.frustumCulled = false;
  return mesh;
}
