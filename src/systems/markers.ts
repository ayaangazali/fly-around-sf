import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Game, GameSystem } from '../game';
import type { ActivityDef, ActivityInstance } from '../activities/types';
import type { Vec3 } from '../player/flight';
import type { MinigameInstance, Prop, PropType } from '../activities/minigame';
import { viewfinder } from '../activities/kinds/photo';
import { buildProp, animateProp } from './models/props';

const BEACON_RANGE = 1500;
const CAP = 256;
const RINGS = 96;
const CELL = 128;
const COLS = 8;

const KIND_COLORS: Record<string, string> = {
  rings: '#ff7a3d',
  photo: '#5ad1ff',
  delivery: '#ffc15e',
  landing: '#7de0a6',
  collect: '#ff7ad9',
  follow: '#7aa8ff',
  chase: '#f4f1e8',
  hover: '#b48cff',
};

function kindColor(kind: string): string {
  if (KIND_COLORS[kind]) return KIND_COLORS[kind];
  let h = 0;
  for (const c of kind) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 85%, 68%)`;
}

const BEAM_VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aColor;
attribute vec4 aData;
uniform float uTime;
varying float vH;
varying float vEdge;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 base = modelViewMatrix * vec4(aOffset, 1.0);
  float grow = 1.0 + length(base.xyz) / 320.0;
  vec3 p = vec3(position.x * aData.y * grow, position.y * aData.x, position.z * aData.y * grow);
  vec4 mv = modelViewMatrix * vec4(p + aOffset, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vEdge = abs(dot(n, normalize(-mv.xyz)));
  vH = position.y;
  vColor = aColor;
  vAlpha = aData.z * (0.78 + 0.22 * sin(uTime * 2.2 + aData.w)) * smoothstep(25.0, 90.0, length(base.xz));
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAG = /* glsl */ `
varying float vH;
varying float vEdge;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = vAlpha * pow(1.0 - vH, 1.4) * pow(vEdge, 1.6) * smoothstep(0.0, 0.04, vH);
  gl_FragColor = vec4(vColor * a, a);
}`;

const ICON_VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aColor;
attribute vec4 aData;
uniform float uTime;
uniform float uCols;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  float d = max(1.0, -mv.z);
  float s = clamp(d * 0.085, 6.0, 150.0) * aData.y * (1.0 + 0.05 * sin(uTime * 3.0 + aData.w));
  mv.xy += position.xy * s;
  vec2 cell = vec2(mod(aData.x, uCols), floor(aData.x / uCols));
  vUv = vec2(cell.x + uv.x, uCols - 1.0 - cell.y + uv.y) / uCols;
  vAlpha = aData.z;
  gl_Position = projectionMatrix * mv;
}`;

const ICON_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.02) discard;
  gl_FragColor = vec4(t.rgb, t.a * vAlpha);
}`;

const PORTAL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.55, r) * (0.12 + 0.1 * sin(uTime * 4.0 - r * 9.0)) + smoothstep(0.75, 0.98, r) * smoothstep(1.0, 0.97, r) * 0.5;
  gl_FragColor = vec4(uColor * a, a);
}`;

interface Batch {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  offset: Float32Array;
  color: Float32Array;
  data: Float32Array;
  n: number;
}

function batch(geo: THREE.BufferGeometry, vert: string, frag: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending): Batch {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  g.setAttribute('position', geo.getAttribute('position'));
  g.setAttribute('normal', geo.getAttribute('normal'));
  g.setAttribute('uv', geo.getAttribute('uv'));
  const offset = new Float32Array(CAP * 3);
  const color = new Float32Array(CAP * 3);
  const data = new Float32Array(CAP * 4);
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, blending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, offset, color, data, n: 0 };
}

const tmpColor = new THREE.Color();

function push(b: Batch, x: number, y: number, z: number, color: string, d0: number, d1: number, d2: number, d3: number): void {
  if (b.n >= CAP) return;
  const i = b.n++;
  b.offset[i * 3] = x;
  b.offset[i * 3 + 1] = y;
  b.offset[i * 3 + 2] = z;
  tmpColor.set(color);
  b.color[i * 3] = tmpColor.r;
  b.color[i * 3 + 1] = tmpColor.g;
  b.color[i * 3 + 2] = tmpColor.b;
  b.data.set([d0, d1, d2, d3], i * 4);
}

