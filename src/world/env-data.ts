const Q = 2;

function magic(buf: ArrayBuffer, want: string): number {
  const got = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (got !== want) throw new Error(`bad magic ${got}, expected ${want}`);
  return new DataView(buf).getUint32(4, true);
}

export const Road = { Path: 0, Freeway: 1, Major: 2, Arterial: 3, Collector: 4, Residential: 5, Ramp: 6, Boulevard: 7 } as const;

export interface Polyline {
  cls: number;
  xs: Float32Array;
  zs: Float32Array;
}

export function parseStreets(buf: ArrayBuffer): Polyline[] {
  const count = magic(buf, 'SFS1');
  const raw = new Int16Array(buf, 8);
  const out: Polyline[] = [];
  let o = 0;
  for (let i = 0; i < count; i++) {
    const cls = raw[o];
    const n = raw[o + 1];
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    let x = 0;
    let z = 0;
    for (let k = 0; k < n; k++) {
      x += raw[o + 2 + k * 2];
      z += raw[o + 3 + k * 2];
      xs[k] = x / Q;
      zs[k] = z / Q;
    }
    out.push({ cls, xs, zs });
    o += 2 + n * 2;
  }
  return out;
}

export const Cover = { Grass: 1, Wood: 2, Scrub: 3, Sand: 4, Lake: 5 } as const;

export interface Area {
  cls: number;
  rings: { xs: Float32Array; zs: Float32Array }[];
}

export function parseGreen(buf: ArrayBuffer): Area[] {
  const count = magic(buf, 'SFG1');
  const raw = new Int16Array(buf, 8);
  const out: Area[] = [];
  let o = 0;
  for (let i = 0; i < count; i++) {
    const cls = raw[o++];
    const nr = raw[o++];
    const rings: Area['rings'] = [];
    for (let r = 0; r < nr; r++) {
      const n = raw[o++];
      const xs = new Float32Array(n);
      const zs = new Float32Array(n);
      let x = 0;
      let z = 0;
      for (let k = 0; k < n; k++) {
        x += raw[o++];
        z += raw[o++];
        xs[k] = x / Q;
        zs[k] = z / Q;
      }
      rings.push({ xs, zs });
    }
    out.push({ cls, rings });
  }
  return out;
}

export const TreeKind = { Broadleaf: 0, Conifer: 1, Eucalyptus: 2, Palm: 3 } as const;

export interface TreeList {
  count: number;
  x: Float32Array;
  z: Float32Array;
  kind: Uint8Array;
  height: Float32Array;
  tint: Uint8Array;
}

export function parseTrees(buf: ArrayBuffer): TreeList {
  const count = magic(buf, 'SFTR');
  const xz = new Int16Array(buf, 8, count * 2);
  const meta = new Uint8Array(buf, 8 + count * 4, count * 3);
  const t: TreeList = { count, x: new Float32Array(count), z: new Float32Array(count), kind: meta.slice(0, count), height: new Float32Array(count), tint: meta.slice(2 * count, 3 * count) };
  for (let i = 0; i < count; i++) {
    t.x[i] = xz[i * 2] / Q;
    t.z[i] = xz[i * 2 + 1] / Q;
    t.height[i] = meta[count + i] / 4;
  }
  return t;
}

export function parseStars(buf: ArrayBuffer): Float32Array {
  const count = magic(buf, 'SFST');
  return new Float32Array(buf, 8, count * 4);
}
