import { describe, expect, it } from 'vitest';
import { fakeGame, loadDefs, loadKinds } from './helpers';
import { toLocal } from '../../src/core/geo';
import type { ActivityDef } from '../../src/activities/types';
import type { Game } from '../../src/game';
import type { QuestInstance } from '../../src/activities/quest-common';
import { kind as riddle, reveal, riddleTarget, type RiddleSpec } from '../../src/activities/kinds/riddle';
import { kind as daily, MIN_POOL, dayIndex, decreeNumber, pickIndex, recordDaily, sfDate, shareLine, shiftDate, square, today, type DailyParams } from '../../src/activities/kinds/daily';
import { heatOf, kind as scavenger, tokenPoints } from '../../src/activities/kinds/scavenger';

const defs = loadDefs();
const riddles = defs.filter((d) => d.kind === 'riddle');
const hunts = defs.filter((d) => d.kind === 'scavenger');
const dailyDef = defs.find((d) => d.id === 'daily-clue') as ActivityDef;
const pool = (dailyDef.params as unknown as DailyParams).pool;

async function setup(at = '2026-10-19T19:30:00Z'): Promise<Game> {
  const game = fakeGame();
  game.activities.register(await loadKinds(), defs);
  (game as unknown as { date: () => Date }).date = () => new Date(at);
  return game;
}

function play(game: Game, id: string): void {
  const def = game.activities.defs.get(id) as ActivityDef;
  expect(game.activities.start(id), id).toBe(true);
  for (const s of game.activities.kindOf(def).solve(def, game)) {
    if ('teleport' in s) game.flight.pos = { ...s.teleport };
    game.activities.update(0.05);
  }
  game.activities.update(0.05);
}

const spec: RiddleSpec = { riddle: 'What has a tower and a clock and a bay?', hints: ['It is by the water.', 'The Ferry Building.'], answer: 'The Ferry Building', target: { lat: 37.7955, lon: -122.3937 }, fact: 'It was finished in 1898 and survived 1906.' };
const rdef = (p: unknown): ActivityDef => ({ id: 'riddle-x', kind: 'riddle', title: 'X', blurb: 'a riddle blurb', neighborhood: 'Embarcadero', at: { lat: 37.79, lon: -122.4 }, params: p as Record<string, unknown> });

describe('imperial riddles', () => {
  it('[R-RIDDLE] at least 36 riddles across the city, all valid, answers unique and away from the start', () => {
    expect(riddles.length).toBeGreaterThanOrEqual(36);
    expect(new Set(riddles.map((d) => d.neighborhood)).size).toBeGreaterThanOrEqual(25);
    const answers = riddles.map((d) => (d.params as unknown as RiddleSpec).answer);
    expect(new Set(answers).size).toBe(answers.length);
    for (const d of riddles) {
      const p = d.params as unknown as RiddleSpec;
      expect(riddle.validate(d), d.id).toEqual([]);
      const a = toLocal(d.at.lat, d.at.lon);
      const b = toLocal(p.target.lat, p.target.lon);
      expect(Math.hypot(a.x - b.x, a.z - b.z), d.id).toBeGreaterThan((p.radius ?? 120) + 100);
      expect(`${p.riddle} ${p.hints.join(' ')} ${p.fact}`).not.toContain('—');
    }
  });

  it('[R-RIDDLE] reports bad riddle params', () => {
    expect(riddle.validate(rdef(undefined))).toEqual(['params missing']);
    const errors = riddle.validate(rdef({ riddle: 'short', hints: ['one'], answer: '', fact: 'tiny', target: { lat: 1, lon: 2 }, radius: 5, timeLimit: 10 })).join('\n');
    for (const s of ['riddle', 'hints', 'answer', 'fact', 'outside San Francisco', 'radius', 'timeLimit']) expect(errors).toContain(s);
    expect(riddle.validate(rdef(spec))).toEqual([]);
  });

  it('[R-RIDDLE] unlocks hints at 60 and 120 seconds and is solved by flying to the answer', () => {
    const game = fakeGame();
    const hints: (string | undefined)[] = [];
    const said: string[] = [];
    game.bus.on('quest:objective', (o) => hints.push(o.hint));
    game.bus.on('quest:say', (s) => said.push(...s.lines.map((l) => l.text)));
    const inst = riddle.start(rdef(spec), game) as QuestInstance;
    expect(said).toEqual([spec.riddle]);
    expect(inst.markers()).toEqual([]);
    expect(inst.update(59)).toBe('running');
    expect(hints).toEqual([undefined]);
    expect(inst.hud()).toContain('hint in 0:01');
    inst.update(1);
    inst.update(60);
    expect(hints).toEqual([undefined, spec.hints[0], spec.hints.join('\n')]);
    expect(inst.hud()).toContain('left');
    game.flight.pos = { ...riddleTarget(spec, game) };
    expect(inst.update(0.1)).toBe('done');
    expect(inst.update(0.1)).toBe('done');
    expect(inst.progress()).toBe(1);
    expect(said.at(-1)).toBe(`The Ferry Building! ${spec.fact}`);
    expect(reveal({ ...spec, fact: 'The Ferry Building opened in 1898.' })).toBe('Yes! The Ferry Building opened in 1898.');
    expect(inst.elapsed?.()).toBeCloseTo(120.1);
  });

  it('[R-RIDDLE] fails when the time limit runs out', () => {
    const inst = riddle.start(rdef({ ...spec, timeLimit: 200 }), fakeGame());
    expect(inst.update(199)).toBe('running');
    expect(inst.update(2)).toBe('failed');
  });

  it('[R-RIDDLE] every riddle can be won with its solver', async () => {
    const game = await setup();
    for (const d of riddles) {
      play(game, d.id);
      expect(game.save.isDone(d.id), d.id).toBe(true);
    }
  });
});

