import type { ActivityKind, GeoPoint } from '../types';
import { clock, dist3, isGeo, medalFor, meters, prop, report, validateTimed, type Medals, type MinigameInstance, type PropType } from '../minigame';

interface Stop extends GeoPoint {
  name: string;
}

interface DeliveryParams {
  pickup: Stop;
  dropoff: Stop;
  item: string;
  prop?: PropType;
  fragile?: boolean;
  radius?: number;
  timeLimit: number;
  medals?: Medals;
}

const isStop = (s: unknown): s is Stop => isGeo(s) && typeof (s as Stop).name === 'string';

export const kind: ActivityKind = {
  kind: 'delivery',
  label: 'Delivery',
  icon: '📦',
  validate(def) {
    const p = def.params as Partial<DeliveryParams> | undefined;
    const errors: string[] = [];
    if (!isStop(p?.pickup)) errors.push('params.pickup needs lat, lon and name');
    if (!isStop(p?.dropoff)) errors.push('params.dropoff needs lat, lon and name');
    if (typeof p?.item !== 'string' || !p.item) errors.push('params.item is required');
    if (p?.radius !== undefined && !(p.radius >= 5 && p.radius <= 60)) errors.push('params.radius must be 5..60');
    validateTimed(p, errors);
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = def.params as unknown as DeliveryParams;
    const r = p.radius ?? 16;
    const a = game.world.point(p.pickup, 10);
    const b = game.world.point(p.dropoff, 10);
    const parcel = prop(p.prop ?? 'parcel', a);
    const props = [parcel];
    let t = 0;
    let carrying = false;
    let crashed = false;
    const off = game.bus.on('player:crash', () => void (crashed ||= carrying && !!p.fragile));
    return {
      update(dt) {
        t += dt;
        const pos = game.flight.pos;
        if (crashed) {
          report(game, def, { medal: 0, time: t, fail: `The ${p.item} did not survive the crash` });
          return 'failed';
        }
        if (!carrying && dist3(pos, a) <= r) {
          carrying = true;
          game.toast(`Got the ${p.item}. Now to ${p.dropoff.name}`, 'info');
        } else if (carrying && dist3(pos, b) <= r) {
          report(game, def, { medal: medalFor(p.medals, t), time: t });
          return 'done';
        }
        if (t > p.timeLimit) {
          report(game, def, { medal: 0, time: t, fail: `The ${p.item} arrived too late` });
          return 'failed';
        }
        if (carrying) {
          parcel.pos.x = pos.x;
          parcel.pos.y = pos.y - 1.6;
          parcel.pos.z = pos.z;
          parcel.yaw = game.flight.yaw;
        } else {
          parcel.pos.y = a.y + Math.sin(t * 2.4) * 0.6;
          parcel.yaw = t * 1.2;
        }
        return 'running';
      },
      progress: () => (carrying ? 0.5 : 0),
      hud: () => {
        const goal = carrying ? b : a;
        const what = carrying ? `To ${p.dropoff.name}` : `Pick up at ${p.pickup.name}`;
        return `📦 ${what} · ${meters(dist3(game.flight.pos, goal))} · ${clock(t, p.timeLimit)}${p.fragile && carrying ? ' · fragile' : ''}`;
      },
      targets: () => [carrying ? b : a],
      elapsed: () => t,
      props: () => props,
      dispose: off,
    };
  },
  solve(def, game) {
    const p = def.params as unknown as DeliveryParams;
    return [{ teleport: game.world.point(p.pickup, 10) }, { wait: 0.1 }, { teleport: game.world.point(p.dropoff, 10) }, { wait: 0.1 }];
  },
};
