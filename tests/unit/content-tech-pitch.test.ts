import { describe, expect, it } from 'vitest';
import { fakeGame, loadDefs, loadKinds } from './helpers';
import { replay, tick } from './content-tech-solve';
import { kind, PITCH, TOPICS, type PitchInstance, type PitchParams } from '../../src/activities/kinds/pitch';
import type { ActivityDef } from '../../src/activities/types';

const pitches = loadDefs().filter((d) => d.kind === 'pitch');

function def(over: Partial<PitchParams> = {}): ActivityDef {
  const round = (topic: (typeof TOPICS)[number], best: number) => ({ topic, ask: 'Why now?', options: ['Option one', 'Option two', 'Option three'], best, yes: 'Nice one', no: 'Not quite' });
  return {
    id: 'pitch-test',
    kind: 'pitch',
    title: 'Pitch Test',
    blurb: 'a test pitch meeting',
    neighborhood: 'Dogpatch',
    at: { lat: 37.76082, lon: -122.38604 },
    params: { firm: 'Test Capital', partner: 'A partner', startup: 'Testco: tests', rounds: [round('market', 1), round('traction', 2), round('team', 0)], ...over },
  };
}

function landed(game = fakeGame(), d = def()) {
  const inst = kind.start(d, game) as PitchInstance;
  game.flight.pos = { x: inst.pad.x, y: inst.pad.y + 2, z: inst.pad.z };
  for (let i = 0; i < 30; i++) inst.update(1 / 30);
  return { game, inst };
}

function play(inst: PitchInstance, answers: number[]): string {
  let status = 'running';
  for (const a of answers) {
    while (inst.phase() !== 'ask') status = inst.update(0.1);
    inst.answer(a);
  }
  for (let t = 0; t < PITCH.verdict + PITCH.result + 0.5 && status === 'running'; t += 0.1) status = inst.update(0.1);
  return status;
}

