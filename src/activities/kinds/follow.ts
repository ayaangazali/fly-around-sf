import type { ActivityDef, ActivityKind, GeoPoint, SolverStep } from '../types';
import type { Game } from '../../game';
import type { Vec3 } from '../../player/flight';
import { PROP_EMOJI, clock, dist3, isGeo, meters, prop, report, type MinigameInstance, type PropType } from '../minigame';

interface FollowParams {
  route: GeoPoint[];
  speed: number;
  vehicle: PropType;
  name: string;
  distance?: number;
  grace?: number;
  alt?: number;
  lead?: number;
}

export interface Route {
  pts: { x: number; z: number }[];
  cum: number[];
  length: number;
}

export function buildRoute(game: Game, route: GeoPoint[]): Route {
  const pts = route.map((g) => game.world.toLocal(g.lat, g.lon));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, length: cum[cum.length - 1] };
}

export function along(r: Route, s: number, out: { x: number; z: number; yaw: number }): void {
  let i = 1;
  while (i < r.pts.length - 1 && r.cum[i] < s) i++;
  const a = r.pts[i - 1];
  const b = r.pts[i];
  const seg = r.cum[i] - r.cum[i - 1] || 1;
  const k = Math.max(0, Math.min(1, (s - r.cum[i - 1]) / seg));
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
  out.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

function params(def: ActivityDef): FollowParams {
  return def.params as unknown as FollowParams;
}

export const kind: ActivityKind = {
  kind: 'follow',
  label: 'Follow',
  icon: '🛤️',
  validate(def) {
    const p = def.params as Partial<FollowParams> | undefined;
    const errors: string[] = [];
    if (!Array.isArray(p?.route) || p.route.length < 2 || !p.route.every(isGeo)) errors.push('params.route needs at least 2 lat/lon points');
    if (!(typeof p?.speed === 'number' && p.speed > 0 && p.speed <= 60)) errors.push('params.speed must be 0..60 m/s');
    if (typeof p?.vehicle !== 'string' || !(p.vehicle in PROP_EMOJI)) errors.push('params.vehicle must be a known prop');
    if (typeof p?.name !== 'string' || !p.name) errors.push('params.name is required');
    if (p?.distance !== undefined && !(p.distance >= 15 && p.distance <= 200)) errors.push('params.distance must be 15..200');
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = params(def);
    const route = buildRoute(game, p.route);
    const max = p.distance ?? 45;
    const grace = p.grace ?? 4;
    const lead = p.lead ?? 3;
    const duration = route.length / p.speed;
    const at = { x: 0, z: 0, yaw: 0 };
    const vehicle = prop(p.vehicle, { x: 0, y: 0, z: 0 });
    const props = [vehicle];
    const center: Vec3 = { x: 0, y: 0, z: 0 };
    const place = (t: number) => {
      along(route, Math.max(0, t - lead) * p.speed, at);
      vehicle.pos.x = center.x = at.x;
      vehicle.pos.z = center.z = at.z;
      vehicle.pos.y = game.world.surfaceAt(at.x, at.z) + (p.alt ?? 0);
      center.y = vehicle.pos.y + 3;
      vehicle.yaw = at.yaw;
    };
    let t = 0;
    let away = 0;
    let tight = 0;
    place(0);
    return {
      update(dt) {
        t += dt;
        place(t);
        if (t <= lead) return 'running';
        const d = dist3(game.flight.pos, center);
        away = d > max ? away + dt : 0;
        if (d <= max / 2) tight += dt;
        if (away > grace) {
          report(game, def, { medal: 0, time: t, fail: `You lost the ${p.name}` });
          return 'failed';
        }
        if (t - lead >= duration) {
          const frac = Math.min(1, tight / duration);
          report(game, def, { medal: frac >= 0.75 ? 3 : frac >= 0.45 ? 2 : 1, time: t, score: `${Math.round(frac * 100)}% in close formation` });
          return 'done';
        }
        return 'running';
      },
      progress: () => Math.min(1, Math.max(0, t - lead) / duration),
      hud: () => {
        const head = PROP_EMOJI[p.vehicle];
        if (t <= lead) return `${head} ${p.name} starts in ${Math.ceil(lead - t)}`;
        const d = dist3(game.flight.pos, center);
        return `${head} ${meters(d)}${away > 0 ? ` · too far, ${Math.ceil(grace - away)}s to catch up` : ''} · ${clock(t - lead, duration)}`;
      },
      targets: () => [center],
      elapsed: () => t,
      props: () => props,
    };
  },
  solve(def, game) {
    const p = params(def);
    const total = (p.lead ?? 3) + buildRoute(game, p.route).length / p.speed;
    const steps: SolverStep[] = [];
    for (let s = 0; s < total + 2; s += 0.5) {
      steps.push({ call: (g) => chaseTarget(g, 6) }, { wait: 0.5 });
    }
    return steps;
  },
};

export function chaseTarget(g: Game, above: number): void {
  const t = g.activities.active?.inst.targets?.()[0];
  if (t) g.teleport({ x: t.x, y: t.y + above, z: t.z });
}
