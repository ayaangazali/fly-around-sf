import * as THREE from 'three';
import type { ActivityKind, SolverStep } from '../types';
import type { Game } from '../../game';
import { toLocal } from '../../core/geo';
import { MODELS, type ModelId } from '../../live/models';

interface RideParams {
  path: [number, number][];
  speed: number;
  model: ModelId;
  paint?: string;
  radius?: number;
}

const GRACE = 4;
const CEILING = 45;

export interface Track {
  x: number[];
  z: number[];
  d: number[];
  length: number;
}

export function track(path: [number, number][]): Track {
  const t: Track = { x: [], z: [], d: [], length: 0 };
  for (const [lat, lon] of path) {
    const p = toLocal(lat, lon);
    const n = t.x.length;
    t.d.push(n ? t.d[n - 1] + Math.hypot(p.x - t.x[n - 1], p.z - t.z[n - 1]) : 0);
    t.x.push(p.x);
    t.z.push(p.z);
  }
  t.length = t.d[t.d.length - 1];
  return t;
}

export function along(t: Track, dist: number): { x: number; z: number } {
  const d = Math.min(t.length, Math.max(0, dist));
  let i = 1;
  while (i < t.d.length - 1 && t.d[i] < d) i++;
  const k = (d - t.d[i - 1]) / (t.d[i] - t.d[i - 1] || 1);
  return { x: t.x[i - 1] + (t.x[i] - t.x[i - 1]) * k, z: t.z[i - 1] + (t.z[i] - t.z[i - 1]) * k };
}

function vehicle(id: ModelId, paint: string): THREE.Group {
  const m = MODELS[id];
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const body = new THREE.MeshLambertMaterial({ vertexColors: true, color: paint });
  const trim = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glass = new THREE.MeshLambertMaterial({ color: '#6a8293', emissive: '#ffcf86', emissiveIntensity: 0.4 });
  g.add(new THREE.Mesh(m.paint, body), new THREE.Mesh(m.trim, trim), new THREE.Mesh(m.glass, glass));
  if (m.wake) g.add(new THREE.Mesh(m.wake, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })));
  for (const c of g.children) c.castShadow = true;
  g.name = 'ride-along-vehicle';
  return g;
}

export const kind: ActivityKind = {
  kind: 'ride-along',
  label: 'Ride Along',
  icon: '🚋',
  validate(def) {
    const p = def.params as Partial<RideParams> | undefined;
    const errors: string[] = [];
    if (!p || !Array.isArray(p.path) || p.path.length < 2) errors.push('params.path needs at least 2 [lat, lon] points');
    else if (p.path.some((q) => !Array.isArray(q) || q.length !== 2 || !q.every(Number.isFinite))) errors.push('params.path points must be [lat, lon]');
    if (!(typeof p?.speed === 'number' && p.speed > 0 && p.speed <= 30)) errors.push('params.speed must be 0..30 m/s');
    if (!p?.model || !(p.model in MODELS)) errors.push('params.model must be a vehicle model');
    if (p?.radius !== undefined && !(p.radius >= 8 && p.radius <= 120)) errors.push('params.radius must be 8..120');
    return errors;
  },
  start(def, game) {
    const p = def.params as unknown as RideParams;
    const t = track(p.path);
    const radius = p.radius ?? 22;
    const water = MODELS[p.model].wake !== undefined;
    const mesh = vehicle(p.model, p.paint ?? '#ffffff');
    game.scene.add(mesh);
    const ground = (x: number, z: number) => (water ? 0 : game.world.surfaceAt(x, z));
    const half = MODELS[p.model].length / 2;
    let time = 0;
    let away = 0;
    let dist = 0;
    let close = true;
    const place = () => {
      const f = along(t, dist + half);
      const b = along(t, dist - half);
      const yf = ground(f.x, f.z);
      const yb = ground(b.x, b.z);
      mesh.position.set((f.x + b.x) / 2, (yf + yb) / 2 + 0.05, (f.z + b.z) / 2);
      mesh.rotation.set(Math.atan2(yf - yb, Math.max(1, Math.hypot(f.x - b.x, f.z - b.z))), Math.atan2(-(f.x - b.x), -(f.z - b.z)), 0);
    };
    place();
    return {
      update(dt) {
        time += dt;
        dist = Math.min(t.length, dist + p.speed * dt);
        place();
        const me = game.flight.pos;
        const v = mesh.position;
        const dy = me.y - v.y;
        close = Math.hypot(me.x - v.x, me.z - v.z) <= radius && dy > -2 && dy < CEILING;
        away = close ? Math.max(0, away - dt * 2) : away + dt;
        if (away > GRACE) return 'failed';
        return dist >= t.length && close ? 'done' : 'running';
      },
      progress: () => dist / t.length,
      hud: () => `${def.title} · ${Math.round((dist / t.length) * 100)}% · ${close ? 'right on its tail' : `catch up! ${Math.max(0, GRACE - away).toFixed(1)}s`}`,
      targets: () => [{ x: mesh.position.x, y: mesh.position.y + 8, z: mesh.position.z }],
      elapsed: () => time,
      dispose: () => {
        game.scene.remove(mesh);
        mesh.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
      },
    };
  },
  solve(def) {
    const p = def.params as unknown as RideParams;
    const steps = Math.ceil(track(p.path).length / p.speed / 0.5) + 6;
    const follow = (g: Game) => {
      const target = g.activities.active?.inst.targets?.()[0];
      if (target) g.teleport({ x: target.x, y: target.y - 2, z: target.z });
    };
    return Array.from({ length: steps }, (): SolverStep[] => [{ call: follow }, { wait: 0.5 }]).flat();
  },
};
