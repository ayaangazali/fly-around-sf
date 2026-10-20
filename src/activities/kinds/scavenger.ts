import type { ActivityDef, ActivityKind, GeoPoint, SolverStep } from '../types';
import type { Game } from '../../game';
import type { Vec3 } from '../../player/flight';
import { toLocal } from '../../core/geo';
import { NORTON, clock, geoErrors, say, touched, type QuestInstance, type Trend } from '../quest-common';
import { spot } from '../minigame';

export interface Token extends GeoPoint {
  name?: string;
}

export interface ScavengerParams {
  tokens: Token[];
  timeLimit: number;
  radius?: number;
}

const SPREAD = 1500;
const REVEAL = 90;
const HEAT_RANGE = 900;
const TREND_EVERY = 0.75;
const TREND_DELTA = 3;

export function tokenPoints(def: ActivityDef, game: Game): Vec3[] {
  return (def.params as unknown as ScavengerParams).tokens.map((t) => spot(game, t, 4));
}

export function heatOf(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / HEAT_RANGE));
}

export const kind: ActivityKind = {
  kind: 'scavenger',
  label: 'Scavenger Hunt',
  icon: '🪙',
  validate(def) {
    const p = def.params as Partial<ScavengerParams> | undefined;
    const errors: string[] = [];
    if (!p || !Array.isArray(p.tokens) || p.tokens.length < 3 || p.tokens.length > 12) return ['params.tokens needs 3 to 12 points'];
    const home = toLocal(def.at.lat, def.at.lon);
    p.tokens.forEach((t, i) => {
      const e = geoErrors(t, `token ${i + 1}`);
      errors.push(...e);
      if (!e.length) {
        const q = toLocal(t.lat, t.lon);
        if (Math.hypot(q.x - home.x, q.z - home.z) > SPREAD) errors.push(`token ${i + 1} is more than ${SPREAD} m from the start`);
      }
    });
    if (!(typeof p.timeLimit === 'number' && p.timeLimit >= 60 && p.timeLimit <= 1200)) errors.push('params.timeLimit must be 60..1200');
    if (p.radius !== undefined && !(p.radius >= 4 && p.radius <= 40)) errors.push('params.radius must be 4..40');
    return errors;
  },
  start(def, game) {
    const p = def.params as unknown as ScavengerParams;
    const radius = p.radius ?? 12;
    const all = tokenPoints(def, game);
    let left = all.map((q, i) => ({ q, name: p.tokens[i].name }));
    let t = 0;
    let nearest = Infinity;
    let sampleAt = 0;
    let last = Infinity;
    let trend: Trend = 'steady';
    let got = 0;
    const n = all.length;
    say(game, def.id, NORTON, [`${n} Imperial notes are loose around ${def.neighborhood}, and the Treasury wants every one back within ${clock(p.timeLimit)}. Watch the pulse: it beats faster as you get warmer.`]);
    game.bus.emit('quest:objective', { id: def.id, title: def.title, text: `Find ${n} glowing Imperial notes hidden around ${def.neighborhood}. They only shine when you are close.`, icon: kind.icon });
    const inst: QuestInstance = {
      update(dt) {
        t += dt;
        const pos = game.flight.pos;
        const before = left.length;
        left = left.filter((k) => {
          if (!touched(pos, k.q, radius)) return true;
          got++;
          game.bus.emit('toast', { text: `🪙 Note ${got}/${n}${k.name ? ` · ${k.name}` : ''}`, kind: 'info' });
          return false;
        });
        if (!left.length) return 'done';
        nearest = Math.min(...left.map((k) => Math.hypot(pos.x - k.q.x, pos.z - k.q.z)));
        if (left.length < before) last = nearest;
        if (t >= sampleAt) {
          sampleAt = t + TREND_EVERY;
          trend = !Number.isFinite(last) || Math.abs(nearest - last) < TREND_DELTA ? 'steady' : nearest < last ? 'warmer' : 'colder';
          last = nearest;
        }
        return t > p.timeLimit ? 'failed' : 'running';
      },
      progress: () => got / n,
      hud: () => `🪙 ${def.title}  ${got}/${n} · ${clock(p.timeLimit - t)} left${trend === 'steady' ? '' : ` · ${trend}`}`,
      markers() {
        const pos = game.flight.pos;
        return left.filter((k) => Math.hypot(pos.x - k.q.x, pos.z - k.q.z) < REVEAL).map((k) => ({ p: k.q, style: 'token' as const }));
      },
      targets: () => inst.markers().map((m) => m.p),
      heat: () => (left.length ? heatOf(nearest) : 1),
      trend: () => trend,
      elapsed: () => t,
    };
    return inst;
  },
  solve(def, game) {
    return tokenPoints(def, game).flatMap((q): SolverStep[] => [{ teleport: q }, { wait: 0.05 }]);
  },
};
