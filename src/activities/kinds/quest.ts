import type { ActivityDef, ActivityKind, GeoPoint, SolverStep } from '../types';
import type { Game } from '../../game';
import type { Vec3 } from '../../player/flight';
import { HINT_TIMES, NORTON, clock, geoErrors, guide, hintErrors, hintsUnlocked, reached, say, textErrors, touched, type Marker, type QuestInstance, type Waypoint } from '../quest-common';

export type ObjectiveType = 'goto' | 'find' | 'read' | 'riddle' | 'collect';

export interface Objective {
  type: ObjectiveType;
  text: string;
  at?: GeoPoint;
  pieces?: GeoPoint[];
  radius?: number;
  hints?: string[];
  clue?: { from: string; text: string };
  say?: string[];
}

export interface QuestParams {
  chapter: number;
  intro: string[];
  outro: string[];
  objectives: Objective[];
}

const TYPES: ObjectiveType[] = ['goto', 'find', 'read', 'riddle', 'collect'];
const RADIUS: Record<ObjectiveType, number> = { goto: 60, read: 45, find: 12, riddle: 120, collect: 12 };
const REVEAL = 160;

export function objectivePoints(o: Objective, game: Game): Vec3[] {
  const low = o.type === 'find' || o.type === 'collect';
  return (o.type === 'collect' ? (o.pieces ?? []) : o.at ? [o.at] : []).map((g) => game.world.point(g, low ? 5 : 20));
}

function objectiveErrors(o: Objective, i: number): string[] {
  const label = `objective ${i + 1}`;
  if (!o || !TYPES.includes(o.type)) return [`${label}: unknown type`];
  const errors = textErrors(o.text, `${label} text`);
  if (o.type === 'collect') {
    if (!Array.isArray(o.pieces) || o.pieces.length < 2) errors.push(`${label}: collect needs at least 2 pieces`);
    else o.pieces.forEach((p, j) => errors.push(...geoErrors(p, `${label} piece ${j + 1}`)));
  } else errors.push(...geoErrors(o.at, label));
  if (o.type === 'riddle') errors.push(...hintErrors(o.hints, label));
  if (o.type === 'read' && (!o.clue || textErrors(o.clue.text, 'clue', 10).length || textErrors(o.clue.from, 'clue from').length)) errors.push(`${label}: read needs clue.from and clue.text`);
  if (o.radius !== undefined && !(o.radius >= 5 && o.radius <= 400)) errors.push(`${label}: radius must be 5..400`);
  if (o.say !== undefined && (!Array.isArray(o.say) || o.say.some((s) => typeof s !== 'string'))) errors.push(`${label}: say must be lines of text`);
  return errors;
}

