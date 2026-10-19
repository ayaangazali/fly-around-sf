import { describe, expect, it } from 'vitest';
import { fakeGame, loadDefs, loadKinds } from './helpers';
import { replay } from './content-tech-solve';
import { HACK, kind, placeCommits, type HackInstance, type HackParams } from '../../src/activities/kinds/hack';
import { rooftopSpots } from '../../src/systems/hackers';
import type { ActivityDef } from '../../src/activities/types';

const hacks = loadDefs().filter((d) => d.kind === 'hack');

function def(params: Partial<HackParams> = {}): ActivityDef {
  return { id: 'hack-test', kind: 'hack', title: 'Hack Test', blurb: 'a test hackathon', neighborhood: 'Mission', at: { lat: 37.76235, lon: -122.41863 }, params: { venue: 'Test Space', timeLimit: 60, ...params } };
}

describe('hack kind', () => {
  it('[R-TECH-HACK] validates venue, time limit, commit count and spread', () => {
    expect(kind.validate(def())).toEqual([]);
    expect(kind.validate({ ...def(), params: undefined })).toEqual(['params.venue is required', 'params.timeLimit must be 20..300 seconds']);
    expect(kind.validate(def({ timeLimit: 5 }))).toEqual(['params.timeLimit must be 20..300 seconds']);
    expect(kind.validate(def({ commits: 2 }))).toEqual(['params.commits must be 3..12']);
    expect(kind.validate(def({ commits: 4.5 }))).toEqual(['params.commits must be 3..12']);
    expect(kind.validate(def({ spread: 500 }))).toEqual(['params.spread must be 15..150 m']);
  });

  it('[R-TECH-HACK] scatters six deterministic commits around the venue, floating above whatever is below', () => {
    const game = fakeGame(15);
    const a = placeCommits(def(), game);
    const b = placeCommits(def(), game);
    expect(a).toEqual(b);
    expect(a).toHaveLength(HACK.commits);
    expect(placeCommits(def({ commits: 9 }), game)).toHaveLength(9);
    expect(placeCommits({ ...def(), id: 'hack-other' }, game)).not.toEqual(a);
    const c = game.world.toLocal(37.76235, -122.41863);
    for (const commit of a) {
      const r = Math.hypot(commit.p.x - c.x, commit.p.z - c.z);
      expect(r).toBeGreaterThanOrEqual(HACK.spread * 0.4 - 1e-6);
      expect(r).toBeLessThanOrEqual(HACK.spread);
      expect(commit.p.y).toBeGreaterThanOrEqual(15 + HACK.minLift);
      expect(commit.p.y).toBeLessThanOrEqual(15 + HACK.maxLift);
      expect(commit.hash).toMatch(/^[0-9a-f]{7}$/);
      expect(commit.taken).toBe(false);
    }
    expect(new Set(a.map((x) => x.hash)).size).toBe(a.length);
  });

  it('[R-TECH-HACK] flying through a commit pushes it, all six win, and every push is announced', () => {
    const game = fakeGame();
    const inst = kind.start(def(), game) as HackInstance;
    const pushes: string[] = [];
    const toasts: string[] = [];
    game.bus.on('hack:commit', (e) => pushes.push(`${e.n}/${e.total}`));
    game.bus.on('toast', (e) => toasts.push(e.text));
    expect(inst.update(1)).toBe('running');
    expect(inst.targets?.()).toHaveLength(6);
    expect(inst.hud()).toBe('Test Space  commits 0/6  59s');
    for (const [i, c] of inst.commits.entries()) {
      game.flight.pos = { x: c.p.x + 2, y: c.p.y - 2, z: c.p.z + 2 };
      const status = inst.update(0.5);
      expect(status).toBe(i === 5 ? 'done' : 'running');
      expect(inst.progress()).toBeCloseTo((i + 1) / 6);
    }
    expect(pushes).toEqual(['1/6', '2/6', '3/6', '4/6', '5/6', '6/6']);
    expect(toasts[0]).toMatch(/^Pushed [0-9a-f]{7} {2}1\/6$/);
    expect(inst.targets?.()).toEqual([]);
    expect(inst.elapsed?.()).toBeCloseTo(4);
    expect(inst.timeLeft()).toBeCloseTo(56);
  });

  it('[R-TECH-HACK] the hackathon fails when the time limit runs out', () => {
    const game = fakeGame();
    const inst = kind.start(def({ timeLimit: 30 }), game) as HackInstance;
    expect(inst.update(29)).toBe('running');
    expect(inst.update(2)).toBe('failed');
    expect(inst.timeLeft()).toBe(0);
  });

  it('[R-TECH-HACK] the solver collects every commit for real hackathons through the runner', async () => {
    const kinds = await loadKinds();
    for (const d of [def(), ...hacks.slice(0, 4)]) {
      const game = fakeGame(8);
      game.activities.register(kinds, [...loadDefs(), def()]);
      expect(replay(game, d), d.id).toBe(true);
    }
  });

  it('[R-TECH-HACK] at least 16 hackathons at distinct real venues with sources', () => {
    expect(hacks.length).toBeGreaterThanOrEqual(16);
    const venues = hacks.map((d) => (d.params as unknown as HackParams).venue);
    expect(new Set(venues).size).toBe(hacks.length);
    for (const d of hacks) {
      expect((d as ActivityDef & { sources: string[] }).sources.every((s) => s.startsWith('https://')), d.id).toBe(true);
      expect(JSON.stringify(d)).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('[R-TECH-HACK] pixel hackers stand on the venue roof, not the street beside it', () => {
    const center = { x: 0, y: 20, z: 0 };
    const roof = (x: number, z: number) => (Math.hypot(x, z) < 9 ? 20 : 0);
    const spots = rooftopSpots(center, 3, roof);
    expect(spots).toHaveLength(3);
    for (const s of spots) expect(s.y).toBe(20);
    expect(rooftopSpots(center, 4, () => 0)).toEqual([center]);
  });
});