describe('scavenger hunts', () => {
  const sdef = (p: unknown, at = { lat: 37.78, lon: -122.42 }): ActivityDef => ({ id: 'scavenger-x', kind: 'scavenger', title: 'Hunt', blurb: 'a hunt blurb', neighborhood: 'Test', at, params: p as Record<string, unknown> });
  const tokens = [
    { lat: 37.781, lon: -122.42, name: 'North' },
    { lat: 37.779, lon: -122.42 },
    { lat: 37.78, lon: -122.418 },
  ];

  it('[R-SCAVENGER] at least 14 hunts, each valid and inside its neighborhood', () => {
    expect(hunts.length).toBeGreaterThanOrEqual(14);
    for (const d of hunts) expect(scavenger.validate(d), d.id).toEqual([]);
    expect(new Set(hunts.map((d) => d.neighborhood)).size).toBeGreaterThanOrEqual(14);
  });

  it('[R-SCAVENGER] reports bad hunt params', () => {
    expect(scavenger.validate(sdef(undefined))).toEqual(['params.tokens needs 3 to 12 points']);
    const errors = scavenger.validate(sdef({ tokens: [...tokens, { lat: 37.8, lon: -122.42 }, { lat: 'x' }], timeLimit: 5, radius: 99 })).join('\n');
    for (const s of ['more than 1500 m', 'token 5 needs lat/lon', 'timeLimit', 'radius']) expect(errors).toContain(s);
  });

  it('[R-SCAVENGER] hides tokens until close, pulses warmer and colder, and finishes when all are found', () => {
    const game = fakeGame();
    const toasts: string[] = [];
    game.bus.on('toast', (t) => toasts.push(t.text));
    const def = sdef({ tokens, timeLimit: 300 });
    const inst = scavenger.start(def, game) as QuestInstance;
    const pts = tokenPoints(def, game);
    game.flight.pos = { x: pts[0].x, y: pts[0].y, z: pts[0].z + 600 };
    inst.update(1);
    expect(inst.markers()).toEqual([]);
    expect(inst.trend?.()).toBe('steady');
    game.flight.pos = { ...game.flight.pos, z: pts[0].z + 300 };
    inst.update(1);
    expect(inst.trend?.()).toBe('warmer');
    expect(inst.heat?.()).toBeGreaterThan(heatOf(600));
    expect(inst.hud()).toContain('warmer');
    game.flight.pos = { ...game.flight.pos, z: pts[0].z + 500 };
    inst.update(1);
    expect(inst.trend?.()).toBe('colder');
    game.flight.pos = { ...game.flight.pos, z: pts[0].z + 50 };
    expect(inst.markers()).toHaveLength(1);
    expect(inst.targets?.()).toHaveLength(1);
    for (const p of pts) {
      game.flight.pos = { ...p };
      inst.update(0.1);
    }
    expect(inst.progress()).toBe(1);
    expect(inst.heat?.()).toBe(1);
    expect(toasts[0]).toContain('North');
    expect(inst.elapsed?.()).toBeCloseTo(3.3);
  });

  it('[R-SCAVENGER] fails when time runs out and heat stays in range', () => {
    const inst = scavenger.start(sdef({ tokens, timeLimit: 60 }), fakeGame());
    expect(inst.update(30)).toBe('running');
    expect(inst.update(31)).toBe('failed');
    expect(heatOf(0)).toBe(1);
    expect(heatOf(5000)).toBe(0);
  });

  it('[R-SCAVENGER] every hunt can be won with its solver', async () => {
    const game = await setup();
    for (const d of hunts) {
      play(game, d.id);
      expect(game.save.isDone(d.id), d.id).toBe(true);
    }
  });
});

