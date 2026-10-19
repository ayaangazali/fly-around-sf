import type { ActivityDef, ActivityKind, GeoPoint } from '../types';
import type { Game } from '../../game';
import { HINT_TIMES, NORTON, clock, geoErrors, hintErrors, hintsUnlocked, reached, say, textErrors, type QuestInstance } from '../quest-common';

export interface RiddleSpec {
  riddle: string;
  hints: string[];
  answer: string;
  target: GeoPoint;
  fact: string;
  radius?: number;
}

export interface RiddleRun {
  icon: string;
  title: string;
  timeLimit: number;
  onTick?(t: number, distance: number): void;
  onSolved?(t: number, hints: number): string | undefined;
}

export const TIME_LIMIT = 600;

export function riddleErrors(r: Partial<RiddleSpec> | undefined, label = 'params'): string[] {
  if (!r) return [`${label} missing`];
  return [
    ...textErrors(r.riddle, `${label}.riddle`, 20),
    ...hintErrors(r.hints, label),
    ...textErrors(r.answer, `${label}.answer`),
    ...textErrors(r.fact, `${label}.fact`, 20),
    ...geoErrors(r.target, `${label}.target`),
    ...(r.radius === undefined || (r.radius >= 30 && r.radius <= 400) ? [] : [`${label}.radius must be 30..400`]),
  ];
}

export function reveal(r: RiddleSpec): string {
  const name = r.answer.replace(/^The /, '');
  return r.fact.includes(name) ? `Yes! ${r.fact}` : `${r.answer}! ${r.fact}`;
}

export function riddleTarget(r: RiddleSpec, game: Game) {
  return game.world.point(r.target, 20);
}

export function runRiddle(def: ActivityDef, game: Game, r: RiddleSpec, run: RiddleRun): QuestInstance {
  const target = riddleTarget(r, game);
  const radius = r.radius ?? 120;
  let t = 0;
  let hints = 0;
  let solved = false;
  const announce = () =>
    game.bus.emit('quest:objective', { id: def.id, title: run.title, text: r.riddle, hint: hints ? r.hints.slice(0, hints).join('\n') : undefined, icon: run.icon });
  say(game, def.id, NORTON, [r.riddle]);
  announce();
  return {
    update(dt) {
      if (solved) return 'done';
      t += dt;
      const pos = game.flight.pos;
      run.onTick?.(t, Math.hypot(pos.x - target.x, pos.z - target.z));
      const n = hintsUnlocked(t);
      if (n > hints) {
        hints = n;
        game.bus.emit('toast', { text: '💡 Hint unlocked', kind: 'info' });
        announce();
      }
      if (reached(pos, target, radius, 250)) {
        solved = true;
        const share = run.onSolved?.(t, hints);
        game.bus.emit('quest:say', { id: def.id, lines: [{ who: NORTON, text: reveal(r), share }] });
        return 'done';
      }
      return t > run.timeLimit ? 'failed' : 'running';
    },
    progress: () => (solved ? 1 : 0),
    hud: () => `${run.icon} ${run.title} · ${clock(t)}${hints < HINT_TIMES.length ? ` · hint in ${clock(HINT_TIMES[hints] - t)}` : ` · ${clock(run.timeLimit - t)} left`}`,
    markers: () => [],
    elapsed: () => t,
  };
}

export const kind: ActivityKind = {
  kind: 'riddle',
  label: 'Imperial Riddle',
  icon: '🧩',
  validate(def) {
    const p = def.params as (Partial<RiddleSpec> & { timeLimit?: number }) | undefined;
    const errors = riddleErrors(p);
    if (p?.timeLimit !== undefined && !(p.timeLimit >= 180)) errors.push('params.timeLimit must be at least 180');
    return errors;
  },
  start(def, game) {
    const p = def.params as unknown as RiddleSpec & { timeLimit?: number };
    return runRiddle(def, game, p, { icon: kind.icon, title: def.title, timeLimit: p.timeLimit ?? TIME_LIMIT });
  },
  solve(def, game) {
    return [{ teleport: riddleTarget(def.params as unknown as RiddleSpec, game) }, { wait: 0.1 }];
  },
};