describe('pitch kind', () => {
  it('[R-TECH-PITCH] validates firm, three ordered rounds, options, best index and round time', () => {
    expect(kind.validate(def())).toEqual([]);
    expect(kind.validate({ ...def(), params: undefined })).toContain('params.rounds needs exactly 3 rounds');
    expect(kind.validate(def({ firm: '' })).join()).toContain('firm');
    const p = def().params as unknown as PitchParams;
    expect(kind.validate(def({ rounds: p.rounds.slice(0, 2) }))).toEqual(['params.rounds needs exactly 3 rounds']);
    expect(kind.validate(def({ rounds: [p.rounds[1], p.rounds[0], p.rounds[2]] })).join()).toContain('round 1 must be about market');
    expect(kind.validate(def({ rounds: [{ ...p.rounds[0], best: 3 }, p.rounds[1], p.rounds[2]] })).join()).toContain('best must index');
    expect(kind.validate(def({ rounds: [{ ...p.rounds[0], options: ['only', 'two'] }, p.rounds[1], p.rounds[2]] })).join()).toContain('3 or 4 options');
    expect(kind.validate(def({ rounds: [{ ...p.rounds[0], yes: '' }, p.rounds[1], p.rounds[2]] })).join()).toContain('ask, yes and no');
    expect(kind.validate(def({ roundTime: 2 }))).toEqual(['params.roundTime must be at least 5']);
  });

  it('[R-TECH-PITCH] waits for a slow, low landing on the rooftop pad before the meeting starts', () => {
    const game = fakeGame(12);
    const inst = kind.start(def(), game) as PitchInstance;
    expect(inst.pad.y).toBe(12);
    expect(inst.phase()).toBe('land');
    expect(inst.targets?.()).toEqual([inst.pad]);
    expect(inst.hud()).toContain('land on the glowing rooftop pad');
    expect(inst.answer(0)).toBe(false);
    game.flight.pos = { x: inst.pad.x, y: inst.pad.y + 20, z: inst.pad.z };
    inst.update(1);
    expect(inst.phase()).toBe('land');
    game.flight.pos.y = inst.pad.y + 2;
    game.flight.vel = { x: 9, y: 0, z: 0 };
    inst.update(1);
    expect(inst.phase()).toBe('land');
    game.flight.vel = { x: 0, y: 0, z: 0 };
    inst.update(0.3);
    expect(inst.phase()).toBe('land');
    inst.update(0.4);
    expect(inst.phase()).toBe('ask');
    expect(inst.targets?.()).toEqual([]);
    expect(inst.timeLeft()).toBe(PITCH.roundTime);
  });

  it('[R-TECH-PITCH] flying away before landing walks out of the meeting', () => {
    const game = fakeGame();
    const inst = kind.start(def(), game) as PitchInstance;
    game.flight.pos = { x: inst.pad.x + PITCH.leave + 5, y: inst.pad.y, z: inst.pad.z };
    expect(inst.update(0.1)).toBe('failed');
  });

  it('[R-TECH-PITCH] two right answers out of three win a term sheet, and answers are scored per round', () => {
    const { game, inst } = landed();
    const events: string[] = [];
    game.bus.on('pitch:answer', (e) => events.push(`${e.round}:${e.correct}`));
    game.bus.on('pitch:result', (e) => events.push(`won:${e.won}:${e.score}`));
    expect(inst.answer(7)).toBe(false);
    expect(inst.answer(1)).toBe(true);
    expect(inst.phase()).toBe('verdict');
    expect(inst.chosen()).toBe(1);
    expect(inst.answer(2)).toBe(false);
    expect(inst.hud()).toContain('round 1/3');
    expect(play(inst, [0, 0])).toBe('done');
    expect(inst.results()).toEqual([true, false, true]);
    expect(inst.won()).toBe(true);
    expect(inst.progress()).toBe(1);
    expect(events).toEqual(['0:true', '1:false', '2:true', 'won:true:2']);
  });

  it('[R-TECH-PITCH] one right answer is a polite pass', () => {
    const { inst } = landed();
    const statuses: string[] = [];
    inst.answer(1);
    for (let t = 0; t < PITCH.verdict + 0.1; t += 0.1) inst.update(0.1);
    inst.answer(0);
    for (let t = 0; t < PITCH.verdict + 0.1; t += 0.1) inst.update(0.1);
    inst.answer(2);
    for (let t = 0; t < PITCH.verdict + 0.1; t += 0.1) statuses.push(inst.update(0.1));
    expect(inst.phase()).toBe('result');
    expect(inst.hud()).toContain('they passed');
    for (let t = 0; t < PITCH.result + 0.2; t += 0.1) statuses.push(inst.update(0.1));
    expect(statuses).toContain('failed');
    expect(inst.won()).toBe(false);
  });

  it('[R-TECH-PITCH] running out the clock counts as a wrong answer, and the drone stays parked', () => {
    const { game, inst } = landed(fakeGame(), def({ roundTime: 6 }));
    const parked = { ...game.flight.pos };
    game.flight.pos.x += 30;
    game.flight.vel.x = 20;
    inst.update(6.1);
    expect(game.flight.pos).toEqual(parked);
    expect(game.flight.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(inst.phase()).toBe('verdict');
    expect(inst.chosen()).toBe(-1);
    expect(inst.results()).toEqual([false]);
    expect(inst.elapsed?.()).toBeGreaterThan(6);
  });

  it('[R-TECH-PITCH] the solver lands, answers every round right and wins each pitch', async () => {
    const kinds = await loadKinds();
    for (const d of pitches.slice(0, 4)) {
      const game = fakeGame(20);
      game.activities.register(kinds, loadDefs());
      expect(replay(game, d), d.id).toBe(true);
      expect(game.save.data.best[d.id]).toBeGreaterThan(0);
    }
  });

  it('[R-TECH-PITCH] at least 12 pitches at distinct investors, each unlocked by discovering that investor', () => {
    const ids = new Set(loadDefs().map((d) => d.id));
    expect(pitches.length).toBeGreaterThanOrEqual(12);
    const params = pitches.map((d) => d.params as unknown as PitchParams);
    expect(new Set(params.map((p) => p.firm)).size).toBe(pitches.length);
    expect(new Set(params.map((p) => p.startup)).size).toBe(pitches.length);
    const bests = params.flatMap((p) => p.rounds.map((r) => r.best));
    for (const b of [0, 1, 2]) expect(bests.filter((x) => x === b).length).toBeGreaterThan(pitches.length / 2);
    for (const d of pitches) {
      expect(d.requires?.length, d.id).toBe(1);
      expect(ids.has(d.requires![0]), d.id).toBe(true);
      expect(JSON.stringify(d)).not.toMatch(/[–—]/);
    }
  });

  it('[R-TECH-PITCH] runner shows the pitch prompt nearby and completes it through the solver', async () => {
    const game = fakeGame();
    game.activities.register(await loadKinds(), [def()]);
    game.flight.pos = { ...game.activities.position(def()) };
    tick(game, 0.1);
    expect(game.activities.nearby?.id).toBe('pitch-test');
    expect(replay(game, def())).toBe(true);
  });
});