describe('daily decree', () => {
  it('[R-DAILY] the pool has at least 60 valid riddles with unique answers', () => {
    expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL);
    expect(daily.validate(dailyDef)).toEqual([]);
    expect(daily.validate({ ...dailyDef, params: { pool: pool.slice(0, 10) } })[0]).toContain(`${MIN_POOL}`);
    expect(daily.validate({ ...dailyDef, params: { pool: [...pool, pool[0]] } })).toContain('pool answers must be unique');
  });

  it('[R-DAILY] the date is counted in San Francisco time', () => {
    expect(sfDate(new Date('2026-10-20T06:30:00Z'))).toBe('2026-10-19');
    expect(sfDate(new Date('2026-10-20T07:30:00Z'))).toBe('2026-10-20');
    expect(sfDate(new Date('2027-01-15T07:59:00Z'))).toBe('2027-01-14');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(decreeNumber('2026-10-19')).toBe(1);
    expect(dayIndex('2026-10-20') - dayIndex('2026-10-19')).toBe(1);
  });

  it('[R-DAILY] the same date always gives the same riddle and different dates differ', () => {
    expect(pickIndex('2026-10-19', pool.length)).toBe(pickIndex('2026-10-19', pool.length));
    const days = Array.from({ length: 3000 }, (_, i) => pickIndex(shiftDate('2026-01-01', i), pool.length));
    for (let i = 1; i < days.length; i++) expect(days[i], `day ${i}`).not.toBe(days[i - 1]);
    const window = days.slice(0, pool.length);
    expect(new Set(window).size).toBeGreaterThan(pool.length * 0.6);
    expect(new Set(days).size).toBe(pool.length);
    expect(days.every((d) => d >= 0 && d < pool.length)).toBe(true);
  });

  it('[R-DAILY] builds an emoji share line from the flight path, time and hints', () => {
    expect([square(3000), square(1500), square(800), square(100)]).toEqual(['🟥', '🟧', '🟨', '🟩']);
    const line = shareLine('2026-10-21', [3000, 1500, 800, 100], 161, 2);
    expect(line).toBe('Fly Around SF · Daily Decree #3 · 2026-10-21\n🟥🟧🟨🟩📍 2:41 · 💡💡');
    const long = shareLine('2026-10-19', Array.from({ length: 40 }, (_, i) => 4000 - i * 100), 30, 0);
    expect(long).toContain('⭐ no hints');
    expect([...long.split('\n')[1].split('📍')[0]].length).toBe(8);
  });

  it('[R-DAILY] is solvable, records the result once, and keeps a streak across days', async () => {
    const game = await setup('2026-10-19T19:30:00Z');
    const results: string[] = [];
    game.bus.on('quest:daily', (e) => results.push(e.share));
    expect(today(game).riddle).toBe(pool[pickIndex('2026-10-19', pool.length)]);
    play(game, 'daily-clue');
    expect(game.save.isDone('daily-clue')).toBe(true);
    expect(game.save.data.cards).toContain('quest-norton-scrip');
    const f = game.save.data.flags;
    expect(f['daily:2026-10-19']).toContain('Daily Decree #1');
    expect(f['daily:streak']).toBe(1);
    recordDaily(game, '2026-10-19', 'again');
    expect(f['daily:2026-10-19']).not.toBe('again');
    recordDaily(game, '2026-10-20', 'next day');
    expect(f['daily:streak']).toBe(2);
    recordDaily(game, '2026-10-25', 'skipped days');
    expect(f['daily:streak']).toBe(1);
    expect(f['daily:count']).toBe(3);
    expect(results).toHaveLength(3);
  });

  it('[R-DAILY] different days send the solver to different places', async () => {
    const a = await setup('2026-10-19T19:30:00Z');
    const b = await setup('2026-10-20T19:30:00Z');
    expect(today(a).riddle.answer).not.toBe(today(b).riddle.answer);
    play(b, 'daily-clue');
    expect(b.save.data.flags['daily:2026-10-20']).toContain('#2');
  });

  it('[R-DAILY] an empty game has no decree to pick from', () => {
    const game = fakeGame();
    (game as unknown as { date: () => Date }).date = () => new Date('2026-10-19T19:30:00Z');
    expect(today(game).riddle).toBeUndefined();
  });
});
