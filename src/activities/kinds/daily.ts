import type { ActivityKind } from '../types';
import type { Game } from '../../game';
import { clock } from '../quest-common';
import { TIME_LIMIT, riddleErrors, riddleTarget, runRiddle, type RiddleSpec } from './riddle';

export const LAUNCH = '2026-10-19';
export const MIN_POOL = 60;
const DAY = 86_400_000;
const SAMPLE_EVERY = 10;
const MAX_SQUARES = 8;

const sfFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });

export function sfDate(d: Date): string {
  return sfFormat.format(d);
}

export function dayIndex(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
}

export function shiftDate(date: string, days: number): string {
  return new Date((dayIndex(date) + days) * DAY).toISOString().slice(0, 10);
}

export function decreeNumber(date: string): number {
  return dayIndex(date) - dayIndex(LAUNCH) + 1;
}

function shuffled(n: number, cycle: number): number[] {
  let s = (Math.imul(cycle, 0x9e3779b1) ^ 0x5f3759df) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickIndex(date: string, n: number): number {
  const day = dayIndex(date);
  const cycle = Math.floor(day / n);
  const pos = day - cycle * n;
  const order = shuffled(n, cycle);
  if (order[0] === shuffled(n, cycle - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[pos];
}

export function square(distance: number): string {
  return distance > 2500 ? '🟥' : distance > 1200 ? '🟧' : distance > 400 ? '🟨' : '🟩';
}

export function shareLine(date: string, samples: number[], seconds: number, hints: number): string {
  const picked = samples.length <= MAX_SQUARES ? samples : Array.from({ length: MAX_SQUARES }, (_, i) => samples[Math.round((i * (samples.length - 1)) / (MAX_SQUARES - 1))]);
  return `Fly Around SF · Daily Decree #${decreeNumber(date)} · ${date}\n${picked.map(square).join('')}📍 ${clock(seconds)} · ${hints ? '💡'.repeat(hints) : '⭐ no hints'}`;
}

export interface DailyParams {
  pool: RiddleSpec[];
}

export function today(game: Game): { date: string; riddle: RiddleSpec } {
  const pool = (game.activities.defs.get('daily-clue')?.params as unknown as DailyParams | undefined)?.pool ?? [];
  const date = sfDate(game.date());
  return { date, riddle: pool[pickIndex(date, pool.length)] };
}

export function recordDaily(game: Game, date: string, share: string): void {
  const f = game.save.data.flags;
  if (f[`daily:${date}`]) return;
  f[`daily:${date}`] = share;
  f['daily:streak'] = f['daily:last'] === shiftDate(date, -1) ? Number(f['daily:streak'] ?? 0) + 1 : 1;
  f['daily:last'] = date;
  f['daily:count'] = Number(f['daily:count'] ?? 0) + 1;
  game.save.persist();
  game.bus.emit('quest:daily', { date, share });
}

export const kind: ActivityKind = {
  kind: 'daily',
  label: 'Daily Decree',
  icon: '🗓',
  validate(def) {
    const pool = (def.params as Partial<DailyParams> | undefined)?.pool;
    if (!Array.isArray(pool) || pool.length < MIN_POOL) return [`params.pool needs at least ${MIN_POOL} riddles`];
    const errors = pool.flatMap((r, i) => riddleErrors(r, `pool[${i}]`));
    const answers = pool.map((r) => r.answer);
    if (new Set(answers).size !== answers.length) errors.push('pool answers must be unique');
    return errors;
  },
  start(def, game) {
    const { date, riddle } = today(game);
    const samples: number[] = [];
    return runRiddle(def, game, riddle, {
      icon: kind.icon,
      title: `Daily Decree #${decreeNumber(date)}`,
      timeLimit: TIME_LIMIT,
      onTick(t, d) {
        if (t >= samples.length * SAMPLE_EVERY) samples.push(d);
      },
      onSolved(t, hints) {
        const share = shareLine(date, samples, t, hints);
        recordDaily(game, date, share);
        return share;
      },
    });
  },
  solve(_def, game) {
    return [{ teleport: riddleTarget(today(game).riddle, game) }, { wait: 0.1 }];
  },
};