function commit(b: Batch): void {
  const g = b.mesh.geometry;
  g.instanceCount = b.n;
  for (const name of ['aOffset', 'aColor', 'aData']) (g.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
}

function atlas(kinds: string[], icons: Record<string, string>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL * COLS;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  kinds.forEach((k, i) => {
    const cx = (i % COLS) * CELL + CELL / 2;
    const cy = Math.floor(i / COLS) * CELL + CELL / 2;
    const color = kindColor(k);
    const glow = ctx.createRadialGradient(cx, cy, CELL * 0.18, cx, cy, CELL * 0.5);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = glow;
    ctx.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14, 19, 26, 0.88)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.font = `${CELL * 0.36}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(icons[k] ?? '•', cx, cy + 2);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function arrowGeometry(): THREE.BufferGeometry {
  const head = new THREE.ConeGeometry(0.62, 1.3, 20).translate(0, 0.65, 0);
  const shaft = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 14).translate(0, -0.65, 0);
  const g = mergeGeometries([head, shaft]);
  g.rotateX(Math.PI / 2);
  return g;
}

interface State {
  root: THREE.Group;
  beams: Batch;
  icons: Batch;
  cells: Map<string, number>;
  uniforms: { uTime: THREE.IUniform<number>; uCols: THREE.IUniform<number> };
  rings: THREE.InstancedMesh;
  portal: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  diamond: THREE.Mesh;
  arrow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  pool: Map<PropType, THREE.Object3D[]>;
  used: Map<PropType, number>;
  ringPts: Vec3[];
  ringQuats: THREE.Quaternion[];
  ringRadius: number;
  ringsLeft: number;
  activeId: string;
  target: Vec3 | null;
  waypoint: Game['waypoint'];
  refresh: number;
  time: number;
}

let st: State;
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const sc = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const NEXT = new THREE.Color('#ff8a3d');
const SOON = new THREE.Color('#ffe2c4');
const LATER = new THREE.Color('#8fa3b5');
const MOVING = new Set(['follow', 'chase']);

function beaconDefs(game: Game): { def: ActivityDef; done: boolean }[] {
  const p = game.flight.pos;
  const out: { def: ActivityDef; done: boolean }[] = [];
  for (const def of game.activities.list()) {
    const kind = game.activities.kinds.get(def.kind);
    if (!kind || kind.passive || game.activities.locked(def)) continue;
    const done = game.save.isDone(def.id);
    if (def.hidden && !done) continue;
    const q = game.activities.position(def);
    if (Math.hypot(q.x - p.x, q.z - p.z) <= BEACON_RANGE) out.push({ def, done });
  }
  return out;
}

function rebuildBeacons(game: Game): void {
  const { beams, icons, cells } = st;
  beams.n = icons.n = 0;
  const a = game.activities.active;
  const t = st.target;
  if (a && t && a.def.kind !== 'rings' && !MOVING.has(a.def.kind)) {
    const base = game.world.groundAt(t.x, t.z);
    push(beams, t.x, Math.min(base, t.y - 2), t.z, kindColor(a.def.kind), Math.max(0, t.y - base) + 160, 2.6, 0.75, 0);
  }
  if (!a) {
    for (const { def, done } of beaconDefs(game)) {
      const q = game.activities.position(def);
      const base = game.world.groundAt(q.x, q.z);
      const color = kindColor(def.kind);
      const phase = (q.x * 0.013 + q.z * 0.007) % 6.28;
      push(beams, q.x, base, q.z, color, q.y - base + (done ? 40 : 140), done ? 1.2 : 2.4, done ? 0.25 : 0.95, phase);
      push(icons, q.x, q.y + 5, q.z, color, cells.get(def.kind) ?? 0, done ? 0.6 : 1, done ? 0.5 : 1, phase);
    }
  }
  const w = game.waypoint;
  if (w && (!a || !t)) {
    push(beams, w.x, game.world.groundAt(w.x, w.z), w.z, '#4fe3ff', Math.max(60, w.y - game.world.groundAt(w.x, w.z) + 140), 3, 0.7, 0);
    push(icons, w.x, w.y + 6, w.z, '#4fe3ff', cells.get('waypoint') ?? 0, 1.2, 1, 0);
  }
}

function startRings(game: Game, inst: ActivityInstance, def: ActivityDef): void {
  const pts = (inst.targets?.() ?? []).map((p) => ({ ...p }));
  st.ringPts = pts;
  st.ringRadius = (def.params?.radius as number | undefined) ?? 14;
  const start = game.flight.pos;
  st.ringQuats = pts.map((p, i) => {
    const a = i > 0 ? pts[i - 1] : start;
    const b = pts[i + 1] ?? p;
    v1.set(p.x - a.x, p.y - a.y, p.z - a.z).normalize();
    v2.set(b.x - p.x, b.y - p.y, b.z - p.z);
    if (v2.lengthSq() > 1e-6) v1.add(v2.normalize());
    if (v1.lengthSq() < 1e-6) v1.set(0, 0, 1);
    return new THREE.Quaternion().setFromUnitVectors(Z, v1.normalize());
  });
  st.ringsLeft = -1;
}

function layoutRings(left: number): void {
  const { rings, ringPts, ringQuats, ringRadius } = st;
  const first = ringPts.length - left;
  rings.count = Math.min(RINGS, left);
  for (let i = 0; i < rings.count; i++) {
    const p = ringPts[first + i];
    sc.setScalar(ringRadius);
    m4.compose(v1.set(p.x, p.y, p.z), ringQuats[first + i], sc);
    rings.setMatrixAt(i, m4);
    rings.setColorAt(i, i === 0 ? NEXT : i === 1 ? SOON : LATER);
  }
  rings.instanceMatrix.needsUpdate = true;
  if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  st.ringsLeft = left;
  st.portal.visible = left > 0;
  if (left > 0) {
    const p = ringPts[first];
    st.portal.position.set(p.x, p.y, p.z);
    st.portal.quaternion.copy(ringQuats[first]);
    st.portal.scale.setScalar(ringRadius * 0.97);
  }
}

function placeProps(props: readonly Prop[]): void {
  for (const k of st.used.keys()) st.used.set(k, 0);
  for (const pr of props) {
    const show = pr.on || pr.type === 'pad' || pr.type === 'zone';
    if (!show) continue;
    let list = st.pool.get(pr.type);
    if (!list) st.pool.set(pr.type, (list = []));
    const n = st.used.get(pr.type) ?? 0;
    let obj = list[n];
    if (!obj) {
      obj = buildProp(pr.type);
      list.push(obj);
      st.root.add(obj);
    }
    st.used.set(pr.type, n + 1);
    obj.visible = true;
    obj.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
    obj.rotation.set(0, pr.yaw, 0);
    obj.scale.setScalar(pr.scale);
    animateProp(obj, st.time, pr.on);
  }
  for (const [k, list] of st.pool) {
    const n = st.used.get(k) ?? 0;
    for (let i = n; i < list.length; i++) list[i].visible = false;
  }
}

function guide(game: Game, target: Vec3 | null): void {
  const { arrow } = st;
  const f = game.flight;
  if (!target || viewfinder.open) {
    arrow.visible = false;
    return;
  }
  const dx = target.x - f.pos.x;
  const dz = target.z - f.pos.z;
  const h = Math.hypot(dx, dz);
  const d = Math.hypot(h, target.y - f.pos.y);
  const off = Math.atan2(-dx, -dz) - f.yaw;
  const turn = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
  const ahead = Math.max(turn / 0.35, Math.abs(Math.atan2(target.y - f.pos.y, h)) / 0.26);
  const opacity = Math.min(0.9, (d - 25) / 50, (ahead - 0.7) / 0.6);
  arrow.visible = opacity > 0.02;
  if (!arrow.visible) return;
  arrow.position.set(f.pos.x - Math.sin(f.yaw) * 5, f.pos.y + 2.4, f.pos.z - Math.cos(f.yaw) * 5);
  arrow.lookAt(target.x, target.y, target.z);
  arrow.material.opacity = opacity;
}

export const system: GameSystem = {
  id: 'markers',
  order: 30,
  init(game) {
    const kinds = [...game.activities.kinds.values()].filter((k) => !k.passive);
    const names = [...kinds.map((k) => k.kind), 'waypoint'];
    const icons: Record<string, string> = Object.fromEntries(kinds.map((k) => [k.kind, k.icon]));
    icons.waypoint = '📍';
    const uniforms = { uTime: { value: 0 }, uCols: { value: COLS }, uAtlas: { value: atlas(names, icons) } };
    const root = new THREE.Group();
    root.name = 'markers';
    const beams = batch(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0), BEAM_VERT, BEAM_FRAG, uniforms, THREE.AdditiveBlending);
    const icons2 = batch(new THREE.PlaneGeometry(1, 1), ICON_VERT, ICON_FRAG, uniforms, THREE.NormalBlending);
    icons2.mesh.renderOrder = 5;
    const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.075, 12, 64), new THREE.MeshBasicMaterial({ toneMapped: false }), RINGS);
    rings.count = 0;
    rings.frustumCulled = false;
    rings.setColorAt(0, NEXT);
    const portal = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#ff9a52') }, uTime: uniforms.uTime },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: PORTAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    portal.visible = false;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(2.2), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.92 }));
    diamond.visible = false;
    const arrow = new THREE.Mesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: '#ffb25e', toneMapped: false, transparent: true, opacity: 0.9 }));
    arrow.renderOrder = 10;
    arrow.visible = false;
    beams.mesh.name = 'beacon-beams';
    icons2.mesh.name = 'beacon-icons';
    rings.name = 'ring-targets';
    diamond.name = 'target-marker';
    arrow.name = 'guide-arrow';
    root.add(beams.mesh, icons2.mesh, rings, portal, diamond, arrow);
    game.scene.add(root);
    const cells = new Map(names.map((n, i) => [n, i]));
    st = { root, beams, icons: icons2, cells, uniforms, rings, portal, diamond, arrow, pool: new Map(), used: new Map(), ringPts: [], ringQuats: [], ringRadius: 14, ringsLeft: -1, activeId: '', target: null, waypoint: null, refresh: 0, time: 0 };
    const soon = () => void (st.refresh = 0);
    game.bus.on('activity:start', soon);
    game.bus.on('activity:complete', soon);
    game.bus.on('activity:fail', soon);
    game.save.onChange(soon);
  },
  update(dt, game) {
    st.time += dt;
    st.uniforms.uTime.value = st.time;
    const a = game.activities.active;
    const id = a?.def.id ?? '';
    if (id !== st.activeId) {
      st.activeId = id;
      st.refresh = 0;
      st.ringPts = [];
      if (a?.def.kind === 'rings') startRings(game, a.inst, a.def);
      if (a) (st.diamond.material as THREE.MeshBasicMaterial).color.set(kindColor(a.def.kind));
    }
    const targets = a?.inst.targets?.() ?? [];
    const t0 = targets[0] ?? null;
    if (t0 !== st.target || game.waypoint !== st.waypoint) {
      st.target = t0;
      st.waypoint = game.waypoint;
      st.refresh = 0;
    }
    if ((st.refresh -= dt) <= 0) {
      st.refresh = 0.5;
      rebuildBeacons(game);
      commit(st.beams);
      commit(st.icons);
    }
    if (a?.def.kind === 'rings') {
      if (targets.length !== st.ringsLeft) layoutRings(targets.length);
      if (targets.length) {
        const p = targets[0];
        sc.setScalar(st.ringRadius * (1 + 0.05 * Math.sin(st.time * 5)));
        st.rings.setMatrixAt(0, m4.compose(v1.set(p.x, p.y, p.z), st.ringQuats[st.ringPts.length - targets.length], sc));
        st.rings.instanceMatrix.needsUpdate = true;
      }
    } else if (st.rings.count) layoutRings(0);
    st.diamond.visible = !!t0 && a?.def.kind !== 'rings';
    if (t0 && st.diamond.visible) {
      const moving = MOVING.has(a?.def.kind ?? '');
      st.diamond.position.set(t0.x, t0.y + (moving ? 5 : 4) + Math.sin(st.time * 2.4) * 0.6, t0.z);
      st.diamond.scale.set(moving ? 0.5 : 1, moving ? 0.75 : 1.5, moving ? 0.5 : 1);
      st.diamond.rotation.y = st.time * 1.6;
    }
    const w = game.waypoint;
    guide(game, t0 ?? (w ? v2.set(w.x, w.y, w.z) : null));
    placeProps((a?.inst as MinigameInstance | undefined)?.props?.() ?? []);
  },
};
