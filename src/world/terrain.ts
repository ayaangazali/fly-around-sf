import * as THREE from 'three';

export class Terrain {
  constructor(
    readonly w: number,
    readonly h: number,
    readonly cell: number,
    readonly minX: number,
    readonly minZ: number,
    readonly grid: Int16Array,
  ) {}

  static parse(buf: ArrayBuffer): Terrain {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
    if (magic !== 'SFT1') throw new Error(`terrain.bin: bad magic ${magic}`);
    const w = dv.getUint16(4, true);
    const h = dv.getUint16(6, true);
    return new Terrain(w, h, dv.getFloat32(8, true), dv.getFloat32(12, true), dv.getFloat32(16, true), new Int16Array(buf, 20, w * h));
  }

  private at(i: number, j: number): number {
    const ci = Math.min(this.w - 1, Math.max(0, i));
    const cj = Math.min(this.h - 1, Math.max(0, j));
    return this.grid[cj * this.w + ci] / 10;
  }

  heightAt(x: number, z: number): number {
    const fx = (x - this.minX) / this.cell;
    const fz = (z - this.minZ) / this.cell;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const dx = fx - i;
    const dz = fz - j;
    const a = this.at(i, j);
    const b = this.at(i + 1, j);
    const c = this.at(i, j + 1);
    const d = this.at(i + 1, j + 1);
    return (a * (1 - dx) + b * dx) * (1 - dz) + (c * (1 - dx) + d * dx) * dz;
  }

  meshHeightAt(x: number, z: number, stride: number): number {
    const fx = (x - this.minX) / (this.cell * stride);
    const fz = (z - this.minZ) / (this.cell * stride);
    const q = Math.floor(fx);
    const r = Math.floor(fz);
    const u = fx - q;
    const v = fz - r;
    const a = this.at(q * stride, r * stride);
    const b = this.at((q + 1) * stride, r * stride);
    const d = this.at(q * stride, (r + 1) * stride);
    if (u + v <= 1) return a + (b - a) * u + (d - a) * v;
    const e = this.at((q + 1) * stride, (r + 1) * stride);
    return e + (d - e) * (1 - u) + (b - e) * (1 - v);
  }

  buildMesh(stride: number): THREE.Mesh {
    const cols = Math.floor((this.w - 1) / stride) + 1;
    const rows = Math.floor((this.h - 1) / stride) + 1;
    const pos = new Float32Array(cols * rows * 3);
    const col = new Float32Array(cols * rows * 3);
    const c = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const k = r * cols + q;
        const x = this.minX + q * stride * this.cell;
        const z = this.minZ + r * stride * this.cell;
        const y = this.at(q * stride, r * stride);
        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z;
        terrainColor(y, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let o = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let q = 0; q < cols - 1; q++) {
        const a = r * cols + q;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        idx.set([a, d, b, b, d, e], o);
        o += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}

const SAND = new THREE.Color('#d9c9a3');
const LOW = new THREE.Color('#a7b98a');
const MID = new THREE.Color('#7f9a64');
const HIGH = new THREE.Color('#9c9a72');
const SEABED = new THREE.Color('#40626e');

export function terrainColor(y: number, out: THREE.Color): THREE.Color {
  if (y < -1) return out.copy(SEABED);
  if (y < 3) return out.copy(SAND);
  if (y < 60) return out.copy(LOW).lerp(MID, (y - 3) / 57);
  return out.copy(MID).lerp(HIGH, Math.min(1, (y - 60) / 200));
}
