import type { ActivityKind } from '../types';
import { showTrivia } from '../../ui/places-views';

export interface TriviaParams {
  question: string;
  options: string[];
  answer: number;
  explain: string;
  timeLimit?: number;
}

const DEFAULT_LIMIT = 30;
export const RETRY_AFTER = 60;

const retryAt = new Map<string, number>();
let current: { pick(option: string): void } | null = null;

export const kind: ActivityKind = {
  kind: 'trivia',
  label: 'Trivia',
  icon: '❓',
  validate(def) {
    const p = def.params as Partial<TriviaParams> | undefined;
    const errors: string[] = [];
    if (!def.card) errors.push('trivia needs a card to draw its question from');
    if (typeof p?.question !== 'string' || p.question.length < 10) errors.push('params.question must be a sentence');
    const opts = p?.options;
    if (!Array.isArray(opts) || opts.length !== 4 || opts.some((o) => typeof o !== 'string' || !o.trim())) errors.push('params.options needs 4 non-empty strings');
    else if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) errors.push('params.options must be distinct');
    if (!Number.isInteger(p?.answer) || (p?.answer as number) < 0 || (p?.answer as number) > 3) errors.push('params.answer must be 0..3');
    if (typeof p?.explain !== 'string' || p.explain.length < 10) errors.push('params.explain must be a sentence');
    if (p?.timeLimit !== undefined && !(p.timeLimit >= 5)) errors.push('params.timeLimit must be >= 5');
    return errors;
  },
  blocked(def, game) {
    const wait = (retryAt.get(def.id) ?? 0) - game.simTime;
    return wait > 0 ? `${def.title}: try again in ${Math.ceil(wait)}s` : null;
  },
  start(def, game) {
    const p = def.params as unknown as TriviaParams;
    const limit = p.timeLimit ?? DEFAULT_LIMIT;
    const hold = { ...game.flight.pos };
    let chosen: number | null = null;
    let t = 0;
    const pick = (i: number) => {
      if (chosen !== null) return;
      chosen = i;
      if (i !== p.answer) retryAt.set(def.id, game.simTime + RETRY_AFTER);
      view?.reveal(i, p.answer);
    };
    const view = showTrivia(game, def, p, limit, pick);
    current = { pick: (option) => pick(p.options.indexOf(option)) };
    return {
      update(dt) {
        if (chosen === null) {
          t += dt;
          game.flight.pos = { ...hold };
          game.flight.vel = { x: 0, y: 0, z: 0 };
          view?.tick(Math.max(0, 1 - t / limit));
          if (t >= limit) pick(-1);
        }
        if (chosen === null) return 'running';
        return chosen === p.answer ? 'done' : 'failed';
      },
      progress: () => (chosen === p.answer ? 1 : 0),
      hud: () => `${def.title}  ${Math.ceil(Math.max(0, limit - t))}s`,
      elapsed: () => t,
      dispose() {
        current = null;
        view?.close(chosen === p.answer);
      },
    };
  },
  solve(def) {
    const p = def.params as unknown as TriviaParams;
    return [{ call: () => current?.pick(p.options[p.answer]) }, { wait: 0.1 }];
  },
};
