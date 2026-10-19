import { describe, it, expect } from 'vitest';
import { Match, ordinal, COUNTDOWN, HIDE_TIME, BLIND_FOG, SEEKER_FOG, TAG_COOLDOWN, RESULTS_SECONDS, MODES, type MatchEnv, type StartSpec } from '../../src/net/modes';
import type { Msg, ModeId } from '../../src/net/protocol';
import type { Vec3 } from '../../src/player/flight';
import { netGame } from './net-helpers';

async function setup(mode: ModeId, role = 'me', extra: Partial<StartSpec> = {}) {
  const game = await netGame();
  const sent: Msg[] = [];
  const pos = new Map<string, Vec3>([['p2', { x: 500, y: 50, z: 500 }]]);
  const present = new Set(['me', 'p2']);
  const env: MatchEnv = {
    game,
    selfId: 'me',
    send: (m) => sent.push(m),
    present: (id) => present.has(id),
    pos: (id) => (id === 'me' ? game.flight.pos : (pos.get(id) ?? null)),
    name: (id) => (id === 'me' ? 'Ana' : 'Ben'),
    color: () => '#ffffff',
  };
  const spec: StartSpec = { id: 'm1', mode, roster: ['me', 'p2'], duration: 60, activity: mode === 'race' ? 'rings-marina-warmup' : '', role, ...extra };
  const m = new Match(spec, role === 'p2' ? 'p2' : 'me', env);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) m.tick(0.1);
  };
  return { m, game, sent, pos, present, run };
}

