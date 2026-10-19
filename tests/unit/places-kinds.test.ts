import { describe, expect, it } from 'vitest';
import { kind as trivia } from '../../src/activities/kinds/trivia';
import { kind as tour } from '../../src/activities/kinds/tour';
import type { ActivityDef } from '../../src/activities/types';
import { fakeGame } from './helpers';

const base = { neighborhood: 'Mission', blurb: 'a place to test', at: { lat: 37.76, lon: -122.42 } };
const quiz: ActivityDef = {
  ...base,
  id: 'trivia-test',
  kind: 'trivia',
  title: 'Test Trivia',
  card: 'test-card',
  params: { question: 'Which answer is right?', options: ['Alpha', 'Bravo', 'Charlie', 'Delta'], answer: 2, explain: 'Charlie was right all along.' },
};
const stops = [
  { name: 'Stop One', lat: 37.76, lon: -122.42, line: 'The first stop has a story to tell.' },
  { name: 'Stop Two', lat: 37.762, lon: -122.42, line: 'The second stop has another story.' },
  { name: 'Stop Three', lat: 37.764, lon: -122.42, line: 'The third stop wraps up nicely here.' },
  { name: 'Stop Four', lat: 37.766, lon: -122.42, line: 'The fourth stop ends the whole tour.' },
];
const walk: ActivityDef = { ...base, id: 'tour-test', kind: 'tour', title: 'Test Tour', params: { stops } };

function run(def: ActivityDef, steps: ReturnType<typeof trivia.solve>, game: ReturnType<typeof fakeGame>) {
  const inst = trivia.start(def, game);
  let status = inst.update(0);
  for (const s of steps) {
    if ('teleport' in s) game.flight.pos = { ...s.teleport };
    if ('call' in s) s.call(game);
    status = inst.update(1 / 30);
  }
  return { inst, status };
}

