import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers';
import { breakdowns, formatDuration, pilotLevel } from '../../src/ui/stats-model';
import type { ActivityKind } from '../../src/activities/types';

const k = (kind: string, passive = false): ActivityKind => ({ kind, label: kind.toUpperCase(), icon: '*', passive, validate: () => [], start: () => ({ update: () => 'running', progress: () => 0, hud: () => '' }), solve: () => [] });

describe('pilot log', () => {
  it('[R-ACHIEVEMENTS] levels grow with XP on a square curve', () => {
    expect(pilotLevel(0)).toEqual({ level: 1, into: 0, span: 50 });
    expect(pilotLevel(49).level).toBe(1);
    expect(pilotLevel(50)).toEqual({ level: 2, into: 0, span: 150 });
    expect(pilotLevel(340)).toEqual({ level: 3, into: 140, span: 250 });
    expect(pilotLevel(-5).level).toBe(1);
  });

  it('[R-ACHIEVEMENTS] durations read naturally', () => {
    expect(formatDuration(0)).toBe('0m 00s');
    expect(formatDuration(95.7)).toBe('1m 35s');
    expect(formatDuration(3 * 3600 + 7 * 60)).toBe('3h 07m');
  });

  it('[R-ACHIEVEMENTS] completion breaks down by neighborhood and kind, skipping achievements and unfound secrets', () => {
    const g = fakeGame();
    const base = { title: 't', blurb: 'b', at: { lat: 37.77, lon: -122.42 } };
    g.activities.register(
      [k('rings'), k('discover', true), k('achievement', true)],
      [
        { ...base, id: 'rings-a', kind: 'rings', neighborhood: 'Marina' },
        { ...base, id: 'rings-b', kind: 'rings', neighborhood: 'Mission' },
        { ...base, id: 'discover-c', kind: 'discover', neighborhood: 'Marina' },
        { ...base, id: 'discover-d', kind: 'discover', neighborhood: 'Marina', hidden: true },
        { ...base, id: 'achievement-e', kind: 'achievement', neighborhood: 'Citywide' },
      ],
    );
    g.save.complete('rings-a');
    g.save.complete('discover-c');
    const { byHood, byKind } = breakdowns(g);
    expect(byHood.map((h) => [h.key, h.done, h.total])).toEqual([
      ['Marina', 2, 2],
      ['Mission', 0, 1],
    ]);
    expect(byKind.map((h) => [h.key, h.label, h.done, h.total])).toEqual([
      ['discover', 'DISCOVER', 1, 1],
      ['rings', 'RINGS', 1, 2],
    ]);
  });
});
