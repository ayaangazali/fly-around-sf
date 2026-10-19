export const NO_GROUND = -32768;
const Q = 2;
const GRID = 50;

export interface Exclusion {
  x: number;
  z: number;
  r: number;
}

export class CityData {
  readonly count: number;
  readonly height: Float32Array;
  readonly ground: Float32Array;
  readonly start: Uint32Array;
  readonly len: Uint16Array;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly cx: Float32Array;
  readonly cz: Float32Array;
  readonly hidden: Uint8Array;
  private cells = new Map<number, number[]>();

  constructor(buf: ArrayBuffer, groundFallback: (x: number, z: number) => number) {
    const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
    if (magic !== 'SFC2') throw new Error(`city.bin: bad magic ${magic}`);
    this.count = new DataView(buf).getUint32(4, true);
    const raw = new Int16Array(buf, 8);
    this.height = new Float32Array(this.count);
    this.ground = new Float32Array(this.count);
    this.start = new Uint32Array(this.count);
    this.len = new Uint16Array(this.count);
    this.cx = new Float32Array(this.count);
    this.cz = new Float32Array(this.count);
    this.hidden = new Uint8Array(this.count);
    let verts = 0;
    for (let o = 0, b = 0; b < this.count; b++) {
      const n = raw[o + 2];
      verts += n;
      o += 3 + n * 2;
    }
    this.xs = new Float32Array(verts);
    this.zs = new Float32Array(verts);
    let o = 0;
    let v = 0;
    for (let b = 0; b < this.count; b++) {
      this.height[b] = raw[o] / 10;
      const n = raw[o + 2];
      this.start[b] = v;
      this.len[b] = n;
      let x = 0;
      let z = 0;
      let sx = 0;
      let sz = 0;
      for (let k = 0; k < n; k++) {
        x += raw[o + 3 + k * 2];
        z += raw[o + 4 + k * 2];
        this.xs[v + k] = x / Q;
        this.zs[v + k] = z / Q;
        sx += x / Q;
        sz += z / Q;
      }
      this.cx[b] = sx / n;
      this.cz[b] = sz / n;
      const g = raw[o + 1];
      this.ground[b] = g === NO_GROUND ? groundFallback(this.cx[b], this.cz[b]) : g / 10;
      v += n;
      o += 3 + n * 2;
    }
    this.index();
  }

  private key(i: number, j: number): number {
    return (i + 1000) * 4096 + (j + 1000);
  }

  private index(): void {
    for (let b = 0; b < this.count; b++) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let k = this.start[b]; k < this.start[b] + this.len[b]; k++) {
        minX = Math.min(minX, this.xs[k]);
        maxX = Math.max(maxX, this.xs[k]);
        minZ = Math.min(minZ, this.zs[k]);
        maxZ = Math.max(maxZ, this.zs[k]);
      }
      for (let i = Math.floor(minX / GRID); i <= Math.floor(maxX / GRID); i++) {
        for (let j = Math.floor(minZ / GRID); j <= Math.floor(maxZ / GRID); j++) {
          const k = this.key(i, j);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(b);
        }
      }
    }
  }

  applyExclusions(zones: Exclusion[]): void {
    for (const zone of zones) {
      for (const b of this.near(zone.x, zone.z, zone.r)) {
        if (Math.hypot(this.cx[b] - zone.x, this.cz[b] - zone.z) <= zone.r) this.hidden[b] = 1;
      }
    }
  }

  near(x: number, z: number, r: number): Set<number> {
    const out = new Set<number>();
    for (let i = Math.floor((x - r) / GRID); i <= Math.floor((x + r) / GRID); i++) {
      for (let j = Math.floor((z - r) / GRID); j <= Math.floor((z + r) / GRID); j++) {
        for (const b of this.cells.get(this.key(i, j)) ?? []) out.add(b);
      }
    }
    return out;
  }

  top(b: number): number {
    return this.ground[b] + this.height[b];
  }

  contains(b: number, x: number, z: number): boolean {
    let inside = false;
    const s = this.start[b];
    const n = this.len[b];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = this.xs[s + i];
      const zi = this.zs[s + i];
      const xj = this.xs[s + j];
      const zj = this.zs[s + j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  nearestEdge(b: number, x: number, z: number): { d: number; nx: number; nz: number } {
    const s = this.start[b];
    const n = this.len[b];
    let best = { d: Infinity, nx: 0, nz: 0 };
    for (let i = 0; i < n; i++) {
      const ax = this.xs[s + i];
      const az = this.zs[s + i];
      const bx = this.xs[s + ((i + 1) % n)];
      const bz = this.zs[s + ((i + 1) % n)];
      const ex = bx - ax;
      const ez = bz - az;
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t;
      const pz = az + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, nx: d > 1e-6 ? (x - px) / d : -ez / Math.sqrt(l2), nz: d > 1e-6 ? (z - pz) / d : ex / Math.sqrt(l2) };
    }
    return best;
  }

  roofAt(x: number, z: number): number {
    let top = -Infinity;
    for (const b of this.near(x, z, 0)) if (!this.hidden[b] && this.contains(b, x, z)) top = Math.max(top, this.top(b));
    return top;
  }

  collide(p: { x: number; y: number; z: number }, r: number): boolean {
    let hit = false;
    for (const b of this.near(p.x, p.z, r)) {
      if (this.hidden[b]) continue;
      const top = this.top(b);
      if (p.y - r >= top) continue;
      const inside = this.contains(b, p.x, p.z);
      const edge = this.nearestEdge(b, p.x, p.z);
      if (!inside && edge.d >= r) continue;
      const up = top + r - p.y;
      const side = inside ? edge.d + r : r - edge.d;
      if (up <= side) {
        p.y = top + r;
      } else {
        const dir = inside ? -1 : 1;
        p.x += edge.nx * dir * side;
        p.z += edge.nz * dir * side;
      }
      hit = true;
    }
    return hit;
  }
}
