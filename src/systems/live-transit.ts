import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import { grantCard, liveState, type TransitVehicle } from '../live/state';
import { parseTransit, pointAt, vehiclesAt, type Route, type Vehicle } from '../live/transit';
import { MODELS, type ModelId } from '../live/models';
import { sfTime } from '../live/sf-time';

const TROLLEY = new Set(['1', '5', '14', '22', '30']);
const STREETCAR_LIVERIES = ['#2e6b4f', '#d9822b', '#b8312f', '#e0c45c', '#3d6fa8', '#7a4d8c', '#ece6d6', '#4f8a8b'];
const POWELL_LIVERIES = ['#8e1b20', '#8e1b20', '#8e1b20', '#8e1b20', '#2f5d3a', '#24476e'];
const SPOT = { cable: { id: 'cable-car-spotter', name: 'Cable Car Spotter', r: 25 }, ferry: { id: 'ferry-spotter', name: 'Ferry Spotter', r: 80 } } as const;

export function modelFor(r: Route): ModelId {
  if (r.mode === 'cable') return r.id === 'CA' ? 'california' : 'powell';
  if (r.mode === 'streetcar') return 'streetcar';
  if (r.mode === 'ferry') return r.agency === 'San Francisco Bay Ferry' ? 'catamaran' : 'ferry';
  return TROLLEY.has(r.id) ? 'trolley' : 'bus';
}

function paintFor(r: Route, key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const pick = (list: string[]) => list[Math.abs(h) % list.length];
  if (r.mode === 'cable') return r.id === 'CA' ? '#7a1a1f' : pick(POWELL_LIVERIES);
  if (r.mode === 'streetcar') return pick(STREETCAR_LIVERIES);
  if (r.mode === 'bus') return '#e9ebec';
  return '#f6f4ef';
}

interface Layer {
  paint: THREE.InstancedMesh;
  trim: THREE.InstancedMesh;
  glass: THREE.InstancedMesh;
  wake: THREE.InstancedMesh | null;
  length: number;
  n: number;
  w: number;
}

const layers = new WeakMap<Game, { byModel: Map<ModelId, Layer>; glass: THREE.MeshLambertMaterial }>();
const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ';
const tint = new THREE.Color();

export interface Placed {
  v: Vehicle;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
}

export function place(v: Vehicle, length: number, ground: (x: number, z: number) => number): Placed {
  const front = pointAt(v.shape, v.dist + length / 2);
  const back = pointAt(v.shape, v.dist - length / 2);
  const ferry = v.route.mode === 'ferry';
  const yf = ferry ? 0 : ground(front.x, front.z);
  const yb = ferry ? 0 : ground(back.x, back.z);
  const span = Math.hypot(front.x - back.x, front.z - back.z);
  const heading = span > 0.5 ? Math.atan2(-(front.x - back.x), -(front.z - back.z)) : pointAt(v.shape, v.dist).heading;
  return { v, x: (front.x + back.x) / 2, y: (yf + yb) / 2, z: (front.z + back.z) / 2, heading, pitch: Math.atan2(yf - yb, Math.max(span, 1)) };
}

function build(game: Game, data: ReturnType<typeof parseTransit>) {
  const cap = new Map<ModelId, number>();
  for (const r of data.routes) {
    const id = modelFor(r);
    cap.set(id, (cap.get(id) ?? 0) + 2 * Math.max(...Object.values(r.days).map((d) => d.length)));
  }
  const paint = new THREE.MeshLambertMaterial({ vertexColors: true });
  const trim = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glass = new THREE.MeshLambertMaterial({ color: '#6a8293', emissive: '#ffcf86', emissiveIntensity: 0 });
  const wake = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  const group = new THREE.Group();
  group.name = 'live-transit';
  game.scene.add(group);
  const byModel = new Map<ModelId, Layer>();
  for (const [id, n] of cap) {
    const m = MODELS[id];
    const mk = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(g, mat, n);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const layer = { paint: mk(m.paint, paint), trim: mk(m.trim, trim), glass: mk(m.glass, glass), wake: m.wake ? mk(m.wake, wake) : null, length: m.length, n: 0, w: 0 };
    if (layer.wake) layer.wake.castShadow = false;
    layer.paint.setColorAt(0, tint.set('#ffffff'));
    byModel.set(id, layer);
  }
  layers.set(game, { byModel, glass });
}

export const system: GameSystem = {
  id: 'live-transit',
  order: 24,
  init(game) {
    const s = liveState(game);
    fetch(`${game.opts.base}data/transit.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        s.transit.data = parseTransit(json);
        s.transit.status = 'schedule';
        build(game, s.transit.data);
      })
      .catch(() => (s.transit.status = 'fallback'))
      .finally(() => game.bus.emit('live:status', { id: 'transit', status: s.transit.status }));
  },
  update(_dt, game) {
    const s = liveState(game);
    const L = layers.get(game);
    const data = s.transit.data;
    if (!L || !data || !game.world) return;
    const t = sfTime(game.date());
    for (const layer of L.byModel.values()) layer.n = layer.w = 0;
    const me = game.flight.pos;
    const ground = (x: number, z: number) => game.world.surfaceAt(x, z);
    const placed: TransitVehicle[] = [];
    for (const route of data.routes) {
      const id = modelFor(route);
      const layer = L.byModel.get(id)!;
      for (const v of vehiclesAt(route, t)) {
        const p = place(v, layer.length, ground);
        if (route.mode !== 'ferry' && game.world.city.roofAt(p.x, p.z) > p.y + 8) continue;
        placed.push({ route: route.id, name: route.name, mode: route.mode, x: p.x, y: p.y, z: p.z, heading: p.heading, moving: v.moving });
        dummy.position.set(p.x, p.y + 0.05, p.z);
        dummy.rotation.set(p.pitch, p.heading, 0);
        dummy.updateMatrix();
        const i = layer.n++;
        layer.paint.setMatrixAt(i, dummy.matrix);
        layer.trim.setMatrixAt(i, dummy.matrix);
        layer.glass.setMatrixAt(i, dummy.matrix);
        if (layer.wake && v.moving) layer.wake.setMatrixAt(layer.w++, dummy.matrix);
        layer.paint.setColorAt(i, tint.set(paintFor(route, v.key)));
        const spot = route.mode === 'cable' || route.mode === 'ferry' ? SPOT[route.mode] : null;
        if (spot && s.online && Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z) < spot.r) grantCard(game, spot.id, spot.name);
      }
    }
    s.transit.vehicles = placed;
    for (const layer of L.byModel.values()) {
      for (const m of [layer.paint, layer.trim, layer.glass]) {
        m.count = layer.n;
        m.instanceMatrix.needsUpdate = true;
      }
      if (layer.paint.instanceColor) layer.paint.instanceColor.needsUpdate = true;
      if (layer.wake) {
        layer.wake.count = layer.w;
        layer.wake.instanceMatrix.needsUpdate = true;
      }
    }
    L.glass.emissiveIntensity = (game.sky?.night ?? 0) * 1.1;
  },
};
