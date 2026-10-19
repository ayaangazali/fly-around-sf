import type { ActivityDef, ActivityKind } from '../types';
import type { Game } from '../../game';
import type { Vec3 } from '../../player/flight';
import { PROP_EMOJI, clock, dist3, isRange, medalFor, prop, report, rng, validateTimed, type Medals, type MinigameInstance, type PropType } from '../minigame';

interface CollectParams {
  item: string;
  prop: PropType;
  count: number;
  radius: number;
  alt?: [number, number];
  pickup?: number;
  timeLimit: number;
  medals?: Medals;
}

export function collectPoints(def: ActivityDef, game: Game): Vec3[] {
  const p = def.params as unknown as CollectParams;
  const [lo, hi] = p.alt ?? [12, 45];
  const rand = rng(def.id);
  const c = game.world.toLocal(def.at.lat, def.at.lon);
  return Array.from({ length: p.count }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(0.05 + 0.95 * rand()) * p.radius;
    const x = c.x + Math.cos(a) * d;
    const z = c.z + Math.sin(a) * d;
    const ground = Math.max(game.world.groundAt(x, z), game.world.groundAt(x + 6, z), game.world.groundAt(x - 6, z), game.world.groundAt(x, z + 6), game.world.groundAt(x, z - 6));
    return { x, y: ground + lo + rand() * (hi - lo), z };
  });
}

export const kind: ActivityKind = {
  kind: 'collect',
  label: 'Collect',
  icon: '✨',
  validate(def) {
    const p = def.params as Partial<CollectParams> | undefined;
    const errors: string[] = [];
    if (typeof p?.item !== 'string' || !p.item) errors.push('params.item is required');
    if (typeof p?.prop !== 'string' || !(p.prop in PROP_EMOJI)) errors.push('params.prop must be a known prop');
    if (!(Number.isInteger(p?.count) && (p?.count as number) >= 3 && (p?.count as number) <= 40)) errors.push('params.count must be 3..40');
    if (!(typeof p?.radius === 'number' && p.radius >= 40 && p.radius <= 800)) errors.push('params.radius must be 40..800');
    if (p?.alt !== undefined && !(isRange(p.alt) && p.alt[0] >= 4)) errors.push('params.alt must be [min, max] with min >= 4');
    validateTimed(p, errors);
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = def.params as unknown as CollectParams;
    const reach = p.pickup ?? 7;
    const pts = collectPoints(def, game);
    const props = pts.map((q, i) => prop(p.prop, q, i));
    const remaining = [...pts];
    let got = 0;
    let t = 0;
    return {
      update(dt) {
        t += dt;
        const pos = game.flight.pos;
        for (let i = 0; i < props.length; i++) {
          const it = props[i];
          if (!it.on) continue;
          it.yaw += dt * 1.5;
          it.pos.y = pts[i].y + Math.sin(t * 2 + i) * 0.5;
          if (dist3(pos, pts[i]) <= reach) {
            it.on = false;
            got++;
            remaining.splice(remaining.indexOf(pts[i]), 1);
          }
        }
        remaining.sort((u, v) => dist3(pos, u) - dist3(pos, v));
        if (got >= pts.length) {
          report(game, def, { medal: medalFor(p.medals, t), time: t, score: `${got} ${p.item}` });
          return 'done';
        }
        if (t > p.timeLimit) {
          report(game, def, { medal: 0, time: t, fail: `Only ${got} of ${pts.length} ${p.item} before time ran out` });
          return 'failed';
        }
        return 'running';
      },
      progress: () => got / pts.length,
      hud: () => `${PROP_EMOJI[p.prop]} ${p.item} ${got}/${pts.length}  ${clock(t, p.timeLimit)}`,
      targets: () => remaining,
      elapsed: () => t,
      props: () => props,
    };
  },
  solve(def, game) {
    return collectPoints(def, game).flatMap((q) => [{ teleport: q }, { wait: 0.05 }]);
  },
};
