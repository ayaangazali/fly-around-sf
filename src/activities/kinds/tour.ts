import type { ActivityKind, GeoPoint } from '../types';
import type { Vec3 } from '../../player/flight';
import { inBounds } from '../../core/geo';
import { showTour } from '../../ui/places-views';

export interface TourStop extends GeoPoint {
  name: string;
  line: string;
}

export interface TourParams {
  stops: TourStop[];
  radius?: number;
}

const ALT = 45;
const LOST_AFTER = 45;
const WARN_AFTER = 30;

export const kind: ActivityKind = {
  kind: 'tour',
  label: 'Guided Tour',
  icon: '🧭',
  validate(def) {
    const p = def.params as Partial<TourParams> | undefined;
    const errors: string[] = [];
    const stops = p?.stops;
    if (!Array.isArray(stops) || stops.length < 4 || stops.length > 6) return ['params.stops needs 4 to 6 stops'];
    stops.forEach((s, i) => {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number' || !inBounds(s.lat, s.lon)) errors.push(`stop ${i + 1} needs lat/lon inside SF`);
      if (typeof s.name !== 'string' || s.name.length < 3) errors.push(`stop ${i + 1} needs a name`);
      if (typeof s.line !== 'string' || s.line.length < 20 || s.line.length > 220) errors.push(`stop ${i + 1} narration must be 20..220 characters`);
    });
    if (p?.radius !== undefined && !(p.radius >= 15 && p.radius <= 200)) errors.push('params.radius must be 15..200');
    return errors;
  },
  start(def, game) {
    const p = def.params as unknown as TourParams;
    const radius = p.radius ?? 50;
    const pts: Vec3[] = p.stops.map((s) => game.world.point({ alt: ALT, ...s }));
    const view = showTour(game, def, p.stops);
    let next = 0;
    let t = 0;
    let best = Infinity;
    let stall = 0;
    const guide = () => {
      const s = p.stops[next];
      game.waypoint = s ? { ...pts[next], label: s.name } : null;
    };
    guide();
    return {
      update(dt) {
        t += dt;
        const pos = game.flight.pos;
        const target = pts[next];
        const d = Math.hypot(pos.x - target.x, pos.z - target.z);
        if (d <= radius && Math.abs(pos.y - target.y) < 90) {
          view?.arrive(next);
          next++;
          guide();
          best = Infinity;
          stall = 0;
        } else if (d < best - 5) {
          best = d;
          stall = 0;
        } else if ((stall += dt) >= LOST_AFTER) return 'failed';
        return next >= pts.length ? 'done' : 'running';
      },
      progress: () => next / pts.length,
      hud: () => {
        if (next >= pts.length) return def.title;
        const name = p.stops[next].name;
        if (stall >= WARN_AFTER) return `${def.title}  head for ${name} or the tour ends in ${Math.ceil(LOST_AFTER - stall)}s`;
        return `${def.title}  ${next}/${pts.length}  next: ${name}`;
      },
      targets: () => pts.slice(next),
      elapsed: () => t,
      dispose() {
        if (game.waypoint && p.stops.some((s) => s.name === game.waypoint?.label)) game.waypoint = null;
        view?.close();
      },
    };
  },
  solve(def, game) {
    const p = def.params as unknown as TourParams;
    return p.stops.flatMap((s) => [{ teleport: game.world.point({ alt: ALT, ...s }) }, { wait: 0.05 }]);
  },
};
