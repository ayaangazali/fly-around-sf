import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, fakeGame, loadDefs, loadKinds, walk } from './helpers';
import type { ActivityDef } from '../../src/activities/types';
import type { CardDef } from '../../src/content/types';
import type { Game } from '../../src/game';
import { chapters, kind as quest, objectivePoints, type QuestParams } from '../../src/activities/kinds/quest';
import { clock, geoErrors, guide, hintsUnlocked, pointTo, reached, touched, type Line, type QuestInstance } from '../../src/activities/quest-common';
import { arrived, nextChapterWaypoint, questMarkers } from '../../src/systems/quests';

const defs = loadDefs();
const story = chapters(defs);
const cards = walk(join(ROOT, 'src/content/cards'), '.json').flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as CardDef[]);

async function setup(): Promise<Game> {
  const game = fakeGame();
  game.activities.register(await loadKinds(), defs);
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

const base = { id: 'q', kind: 'quest', title: 'Q', blurb: 'a quest blurb', neighborhood: 'Test', at: { lat: 37.78, lon: -122.42 } };
const goto = (lat: number, text = 'go there') => ({ type: 'goto' as const, text, at: { lat, lon: -122.42 } });
const params = (over: Partial<QuestParams> = {}): QuestParams => ({ chapter: 1, intro: ['Hello there'], outro: ['Goodbye now'], objectives: [goto(37.781), goto(37.782), goto(37.783)], ...over });

describe('main quest content', () => {
  it('[R-QUEST] has twelve chapters numbered 1..12, each locked behind the one before', () => {
    expect(story.map((d) => (d.params as unknown as QuestParams).chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(story[0].requires ?? []).toEqual([]);
    story.slice(1).forEach((d, i) => expect(d.requires, d.id).toEqual([story[i].id]));
    for (const d of story) {
      const p = d.params as unknown as QuestParams;
      expect(quest.validate(d), d.id).toEqual([]);
      expect(p.objectives.length).toBeGreaterThanOrEqual(3);
      expect(p.objectives.length).toBeLessThanOrEqual(6);
      expect(d.card, d.id).toBeTruthy();
    }
  });

  it('[R-QUEST] every chapter reward card exists with lore, facts and sources', () => {
    for (const d of story) {
      const c = cards.find((x) => x.id === d.card);
      expect(c, d.card).toBeDefined();
      expect(c!.lore.length).toBeGreaterThan(80);
      expect(c!.facts.length).toBeGreaterThan(1);
      expect(c!.sources.every((s) => s.startsWith('https://'))).toBe(true);
    }
  });

  it('[R-QUEST] tours the whole city and every objective type appears', () => {
    const hoods = new Set(story.map((d) => d.neighborhood));
    expect(hoods.size).toBe(12);
    const types = new Set(story.flatMap((d) => (d.params as unknown as QuestParams).objectives.map((o) => o.type)));
    expect([...types].sort()).toEqual(['collect', 'find', 'goto', 'read', 'riddle']);
  });

  it('[R-QUEST] story text never uses em dashes', () => {
    const text = JSON.stringify([story, cards.filter((c) => c.id.startsWith('quest-'))]);
    expect(text).not.toContain('—');
  });
});

describe('main quest play', () => {
  it('[R-QUEST] chapters complete in order with the solver, each one locked until the last is done', async () => {
    const game = await setup();
    const unlocked: string[] = [];
    game.bus.on('card:unlock', (e) => unlocked.push(e.id));
    for (const [i, d] of story.entries()) {
      for (const later of story.slice(i + 1)) expect(game.activities.locked(later), later.id).toBe(true);
      expect(game.activities.locked(d)).toBe(false);
      play(game, d.id);
      expect(game.save.isDone(d.id), d.id).toBe(true);
    }
    expect(unlocked).toEqual(story.map((d) => d.card));
  });

  it('[R-QUEST] reveals objectives one at a time, in order, with clues and dialogue between them', async () => {
    const game = await setup();
    const d = story[0];
    const p = d.params as unknown as QuestParams;
    const shown: string[] = [];
    const said: Line[] = [];
    game.bus.on('quest:objective', (o) => shown.push(o.text));
    game.bus.on('quest:say', (s) => said.push(...s.lines));
    play(game, d.id);
    expect(said.slice(0, p.intro.length).map((l) => l.text)).toEqual(p.intro);
    expect(shown).toEqual(p.objectives.map((o) => o.text));
    expect(said.some((l) => l.who === 'Recovered reflog')).toBe(true);
    expect(said.at(-1)?.text).toBe(p.outro.at(-1));
  });

  it('[R-QUEST] waypoints lead to the next chapter, then to each objective in turn', async () => {
    const game = await setup();
    game.bus.on('activity:complete', ({ id }) => nextChapterWaypoint(game, id));
    play(game, story[0].id);
    const ch2 = story[1];
    expect(game.waypoint).toMatchObject({ ...game.activities.position(ch2), label: `Chapter 2: ${ch2.title}` });
    game.flight.pos = { ...game.activities.position(ch2) };
    game.activities.update(0.05);
    expect(game.activities.nearby?.id).toBe(ch2.id);
    expect(game.activities.start(ch2.id)).toBe(true);
    for (const o of (ch2.params as unknown as QuestParams).objectives) {
      const pts = objectivePoints(o, game);
      if (o.type === 'find' || o.type === 'riddle') expect(game.waypoint, o.text).toBeNull();
      else expect(game.waypoint, o.text).toMatchObject({ x: pts[0].x, z: pts[0].z, label: o.text });
      for (const [i, q] of pts.entries()) {
        game.flight.pos = { ...q };
        game.activities.update(0.05);
        if (o.type === 'collect' && i + 1 < pts.length) expect(game.waypoint).toMatchObject({ x: pts[i + 1].x, z: pts[i + 1].z });
      }
    }
    game.activities.update(0.05);
    expect(game.save.isDone(ch2.id)).toBe(true);
    expect(game.waypoint?.label).toBe(`Chapter 3: ${story[2].title}`);
  });

  it('[R-QUEST] the next-chapter waypoint never replaces a waypoint the player set elsewhere', async () => {
    const game = await setup();
    game.bus.on('activity:complete', ({ id }) => nextChapterWaypoint(game, id));
    game.waypoint = { x: 1, y: 2, z: 3, label: 'mine' };
    play(game, story[0].id);
    expect(game.waypoint.label).toBe('mine');
    nextChapterWaypoint(game, 'not-a-chapter');
    expect(game.waypoint.label).toBe('mine');
  });

  it('[R-QUEST] cannot start chapter two before chapter one', async () => {
    const game = await setup();
    expect(game.activities.start(story[1].id)).toBe(false);
    expect(game.activities.start(story[11].id)).toBe(false);
  });
});

describe('quest kind mechanics', () => {
  const run = (p: QuestParams, game = fakeGame()) => {
    const def = { ...base, params: p } as unknown as ActivityDef;
    return { game, def, inst: quest.start(def, game) as QuestInstance };
  };

  it('[R-QUEST] validates chapter, lines, objective counts and every objective shape', () => {
    const v = (p: unknown) => quest.validate({ ...base, params: p } as unknown as ActivityDef);
    expect(v(params())).toEqual([]);
    expect(v(undefined)).toEqual(['params missing']);
    expect(v(params({ chapter: 0 })).join()).toContain('chapter');
    expect(v(params({ intro: [] })).join()).toContain('intro');
    expect(v(params({ objectives: [goto(37.78)] })).join()).toContain('3 to 6');
    const bad = [
      { type: 'dance', text: 'x' },
      { type: 'goto', text: '' , at: { lat: 37.78, lon: -122.42 } },
      { type: 'goto', text: 'off the map', at: { lat: 40, lon: -122.42 } },
      { type: 'collect', text: 'one piece', pieces: [{ lat: 37.78, lon: -122.42 }] },
      { type: 'collect', text: 'bad piece', pieces: [{ lat: 37.78, lon: -122.42 }, { lat: 'x' }] },
      { type: 'riddle', text: 'no hints here', at: { lat: 37.78, lon: -122.42 } },
      { type: 'read', text: 'no clue here', at: { lat: 37.78, lon: -122.42 } },
      { type: 'goto', text: 'huge radius', at: { lat: 37.78, lon: -122.42 }, radius: 9000 },
      { type: 'goto', text: 'bad lines', at: { lat: 37.78, lon: -122.42 }, say: [3] },
    ];
    const errors = [...v(params({ objectives: bad.slice(0, 5) as never })), ...v(params({ objectives: bad.slice(5) as never }))];
    for (const s of ['unknown type', 'text', 'outside San Francisco', 'at least 2 pieces', 'piece 2', 'hints', 'clue', 'radius', 'say']) expect(errors.join('\n')).toContain(s);
  });

  it('[R-QUEST] hidden objects appear only when the drone is close, and collect pieces count down', () => {
    const find = { type: 'find' as const, text: 'find the shard', at: { lat: 37.781, lon: -122.42 } };
    const collect = { type: 'collect' as const, text: 'grab both', pieces: [{ lat: 37.782, lon: -122.42 }, { lat: 37.783, lon: -122.42 }] };
    const { game, inst } = run(params({ objectives: [find, collect, goto(37.784)] }));
    expect(inst.markers()).toEqual([]);
    const shard = objectivePoints(find, game)[0];
    game.flight.pos = { ...shard, z: shard.z + 100 };
    expect(inst.markers()[0].style).toBe('shard');
    expect(inst.targets?.()).toHaveLength(1);
    game.flight.pos = { ...shard };
    inst.update(0.1);
    expect(inst.markers()).toHaveLength(2);
    expect(inst.hud()).toContain('shards 0/2');
    const [a, b] = objectivePoints(collect, game);
    game.flight.pos = { ...a };
    inst.update(0.1);
    expect(inst.markers()).toHaveLength(1);
    expect(game.waypoint).toMatchObject({ x: b.x, z: b.z });
    game.flight.pos = { ...b };
    inst.update(0.1);
    expect(inst.markers()[0].style).toBe('beacon');
    expect(inst.progress()).toBeCloseTo(2 / 3);
    game.flight.pos = { ...objectivePoints(goto(37.784), game)[0] };
    expect(inst.update(0.1)).toBe('done');
    expect(inst.hud()).toContain('Chapter 1');
    expect(inst.markers()).toEqual([]);
    expect(inst.elapsed?.()).toBeCloseTo(0.4);
  });

  it('[R-QUEST] riddle objectives unlock hints after 60 and 120 seconds', () => {
    const riddle = { type: 'riddle' as const, text: 'where am I', at: { lat: 37.781, lon: -122.42 }, hints: ['first hint', 'second hint'] };
    const { game, inst } = run(params({ objectives: [riddle, goto(37.782), goto(37.783)] }));
    const hints: (string | undefined)[] = [];
    game.bus.on('quest:objective', (o) => hints.push(o.hint));
    expect(inst.hud()).toContain('hint in 1:00');
    expect(inst.markers()).toEqual([]);
    inst.update(60);
    inst.update(60);
    expect(hints).toEqual(['first hint', 'first hint\nsecond hint']);
    expect(inst.hud()).not.toContain('hint in');
  });

  it('[R-QUEST] guides the player with a waypoint but never overwrites one the player set', () => {
    const game = fakeGame();
    const { inst } = run(params(), game);
    expect(game.waypoint?.label).toBe('go there');
    inst.dispose?.();
    expect(game.waypoint).toBeNull();
    game.waypoint = { x: 1, y: 2, z: 3, label: 'mine' };
    const second = run(params(), game).inst;
    expect(game.waypoint.label).toBe('mine');
    second.dispose?.();
    expect(game.waypoint.label).toBe('mine');
    guide(game, null, '');
    expect(game.waypoint.label).toBe('mine');
  });

  it('[R-QUEST] a chapter takes over a waypoint set from the quest log', () => {
    const game = fakeGame();
    pointTo(game, { x: 9, y: 9, z: 9 }, 'Chapter 1: Q');
    run(params(), game);
    expect(game.waypoint?.label).toBe('go there');
  });
});

describe('quest helpers', () => {
  it('[R-QUEST] geometry, clocks and hint timing behave at the edges', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(125.9)).toBe('2:05');
    expect(clock(-4)).toBe('0:00');
    expect(hintsUnlocked(59.9)).toBe(0);
    expect(hintsUnlocked(60)).toBe(1);
    expect(hintsUnlocked(500)).toBe(2);
    expect(geoErrors(undefined, 'p')).toEqual(['p needs lat/lon']);
    expect(geoErrors({ lat: 37.78, lon: -122.42 }, 'p')).toEqual([]);
    const t = { x: 0, y: 10, z: 0 };
    expect(reached({ x: 30, y: 100, z: 0 }, t, 40)).toBe(true);
    expect(reached({ x: 30, y: 400, z: 0 }, t, 40)).toBe(false);
    expect(reached({ x: 50, y: 10, z: 0 }, t, 40)).toBe(false);
    expect(touched({ x: 3, y: 14, z: 0 }, t, 5)).toBe(true);
    expect(touched({ x: 3, y: 20, z: 0 }, t, 5)).toBe(false);
  });
});

describe('quest waypoints in the world', () => {
  it('[R-QUESTLOG] a quest waypoint gets its own beacon, a player waypoint does not', () => {
    const game = fakeGame();
    expect(questMarkers(game, null)).toEqual([]);
    game.waypoint = { x: 1, y: 2, z: 3, label: 'mine' };
    expect(questMarkers(game, null)).toEqual([]);
    pointTo(game, { x: 5, y: 6, z: 7 }, 'Chapter 1: Q');
    expect(questMarkers(game, null)).toEqual([{ p: game.waypoint, style: 'beacon' }]);
    const { inst } = (() => {
      const def = { ...base, params: params() } as unknown as ActivityDef;
      return { inst: quest.start(def, game) as QuestInstance };
    })();
    expect(questMarkers(game, inst)).toHaveLength(1);
  });

  it('[R-QUESTLOG] arriving at a riddle or hunt clears the quest waypoint that led there', async () => {
    const game = await setup();
    const riddle = defs.find((d) => d.kind === 'riddle') as ActivityDef;
    const other = defs.find((d) => d.kind === 'scavenger') as ActivityDef;
    pointTo(game, game.activities.position(other), other.title);
    arrived(game, riddle.id);
    expect(game.waypoint?.label).toBe(other.title);
    pointTo(game, game.activities.position(riddle), riddle.title);
    arrived(game, story[0].id);
    arrived(game, 'missing');
    expect(game.waypoint?.label).toBe(riddle.title);
    arrived(game, riddle.id);
    expect(game.waypoint).toBeNull();
    arrived(game, riddle.id);
    expect(game.waypoint).toBeNull();
  });
});

describe('activity start points', () => {
  it('[R-QUEST] [R-RIDDLE] [R-SCAVENGER] no two startable activities share a start point, so F always starts the one you see', async () => {
    const game = await setup();
    const startable = defs.filter((d) => !game.activities.kindOf(d).passive);
    const clashes: string[] = [];
    for (const [i, a] of startable.entries()) {
      const pa = game.activities.position(a);
      for (const b of startable.slice(i + 1)) {
        const pb = game.activities.position(b);
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        if (d < 45) clashes.push(`${a.id} and ${b.id}: ${d.toFixed(1)} m`);
      }
    }
    expect(clashes).toEqual([]);
  });
});
