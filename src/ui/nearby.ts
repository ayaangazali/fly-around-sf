import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';
import { el } from './panel-host';
import { kindColor } from './map-style';
import { bearingDeg, headingDeg, relativeDeg } from './map-view';

export interface Nearby {
  def: ActivityDef;
  dist: number;
}

export function nearestOpen(game: Game, max: number, range = Infinity): Nearby[] {
  const p = game.flight.pos;
  const out: Nearby[] = [];
  for (const def of game.activities.list()) {
    if (def.hidden || game.activities.kindOf(def).passive || game.save.isDone(def.id) || game.activities.locked(def)) continue;
    const q = game.activities.position(def);
    const dist = Math.hypot(q.x - p.x, q.z - p.z);
    if (dist <= range) out.push({ def, dist });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, max);
}

const PIPS = 6;
const RANGE = 2000;

export function installCompassPips(game: Game): { update(): void } {
  const compass = game.hud.root.querySelector('.hud-compass') as HTMLElement;
  const pips = Array.from({ length: PIPS }, () => {
    const i = el('i', 'compass-pip');
    i.hidden = true;
    compass.append(i);
    return i;
  });
  let list: Nearby[] = [];
  let frame = 0;
  return {
    update() {
      if (!game.loaded) return;
      if (frame++ % 20 === 0) list = nearestOpen(game, PIPS, RANGE);
      const p = game.flight.pos;
      const heading = headingDeg(game.flight.yaw);
      const half = compass.clientWidth / 2 - 10;
      pips.forEach((pip, n) => {
        const item = list[n];
        const px = item ? (relativeDeg(bearingDeg(p.x, p.z, game.activities.position(item.def).x, game.activities.position(item.def).z), heading) * 28) / 15 : 0;
        pip.hidden = !item || Math.abs(px) > half;
        if (pip.hidden) return;
        pip.style.left = `calc(50% + ${px.toFixed(1)}px)`;
        pip.style.setProperty('--c', kindColor(item.def.kind));
        pip.style.opacity = (1 - (item.dist / RANGE) * 0.6).toFixed(2);
      });
    },
  };
}