export const kind: ActivityKind = {
  kind: 'quest',
  label: 'Story Chapter',
  icon: '📜',
  validate(def) {
    const p = def.params as Partial<QuestParams> | undefined;
    if (!p) return ['params missing'];
    const errors: string[] = [];
    if (!Number.isInteger(p.chapter) || (p.chapter as number) < 1) errors.push('params.chapter must be a positive integer');
    for (const key of ['intro', 'outro'] as const) {
      const lines = p[key];
      if (!Array.isArray(lines) || !lines.length || lines.some((l) => typeof l !== 'string' || l.length < 4)) errors.push(`params.${key} needs lines of text`);
    }
    if (!Array.isArray(p.objectives) || p.objectives.length < 3 || p.objectives.length > 6) errors.push('params.objectives needs 3 to 6 objectives');
    else p.objectives.forEach((o, i) => errors.push(...objectiveErrors(o, i)));
    return errors;
  },
  start(def, game) {
    const p = def.params as unknown as QuestParams;
    const title = `Chapter ${p.chapter} · ${def.title}`;
    let index = 0;
    let points: Vec3[] = [];
    let left: Vec3[] = [];
    let t = 0;
    let since = 0;
    let hints = 0;
    let owned: Waypoint | null = null;

    const current = () => p.objectives[index];
    const radius = (o: Objective) => o.radius ?? RADIUS[o.type];
    const announce = () => {
      const o = current();
      const shown = o.type === 'riddle' ? (o.hints ?? []).slice(0, hints) : [];
      game.bus.emit('quest:objective', { id: def.id, title, text: o.text, hint: shown.length ? shown.join('\n') : undefined, icon: kind.icon });
    };
    const begin = () => {
      const o = current();
      points = objectivePoints(o, game);
      left = [...points];
      since = 0;
      hints = 0;
      owned = guide(game, owned, o.type === 'goto' || o.type === 'read' ? points[0] : o.type === 'collect' ? left[0] : null, o.text);
      announce();
    };
    const finishObjective = () => {
      const o = current();
      if (o.clue) game.bus.emit('quest:say', { id: def.id, lines: [{ who: o.clue.from, text: o.clue.text }] });
      say(game, def.id, NORTON, o.say ?? []);
      index++;
      if (index < p.objectives.length) {
        game.bus.emit('toast', { text: `✓ ${o.text}`, kind: 'info' });
        begin();
      }
    };

    say(game, def.id, NORTON, p.intro);
    begin();

    const inst: QuestInstance = {
      update(dt) {
        t += dt;
        since += dt;
        if (index >= p.objectives.length) return 'done';
        const o = current();
        const pos = game.flight.pos;
        if (o.type === 'riddle') {
          const n = hintsUnlocked(since);
          if (n > hints) {
            hints = n;
            game.bus.emit('toast', { text: '💡 Hint unlocked', kind: 'info' });
            announce();
          }
        }
        if (o.type === 'collect') {
          const before = left.length;
          left = left.filter((q) => !touched(pos, q, radius(o)));
          if (left.length < before && left.length) {
            game.bus.emit('toast', { text: `Commit shard ${points.length - left.length}/${points.length}`, kind: 'info' });
            owned = guide(game, owned, left[0], o.text);
          }
          if (!left.length) finishObjective();
        } else if (o.type === 'find' ? touched(pos, points[0], radius(o)) : reached(pos, points[0], radius(o))) finishObjective();
        if (index < p.objectives.length) return 'running';
        say(game, def.id, NORTON, p.outro);
        return 'done';
      },
      progress: () => index / p.objectives.length,
      hud() {
        const o = current();
        if (!o) return title;
        const extra = o.type === 'collect' ? ` · shards ${points.length - left.length}/${points.length}` : o.type === 'riddle' && hints < HINT_TIMES.length ? ` · hint in ${clock(HINT_TIMES[hints] - since)}` : '';
        return `${title}  ${index + 1}/${p.objectives.length}${extra}`;
      },
      markers() {
        const o = current();
        if (!o) return [];
        if (o.type === 'goto' || o.type === 'read') return [{ p: points[0], style: 'beacon' }];
        if (o.type === 'collect') return left.map((q): Marker => ({ p: q, style: 'shard' }));
        if (o.type === 'find') {
          const pos = game.flight.pos;
          const q = points[0];
          return Math.hypot(pos.x - q.x, pos.z - q.z) < REVEAL ? [{ p: q, style: 'shard' }] : [];
        }
        return [];
      },
      targets() {
        return inst.markers().map((m) => m.p);
      },
      elapsed: () => t,
      dispose() {
        guide(game, owned, null, '');
      },
    };
    return inst;
  },
  solve(def, game) {
    const p = def.params as unknown as QuestParams;
    return p.objectives.flatMap((o) => objectivePoints(o, game).flatMap((q): SolverStep[] => [{ teleport: q }, { wait: 0.05 }]));
  },
};

export function chapters(defs: ActivityDef[]): ActivityDef[] {
  return defs.filter((d) => d.kind === 'quest').sort((a, b) => (a.params as unknown as QuestParams).chapter - (b.params as unknown as QuestParams).chapter);
}
