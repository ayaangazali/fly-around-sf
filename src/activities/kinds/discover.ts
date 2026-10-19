import type { ActivityKind } from '../types';

export const kind: ActivityKind = {
  kind: 'discover',
  label: 'Discovery',
  icon: '✦',
  passive: true,
  validate(def) {
    const r = def.params?.radius;
    return r === undefined || (typeof r === 'number' && r > 5 && r < 1000) ? [] : ['params.radius must be 5..1000'];
  },
  start(def, game) {
    const target = game.world.point(def.at);
    const radius = (def.params?.radius as number | undefined) ?? 70;
    let done = false;
    return {
      update() {
        const p = game.flight.pos;
        done ||= Math.hypot(p.x - target.x, p.z - target.z) <= radius && p.y - target.y < 250;
        return done ? 'done' : 'running';
      },
      progress: () => (done ? 1 : 0),
      hud: () => def.title,
    };
  },
  solve(def, game) {
    return [{ teleport: game.world.point(def.at) }, { wait: 0.1 }];
  },
};
