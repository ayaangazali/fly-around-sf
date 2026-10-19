import type { ActivityKind, GeoPoint } from '../types';
import { FLIGHT } from '../../player/flight';
import { clock, isGeo, medalFor, meters, prop, report, validateTimed, type Medals, type MinigameInstance } from '../minigame';

interface LandingParams {
  pad: GeoPoint & { name: string };
  maxSpeed?: number;
  padRadius?: number;
  timeLimit: number;
  medals?: Medals;
}

const TOUCH = FLIGHT.radius + 0.6;

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
    let last = game.flight.speed;
    return {
      update(dt) {
        t += dt;
        const f = game.flight;
        const h = Math.hypot(f.pos.x - pad.x, f.pos.z - pad.z);
        pads[0].on = h < radius * 6;
        if (h <= radius && f.pos.y - pad.y <= TOUCH) {
          if (last > max) {
            report(game, def, { medal: 0, time: t, fail: `Hard landing at ${last.toFixed(1)} m/s. The limit is ${max} m/s` });
            return 'failed';
          }
          report(game, def, { medal: medalFor(p.medals, t), time: t, score: `touchdown at ${last.toFixed(1)} m/s` });
          return 'done';
        }
        last = f.speed;
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
        const fast = f.speed > max && h < 40;
        return `🛬 ${p.pad.name}  ${meters(h)}  ·  ${f.speed.toFixed(1)} m/s${fast ? ' slow down' : ''} (max ${max})  ${clock(t, p.timeLimit)}`;
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