describe('trivia kind', () => {
  it('[R-TRIVIA] validates question, four distinct options, answer index, explanation, card and time limit', () => {
    expect(trivia.validate(quiz)).toEqual([]);
    const bad = (params: Record<string, unknown>, extra: Partial<ActivityDef> = {}) => trivia.validate({ ...quiz, ...extra, params: { ...quiz.params, ...params } });
    expect(bad({}, { card: undefined })).toContain('trivia needs a card to draw its question from');
    expect(bad({ question: 'short' })).toContain('params.question must be a sentence');
    expect(bad({ options: ['a', 'b', 'c'] })).toContain('params.options needs 4 non-empty strings');
    expect(bad({ options: ['a', 'b', ' ', 'd'] })).toContain('params.options needs 4 non-empty strings');
    expect(bad({ options: ['a', 'B', 'b', 'd'] })).toContain('params.options must be distinct');
    expect(bad({ answer: 4 })).toContain('params.answer must be 0..3');
    expect(bad({ answer: 1.5 })).toContain('params.answer must be 0..3');
    expect(bad({ explain: '' })).toContain('params.explain must be a sentence');
    expect(bad({ timeLimit: 2 })).toContain('params.timeLimit must be >= 5');
    expect(trivia.validate({ ...quiz, params: undefined })).toHaveLength(4);
  });

  it('[R-TRIVIA] the solver answers correctly and the runner completes and grants the card', () => {
    const game = fakeGame();
    game.activities.register([trivia], [quiz]);
    game.flight.pos = { ...game.activities.position(quiz) };
    expect(game.activities.start(quiz.id)).toBe(true);
    for (const s of trivia.solve(quiz, game)) {
      if ('call' in s) s.call(game);
      game.activities.update(1 / 30);
    }
    expect(game.save.isDone(quiz.id)).toBe(true);
    expect(game.save.data.cards).toContain('test-card');
  });

  it('[R-TRIVIA] a wrong answer fails and keeps the drone hovering while the question is open', () => {
    const game = fakeGame();
    const { inst, status } = run(quiz, [], game);
    expect(status).toBe('running');
    const held = { ...game.flight.pos };
    game.flight.pos = { x: held.x + 50, y: held.y, z: held.z };
    game.flight.vel = { x: 9, y: 0, z: 0 };
    expect(inst.update(0.5)).toBe('running');
    expect(game.flight.pos).toEqual(held);
    expect(game.flight.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(inst.hud()).toBe('Test Trivia  30s');
    expect(inst.progress()).toBe(0);
    const [step] = trivia.solve({ ...quiz, params: { ...quiz.params, answer: 0 } }, game);
    if ('call' in step) step.call(game);
    expect(inst.update(0.1)).toBe('failed');
    if ('call' in step) step.call(game);
    expect(inst.update(0.1)).toBe('failed');
    inst.dispose?.();
  });

  it('[R-TRIVIA] the clock running out fails the question', () => {
    const game = fakeGame();
    const def = { ...quiz, params: { ...quiz.params, timeLimit: 5 } };
    const inst = trivia.start(def, game);
    for (let i = 0; i < 4; i++) expect(inst.update(1)).toBe('running');
    expect(inst.update(1.5)).toBe('failed');
    expect(inst.elapsed?.()).toBeCloseTo(5.5);
    expect(inst.hud()).toBe('Test Trivia  0s');
    inst.dispose?.();
    trivia.solve(def, game).forEach((s) => 'call' in s && s.call(game));
    expect(inst.update(0.1)).toBe('failed');
  });

  it('[R-TRIVIA] reports full progress after a correct answer', () => {
    const game = fakeGame();
    const { inst, status } = run(quiz, trivia.solve(quiz, game), game);
    expect(status).toBe('done');
    expect(inst.progress()).toBe(1);
  });
});

describe('tour kind', () => {
  it('[R-TOUR] validates 4 to 6 named stops in San Francisco with narration and a sane radius', () => {
    expect(tour.validate(walk)).toEqual([]);
    const bad = (params: Record<string, unknown>) => tour.validate({ ...walk, params: { ...walk.params, ...params } });
    expect(bad({ stops: stops.slice(0, 3) })).toEqual(['params.stops needs 4 to 6 stops']);
    expect(bad({ stops: [...stops, ...stops] })).toEqual(['params.stops needs 4 to 6 stops']);
    expect(tour.validate({ ...walk, params: undefined })).toEqual(['params.stops needs 4 to 6 stops']);
    const broken = [{ name: 'X', lat: 40, lon: -122.42, line: 'short' }, ...stops.slice(1)];
    expect(bad({ stops: broken })).toEqual(['stop 1 needs lat/lon inside SF', 'stop 1 needs a name', 'stop 1 narration must be 20..220 characters']);
    expect(bad({ stops: [{ ...stops[0], lat: '37' }, ...stops.slice(1)] })).toEqual(['stop 1 needs lat/lon inside SF']);
    expect(bad({ stops: [{ ...stops[0], line: 'x'.repeat(221) }, ...stops.slice(1)] })).toEqual(['stop 1 narration must be 20..220 characters']);
    expect(bad({ radius: 5 })).toEqual(['params.radius must be 15..200']);
  });

  it('[R-TOUR] stops must be visited in order and the waypoint leads to the next one', () => {
    const game = fakeGame();
    const inst = tour.start(walk, game);
    expect(game.waypoint?.label).toBe('Stop One');
    const pts = tour.solve(walk, game).filter((s) => 'teleport' in s).map((s) => ('teleport' in s ? s.teleport : null)!);
    game.flight.pos = { ...pts[2] };
    expect(inst.update(1)).toBe('running');
    expect(inst.progress()).toBe(0);
    game.flight.pos = { ...pts[0] };
    inst.update(1);
    expect(inst.progress()).toBe(0.25);
    expect(game.waypoint?.label).toBe('Stop Two');
    expect(inst.hud()).toBe('Test Tour  1/4  next: Stop Two');
    expect(inst.targets?.()).toHaveLength(3);
    game.flight.pos = { ...pts[1], y: pts[1].y + 200 };
    inst.update(1);
    expect(inst.progress()).toBe(0.25);
    inst.dispose?.();
    expect(game.waypoint).toBeNull();
  });

  it('[R-TOUR] the solver completes the tour, clears the waypoint and records a time', () => {
    const game = fakeGame();
    game.activities.register([tour], [walk]);
    game.flight.pos = { ...game.activities.position(walk) };
    expect(game.activities.start(walk.id)).toBe(true);
    for (const s of tour.solve(walk, game)) {
      if ('teleport' in s) game.flight.pos = { ...s.teleport };
      game.activities.update(0.5);
    }
    expect(game.save.isDone(walk.id)).toBe(true);
    expect(game.save.data.best[walk.id]).toBeGreaterThan(0);
    expect(game.waypoint).toBeNull();
  });

  it('[R-TOUR] leaves a waypoint the player set elsewhere alone', () => {
    const game = fakeGame();
    const inst = tour.start(walk, game);
    for (const s of tour.solve(walk, game)) if ('teleport' in s) {
      game.flight.pos = { ...s.teleport };
      inst.update(0.2);
    }
    expect(inst.hud()).toBe('Test Tour');
    game.waypoint = { x: 1, y: 2, z: 3, label: 'Somewhere else' };
    inst.dispose?.();
    expect(game.waypoint?.label).toBe('Somewhere else');
  });
});