describe('multiplayer modes', () => {
  it('[R-NET-MODES] every mode has a title, icon, blurb and a sensible default length', () => {
    for (const info of Object.values(MODES)) {
      expect(info.title.length).toBeGreaterThan(3);
      expect(info.blurb).not.toMatch(/\u2014/);
      expect(info.duration).toBeGreaterThanOrEqual(60);
    }
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });

  it('[R-NET-MODES] race: lines up at the start, freezes for the countdown, then ranks finishers by time', async () => {
    const { m, game, sent, run } = await setup('race');
    const start = { ...game.flight.pos };
    game.flight.pos.x += 50;
    run(1);
    expect(game.flight.pos).toEqual(start);
    expect(m.phase).toBe('countdown');
    expect(m.countdown).toBeGreaterThan(1.5);
    expect(m.hint()).toBe('Get ready');
    expect(m.flush()).toBeNull();
    run(2.1);
    expect(m.phase).toBe('live');
    expect(game.toasts.at(-1)).toContain('Go!');
    expect(m.targets()).toHaveLength(5);
    expect(m.hint()).toContain('Marina Warmup');
    const def = game.activities.defs.get('rings-marina-warmup')!;
    const steps = game.activities.kindOf(def).solve(def, game);
    for (const s of steps) {
      if ('teleport' in s) game.teleport(s.teleport);
      run(0.5);
    }
    expect(m.scores.get('me')).toMatchObject({ s: 5, d: true });
    expect(m.scores.get('me')!.x).toBeGreaterThan(2);
    expect(sent.some((x) => x.t === 'score' && x.d)).toBe(true);
    expect(m.hint()).toContain('Finished');
    expect(m.phase).toBe('live');
    m.onMessage({ t: 'score', id: 'm1', s: 3, x: 0, d: false }, 'p2');
    expect(m.standings().map((r) => r.label)).toEqual([`${m.scores.get('me')!.x.toFixed(2)} s`, '3/5 rings']);
    m.onMessage({ t: 'score', id: 'm1', s: 5, x: 1.5, d: true }, 'p2');
    run(0.1);
    expect(m.phase).toBe('done');
    expect(m.results!.map((r) => r.name)).toEqual(['Ben', 'Ana']);
    expect(sent.at(-1)).toEqual({ t: 'end', id: 'm1' });
    expect(game.save.data.flags.mpPlayed).toBe(1);
    expect(game.save.data.flags.mpWins).toBeUndefined();
    expect(game.toasts.at(-1)).toContain('2nd of 2');
  });

  it('[R-NET-MODES] race: running out of time is a DNF and the clock ends the match', async () => {
    const { m, run } = await setup('race', 'me', { duration: 20 });
    run(COUNTDOWN + 20.2);
    expect(m.phase).toBe('done');
    expect(m.standings()[0].label).toMatch(/0\/5 rings|DNF/);
    run(RESULTS_SECONDS + 0.5);
    expect(m.expired).toBe(true);
  });

  it('[R-NET-MODES] tag: IT tags on contact, no tag-backs, and free time is scored', async () => {
    const { m, game, sent, pos, run } = await setup('tag', 'me');
    run(COUNTDOWN + 0.1);
    expect(m.hint()).toContain('You are IT');
    pos.set('p2', { ...game.flight.pos, x: game.flight.pos.x + 5 });
    run(0.1);
    expect(m.role).toBe('p2');
    expect(sent.find((x) => x.t === 'tag')).toEqual({ t: 'tag', id: 'm1', to: 'p2', n: 1 });
    expect(m.hint()).toContain('Ben is IT');
    run(1);
    m.onMessage({ t: 'tag', id: 'm1', to: 'me', n: 2 }, 'p2');
    expect(m.role).toBe('me');
    expect(game.toasts.at(-1)).toContain('You are IT');
    expect(m.hint()).toContain('No tag-backs');
    run(TAG_COOLDOWN / 2);
    expect(m.role).toBe('me');
    m.onMessage({ t: 'tag', id: 'm1', to: 'me', n: 3 }, 'p2');
    m.onMessage({ t: 'tag', id: 'm1', to: 'p2', n: 9 }, 'me');
    m.onMessage({ t: 'tag', id: 'other', to: 'p2', n: 3 }, 'me');
    m.onMessage({ t: 'tag', id: 'm1', to: 'p2', n: 3 }, 'stranger');
    expect(m.tags).toBe(2);
    pos.set('p2', { x: 9999, y: 0, z: 9999 });
    run(5);
    expect(m.scores.get('me')!.s).toBeCloseTo(1, 1);
    m.onMessage({ t: 'score', id: 'm1', s: 40, x: 0, d: false }, 'p2');
    expect(m.standings()[0]).toMatchObject({ id: 'p2', label: '40 s free' });
    expect(m.standings()[1].label).toContain('IT');
  });

  it('[R-NET-MODES] tag: if IT leaves, the role passes deterministically', async () => {
    const { m, present, run } = await setup('tag', 'p2');
    run(COUNTDOWN + 0.1);
    present.delete('p2');
    m.onLeave('p2');
    expect(m.role).toBe('me');
    run(0.1);
    expect(m.phase).toBe('done');
  });

  it('[R-NET-MODES] hide and seek: the seeker is blinded and frozen, then finds hiders in thick fog', async () => {
    const { m, game, sent, pos, run } = await setup('hide', 'me');
    const start = { ...game.flight.pos };
    run(COUNTDOWN + 1);
    expect(game.sky.fogDensity).toBe(BLIND_FOG);
    game.flight.pos.x += 30;
    run(0.1);
    expect(game.flight.pos.x).toBe(start.x);
    expect(m.hint()).toContain('Eyes closed');
    run(HIDE_TIME);
    expect(m.seeking).toBe(true);
    expect(game.sky.fogDensity).toBe(SEEKER_FOG);
    expect(m.hint()).toContain('Hunt them down');
    pos.set('p2', { ...game.flight.pos, z: game.flight.pos.z + 10 });
    run(0.1);
    expect(sent.find((x) => x.t === 'tag')).toMatchObject({ to: 'p2', n: 1 });
    expect(m.phase).toBe('done');
    expect(game.sky.fogDensity).toBe(1);
    expect(m.results!.find((r) => r.id === 'me')!.label).toBe('seeker · 1 found');
    expect(game.save.data.flags.mpWins).toBe(1);
  });

  it('[R-NET-MODES] hide and seek: a hider scores while hidden and stops once found', async () => {
    const { m, run } = await setup('hide', 'p2');
    run(COUNTDOWN + 1);
    expect(m.hint()).toContain('Hide!');
    run(HIDE_TIME);
    expect(m.hint()).toContain('Stay hidden');
    run(5);
    const s = m.scores.get('me')!.s;
    expect(s).toBeGreaterThan(4);
    m.onMessage({ t: 'tag', id: 'm1', to: 'me', n: 1 }, 'p2');
    expect(m.scores.get('me')!.d).toBe(true);
    m.onMessage({ t: 'tag', id: 'm1', to: 'me', n: 2 }, 'p2');
    expect(m.tags).toBe(1);
    run(0.1);
    expect(m.phase).toBe('done');
    expect(m.hint()).toBe('Match over');
    expect(m.results!.find((r) => r.id === 'me')!.label).toMatch(/found at \d+ s/);
  });

  it('[R-NET-MODES] formation: time within range of the leader counts, the leader gets the flock average', async () => {
    const f = await setup('formation', 'p2');
    f.run(COUNTDOWN + 0.1);
    f.pos.set('p2', { ...f.game.flight.pos, x: f.game.flight.pos.x + 10 });
    f.run(4);
    expect(f.m.scores.get('me')!.s).toBeCloseTo(4, 0);
    expect(f.m.hint()).toContain('In formation');
    f.pos.set('p2', { x: 9e3, y: 0, z: 0 });
    f.run(2);
    expect(f.m.scores.get('me')!.s).toBeCloseTo(4, 0);
    expect(f.m.hint()).toContain('Catch up');
    f.m.onMessage({ t: 'end', id: 'm1' }, 'me');
    expect(f.m.phase).toBe('live');
    f.m.onMessage({ t: 'end', id: 'm1' }, 'p2');
    expect(f.m.phase).toBe('done');
    const lead = await setup('formation', 'me');
    lead.run(COUNTDOWN + 0.1);
    expect(lead.m.hint()).toContain('You lead');
    lead.m.onMessage({ t: 'score', id: 'm1', s: 12, x: 0, d: false }, 'p2');
    lead.run(0.1);
    expect(lead.m.scores.get('me')!.s).toBe(12);
    expect(lead.m.standings().map((r) => r.label)).toEqual(['leader · 12 s avg', '12 s in formation']);
  });

  it('[R-NET-MODES] a match ends early when only one player is left', async () => {
    const { m, present, run } = await setup('tag', 'me');
    run(COUNTDOWN + 0.1);
    present.delete('p2');
    m.onLeave('p2');
    run(0.1);
    expect(m.phase).toBe('done');
    m.finish();
    expect(m.results).toHaveLength(2);
  });
});
