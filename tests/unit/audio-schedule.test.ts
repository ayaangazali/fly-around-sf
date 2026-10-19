import { describe, it, expect } from 'vitest';
import { ALCATRAZ_HORN, GGB_MIDSPAN, GGB_SOUTH_TOWER, blastsBetween, crossedHour, graceHour, graceRings, hourLabel, sfClock } from '../../src/audio/schedule';

const at = (iso: string) => Date.parse(iso);

describe('audio schedules', () => {
  it('[R-AUDIO-BELLS] reads the San Francisco wall clock through daylight saving', () => {
    expect(sfClock(new Date('2026-10-19T19:30:00Z'))).toEqual({ hour: 12, minute: 30 });
    expect(sfClock(new Date('2026-01-15T20:05:00Z'))).toEqual({ hour: 12, minute: 5 });
    expect(sfClock(new Date('2026-10-19T07:00:00Z'))).toEqual({ hour: 0, minute: 0 });
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(12)).toBe('12 PM');
    expect(hourLabel(15)).toBe('3 PM');
  });

  it('[R-AUDIO-BELLS] detects the top of the hour once, and never on a clock jump', () => {
    const h = crossedHour(at('2026-10-19T18:59:59Z'), at('2026-10-19T19:00:00.5Z'));
    expect(h).toBe(at('2026-10-19T19:00:00Z'));
    expect(crossedHour(at('2026-10-19T19:00:00.5Z'), at('2026-10-19T19:00:01Z'))).toBeNull();
    expect(crossedHour(at('2026-10-19T18:30:00Z'), at('2026-10-19T19:30:00Z'))).toBeNull();
    expect(crossedHour(at('2026-10-19T19:00:01Z'), at('2026-10-19T18:59:59Z'))).toBeNull();
  });

  it('[R-AUDIO-BELLS] Grace Cathedral rings Grace Chimes and the bourdon from 9 AM to 6 PM only', () => {
    expect(graceRings(8)).toBe(false);
    expect(graceRings(9)).toBe(true);
    expect(graceRings(18)).toBe(true);
    expect(graceRings(19)).toBe(false);
    expect(graceHour(7)).toEqual([]);
    expect(graceHour(22)).toEqual([]);
    const ten = graceHour(10);
    expect(ten.slice(0, 16).map((s) => s.midi)).toEqual([60, 62, 64, 60, 55, 62, 64, 60, 62, 64, 60, 55, 64, 62, 64, 60]);
    expect(ten.slice(16).map((s) => s.midi)).toEqual(Array(10).fill(55));
  });

  it('[R-AUDIO-BELLS] the angelus follows the hour at noon and 6 PM on middle C', () => {
    for (const hour of [12, 18]) {
      const s = graceHour(hour);
      const strikes = hour % 12 || 12;
      const angelus = s.slice(16 + strikes);
      expect(angelus).toHaveLength(9 + 12);
      expect(angelus.every((x) => x.midi === 60)).toBe(true);
      expect(angelus[0].t).toBeGreaterThan(s[16 + strikes - 1].t);
    }
    expect(graceHour(15).length).toBe(16 + 3);
  });

  it('[R-AUDIO-BELLS] foghorns follow the Coast Guard Light List characteristics', () => {
    expect(blastsBetween(GGB_SOUTH_TOWER, 0, 60).map((b) => [b.t, b.dur])).toEqual([
      [0, 2],
      [20, 2],
      [40, 2],
    ]);
    expect(blastsBetween(GGB_MIDSPAN, 0, 90).map((b) => [b.t, b.dur])).toEqual([
      [9, 1],
      [12, 1],
      [49, 1],
      [52, 1],
      [89, 1],
    ]);
    const alca = blastsBetween(ALCATRAZ_HORN, 0, 60);
    expect(alca.map((b) => [b.t, b.dur])).toEqual([
      [17, 2],
      [21, 2],
      [47, 2],
      [51, 2],
    ]);
    expect(blastsBetween(GGB_SOUTH_TOWER, 20.5, 39.9)).toEqual([]);
    expect(blastsBetween(GGB_SOUTH_TOWER, 1000, 1000.5)).toEqual([{ t: 1000, dur: 2, freq: 147 }]);
  });
});
