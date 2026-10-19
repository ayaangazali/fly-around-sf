import type { ActivityKind, GeoPoint } from '../types';
import type { Game } from '../../game';
import { FLIGHT } from '../../player/flight';
import { clock, isGeo, medalFor, meters, prop, report, validateTimed, type Medals, type MinigameInstance } from '../minigame';

interface LandingParams {
  pad: GeoPoint & { name: string };
  maxSpeed?: number;
  padRadius?: number;
  timeLimit: number;
  medals?: Medals;
}

const TOUCH = 0.6;
const CONTACT = 0.15;
const CUSHION = 3;
const CUSHION_DRAG = 6;

export function airspeed(game: Game): number {
  const v = game.flight.vel;
  const w = game.env.wind ?? { x: 0, z: 0 };
  return Math.hypot(v.x - w.x, v.y, v.z - w.z);
}

export const kind: ActivityKind = {
  kind: 'landing',
  label: 'Precision Landing',
  icon: '🛬',
  validate(def) {
    const p = def.params as Partial<LandingParams> | undefined;
    const errors: string[] = [];
    if (!isGeo(p?.pad) || typeof p.pad.name !== 'string') errors.push('params.pad needs lat, lon and name');
    if (p?.maxSpeed !== undefined && !(p.maxSpeed > 0.5 && p.maxSpeed <= 10)) errors.push('params.maxSpeed must be 0.5..10 m/s');
    if (p?.padRadius !== undefined && !(p.padRadius >= 2 && p.padRadius <= 15)) errors.push('params.padRadius must be 2..15');
    validateTimed(p, errors);
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = def.params as unknown as LandingParams;
    const max = p.maxSpeed ?? 3;
    const radius = p.padRadius ?? 5;
    const { x, z } = game.world.toLocal(p.pad.lat, p.pad.lon);
    const pad = { x, y: game.world.groundAt(x, z), z };
    const marker = { x, y: pad.y + 3, z };
    const pads = [prop('pad', pad, 0, radius)];
    let t = 0;
    let last = airspeed(game);
    return {
      update(dt) {
        t += dt;
        const f = game.flight;
        const h = Math.hypot(f.pos.x - pad.x, f.pos.z - pad.z);
        pads[0].on = h < radius * 6;
        const above = f.pos.y - pad.y - FLIGHT.radius;
        if (h <= radius * 1.5 && above < CUSHION && f.vel.y < 0) f.vel.y *= Math.exp(-CUSHION_DRAG * (1 - Math.max(0, above) / CUSHION) * dt);
        const v = airspeed(game);
        if (h <= radius && above <= TOUCH) {
          if (above <= CONTACT && last > max) {
            report(game, def, { medal: 0, time: t, fail: `Hard landing at ${last.toFixed(1)} m/s. The limit is ${max} m/s` });
            return 'failed';
          }
          if (v <= max) {
            report(game, def, { medal: medalFor(p.medals, t), time: t, score: `touchdown at ${v.toFixed(1)} m/s` });
            return 'done';
          }
        }
        last = v;
        if (t > p.timeLimit) {
          report(game, def, { medal: 0, time: t, fail: 'Out of time before touchdown' });
          return 'failed';
        }
        return 'running';
      },
      progress: () => 0,
      hud: () => {
        const f = game.flight;
        const h = Math.hypot(f.pos.x - pad.x, f.pos.z - pad.z);
        const v = airspeed(game);
        return `🛬 ${meters(h)} · ${v.toFixed(1)} of ${max} m/s${v > max && h < 40 ? ', slow down' : ''} · ${clock(t, p.timeLimit)}`;
      },
      targets: () => [marker],
      elapsed: () => t,
      props: () => pads,
    };
  },
  solve(def, game) {
    const p = def.params as unknown as LandingParams;
    const { x, z } = game.world.toLocal(p.pad.lat, p.pad.lon);
    return [{ teleport: { x, y: game.world.groundAt(x, z) + FLIGHT.radius + 0.2, z } }, { wait: 0.2 }];
  },
};
