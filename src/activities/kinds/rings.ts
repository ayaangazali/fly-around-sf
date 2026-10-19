import type { GeoPoint, ActivityKind } from '../types';
import type { Vec3 } from '../../player/flight';

interface RingParams {
  rings: GeoPoint[];
  radius?: number;
  timeLimit?: number;
}

export const kind: ActivityKind = {
  kind: 'rings',
  label: 'Ring Run',
  icon: '◎',
  validate(def) {
    const p = def.params as RingParams | undefined;
    const errors: string[] = [];
    if (!p || !Array.isArray(p.rings) || p.rings.length < 2) errors.push('params.rings needs at least 2 points');
    else if (p.rings.some((r) => typeof r.lat !== 'number' || typeof r.lon !== 'number')) errors.push('ring points need lat/lon');
    if (p?.timeLimit !== undefined && !(p.timeLimit > 0)) errors.push('params.timeLimit must be > 0');
    return errors;
  },
  start(def, game) {
    const p = def.params as unknown as RingParams;
    const radius = p.radius ?? 14;
    const pts: Vec3[] = p.rings.map((r) => game.world.point({ alt: 25, ...r }));
    let next = 0;
    let t = 0;
    return {
      update(dt) {
        t += dt;
        const pos = game.flight.pos;
        const target = pts[next];
        if (Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z) <= radius) {
          next++;
          game.bus.emit('toast', { text: `Ring ${next}/${pts.length}`, kind: 'info' });
        }
        if (next >= pts.length) return 'done';
        if (p.timeLimit && t > p.timeLimit) return 'failed';
        return 'running';
      },
      progress: () => next / pts.length,
      hud: () => `${def.title}  ${next}/${pts.length}  ${t.toFixed(1)}s${p.timeLimit ? ` / ${p.timeLimit}s` : ''}`,
      targets: () => pts.slice(next),
      elapsed: () => t,
    };
  },
  solve(def, game) {
    const p = def.params as unknown as RingParams;
    return p.rings.flatMap((r) => [{ teleport: game.world.point({ alt: 25, ...r }) }, { wait: 0.05 }]);
  },
};
