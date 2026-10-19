import type { ActivityKind, GeoPoint, SolverStep } from '../types';
import { clock, dist3, isGeo, medalFor, prop, report, rng, validateTimed, type Medals, type MinigameInstance } from '../minigame';

interface HoverParams {
  spot: GeoPoint & { name: string };
  hold: number;
  tolerance?: number;
  gust?: number;
  timeLimit: number;
  medals?: Medals;
}

export function gust(t: number, ph: number[], strength: number): { x: number; y: number; z: number } {
  const w = (a: number) => Math.sin(t * 0.83 + a) * 0.6 + Math.sin(t * 2.1 + a * 1.7) * 0.3 + Math.sin(t * 4.7 + a * 2.3) * 0.1;
  return { x: w(ph[0]) * strength, y: w(ph[1]) * strength * 0.25, z: w(ph[2]) * strength };
}

export const kind: ActivityKind = {
  kind: 'hover',
  label: 'Hover Hold',
  icon: '🌀',
  validate(def) {
    const p = def.params as Partial<HoverParams> | undefined;
    const errors: string[] = [];
    if (!isGeo(p?.spot) || typeof p.spot.name !== 'string') errors.push('params.spot needs lat, lon and name');
    if (!(typeof p?.hold === 'number' && p.hold >= 3 && p.hold <= 60)) errors.push('params.hold must be 3..60 seconds');
    if (p?.tolerance !== undefined && !(p.tolerance >= 1.5 && p.tolerance <= 15)) errors.push('params.tolerance must be 1.5..15');
    if (p?.gust !== undefined && !(p.gust >= 0 && p.gust <= 12)) errors.push('params.gust must be 0..12');
    validateTimed(p, errors);
    if (typeof p?.hold === 'number' && typeof p.timeLimit === 'number' && p.timeLimit <= p.hold) errors.push('params.timeLimit must exceed hold');
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = def.params as unknown as HoverParams;
    const tol = p.tolerance ?? 4;
    const strength = p.gust ?? 5;
    const rand = rng(def.id);
    const ph = [rand() * 6, rand() * 6, rand() * 6];
    const spot = game.world.point(p.spot, 40);
    const zone = prop('zone', spot, 0, tol);
    const props = [zone];
    let t = 0;
    let held = 0;
    return {
      update(dt) {
        t += dt;
        const f = game.flight;
        const d = dist3(f.pos, spot);
        if (d < 80) {
          const g = gust(t, ph, strength);
          f.vel.x += g.x * dt;
          f.vel.y += g.y * dt;
          f.vel.z += g.z * dt;
        }
        zone.on = d <= tol;
        held = zone.on ? held + dt : Math.max(0, held - dt);
        zone.yaw += dt * (zone.on ? 1.5 : 0.4);
        if (held >= p.hold) {
          report(game, def, { medal: medalFor(p.medals, t), time: t, score: `held ${p.hold}s` });
          return 'done';
        }
        if (t > p.timeLimit) {
          report(game, def, { medal: 0, time: t, fail: `The wind won. You held ${held.toFixed(1)} of ${p.hold}s` });
          return 'failed';
        }
        return 'running';
      },
      progress: () => held / p.hold,
      hud: () => `🌀 ${p.spot.name}  hold ${held.toFixed(1)}/${p.hold}s  ·  ${dist3(game.flight.pos, spot).toFixed(1)} m (within ${tol})  ${clock(t, p.timeLimit)}`,
      targets: () => [spot],
      elapsed: () => t,
      props: () => props,
    };
  },
  solve(def, game) {
    const p = def.params as unknown as HoverParams;
    const spot = game.world.point(p.spot, 40);
    const steps: SolverStep[] = [];
    for (let s = 0; s < p.hold * 1.5 + 2; s += 0.25) steps.push({ teleport: spot }, { wait: 0.25 });
    return steps;
  },
};
