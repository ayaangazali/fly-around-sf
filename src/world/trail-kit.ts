import * as THREE from 'three';
import { glow, inside, paint, type Pt, type Site } from './landmark-kit';

type Stroke = Pt[];

const O: Stroke = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P: Stroke = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];

export const GLYPHS: Record<string, Stroke[]> = {
  A: [[[0, 0], [2, 6], [4, 0]], [[0.8, 2.2], [3.2, 2.2]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2.2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 0], [1, 6]], [[0, 6], [2, 6]], [[0, 0], [2, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1.4, 3.4], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [P],
  Q: [O, [[2.4, 1.6], [4.2, -0.4]]],
  R: [P, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  '0': [O],
  '1': [[[0, 5], [1, 6], [1, 0]], [[0, 0], [2, 0]]],
  '2': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  '3': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  '4': [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  '5': [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  '6': [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  '7': [[[0, 6], [4, 6], [1.5, 0]]],
  '8': [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  '9': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [4, 3]]],
  ',': [[[0.6, 0.4], [0, -1]]],
  '.': [[[0.3, 0], [0.3, 0.3]]],
  '-': [[[0.4, 3], [3.2, 3]]],
  "'": [[[0.4, 6], [0.4, 4.6]]],
  '&': [[[4, 0], [1, 4], [1, 5], [1.8, 6], [2.6, 6], [3.2, 5], [3, 4], [0, 2], [0, 1], [1, 0], [2.4, 0], [4, 2]]],
};

const STROKE = 1;
const GAP = 1.6;
const SPACE = 3;
const LINE = 9;

const advance = (ch: string): number => {
  if (ch === ' ') return SPACE;
  const g = GLYPHS[ch];
  if (!g) throw new Error(`sign: no glyph for ${JSON.stringify(ch)}`);
  return Math.max(...g.flat().map((p) => p[0])) + GAP;
};

export function textWidth(line: string): number {
  return [...line].reduce((w, ch) => w + advance(ch), 0) - GAP;
}

export interface SignStyle {
  panel?: string | null;
  ink?: string;
  light?: string;
  accent?: string;
  both?: boolean;
}

export interface SignInfo {
  text: string;
  letter: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  w: number;
  h: number;
  both: boolean;
}

export function sign(site: Site, text: string, x: number, y: number, z: number, ry: number, letter: number, style: SignStyle = {}): SignInfo {
  const k = letter / 6;
  const lines = text.split('\n');
  const pad = 2.2 * k;
  const w = Math.max(...lines.map(textWidth)) * k + pad * 2;
  const h = (lines.length * LINE - 3) * k + pad * 2;
  const depth = Math.max(0.3, 0.12 * letter);
  const relief = Math.max(0.2, 0.06 * letter);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (u: number, v: number, n: number): [number, number, number] => [x + u * c + n * s, y + v, z - u * s + n * c];
  const both = style.both ?? false;
  const panelDepth = style.panel === null ? 0 : both ? depth * 2 : depth;
  if (style.panel !== null) site.add(paint(style.panel ?? '#1d2733'), new THREE.BoxGeometry(w, h, panelDepth), ...at(0, 0, both ? 0 : depth / 2), ry);
  if (style.accent) {
    for (const side of both ? [1, -1] : [1]) site.add(paint(style.accent), new THREE.BoxGeometry(w, pad * 0.45, relief), ...at(0, -h / 2 + pad * 0.3, side * (panelDepth / 2 + relief / 2) + (both ? 0 : panelDepth / 2)), ry);
  }
  const ink = glow(style.light ?? '#fff1cf', style.ink ?? '#f7f3ea', 1.3);
  for (const side of both ? [1, -1] : [1]) {
    const face = side * (panelDepth / 2) + (both ? 0 : panelDepth / 2) + (side * relief) / 2;
    lines.forEach((line, row) => {
      let u = -textWidth(line) / 2;
      const v0 = h / 2 - pad - 6 * k - row * LINE * k;
      for (const ch of line) {
        for (const stroke of GLYPHS[ch] ?? []) {
          for (let i = 0; i < stroke.length - 1; i++) {
            const [ax, ay] = stroke[i];
            const [bx, by] = stroke[i + 1];
            const len = Math.hypot(bx - ax, by - ay) * k;
            const mu = (u + (ax + bx) / 2) * k * side;
            const mv = v0 + ((ay + by) / 2) * k;
            const angle = Math.atan2(by - ay, (bx - ax) * side);
            site.add(ink, new THREE.BoxGeometry(len + STROKE * k, STROKE * k, relief), ...at(mu, mv, face), ry, 0, angle);
          }
        }
        u += advance(ch);
      }
    });
  }
  const info = { text, letter, x, y, z, ry, w, h, both };
  (site.group.userData.signs ??= []).push(info);
  return info;
}

export function outward(ring: Pt[], i: number): { x: number; z: number; len: number } {
  const [ax, az] = ring[i];
  const [bx, bz] = ring[(i + 1) % ring.length];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const nx = (bz - az) / len;
  const nz = -(bx - ax) / len;
  const poly = ring.map(([px, pz]) => ({ x: px, z: pz }));
  const flip = inside(poly, (ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3) ? -1 : 1;
  return { x: nx * flip, z: nz * flip, len };
}

function covers(s: SignInfo, x: number, z: number, y0: number, y1: number): boolean {
  const c = Math.cos(s.ry);
  const n = Math.sin(s.ry);
  const du = (x - s.x) * c - (z - s.z) * n;
  const dn = (x - s.x) * n + (z - s.z) * c;
  return Math.abs(du) < s.w / 2 + 0.6 && Math.abs(dn) < 2 && y1 > s.y - s.h / 2 && y0 < s.y + s.h / 2;
}

export interface WindowRows {
  floors: number[];
  h: number;
  w: number;
  step: number;
  lit?: string;
  dark?: string;
  frame?: string;
  minEdge?: number;
  clear?: SignInfo[];
}

export function windowsAlong(site: Site, ring: Pt[], o: WindowRows): void {
  const on = glow(o.lit ?? '#ffd8a0', o.dark ?? '#2b3540', 0.7);
  const off = paint(o.dark ?? '#2b3540');
  for (let i = 0; i < ring.length; i++) {
    const n = outward(ring, i);
    if (n.len < (o.minEdge ?? 4)) continue;
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const count = Math.max(1, Math.floor((n.len - 1) / o.step));
    const ry = Math.atan2(n.x, n.z);
    for (let j = 0; j < count; j++) {
      const t = (j + 0.5) / count;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      o.floors.forEach((fy, f) => {
        if (o.clear?.some((s) => covers(s, px, pz, fy, fy + o.h))) return;
        const lit = (i * 7 + j * 3 + f * 5) % 7 < 3;
        if (o.frame) site.add(paint(o.frame), new THREE.PlaneGeometry(o.w + 0.5, o.h + 0.5), px + n.x * 0.15, fy + o.h / 2, pz + n.z * 0.15, ry);
        site.add(lit ? on : off, new THREE.PlaneGeometry(o.w, o.h), px + n.x * 0.22, fy + o.h / 2, pz + n.z * 0.22, ry);
      });
    }
  }
}

export function gable(site: Site, mat: THREE.Material, len: number, width: number, rise: number, x: number, eave: number, z: number, ry = 0): void {
  const r = width / Math.sqrt(3);
  site.add(mat, facet(new THREE.CylinderGeometry(r, r, len, 3, 1, false, Math.PI / 2)), x, eave + rise / 3, z, ry, 0, Math.PI / 2, rise / (1.5 * r), 1, 1);
}

export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('normal');
  return out;
}
