import { describe, expect, it, vi } from 'vitest';
import { harmonicEvents, harmonicHeight, heightBetween, parseTides, tideNow, tideSpec } from '../../src/live/tides';
import { system } from '../../src/systems/live-tides';
import { liveState } from '../../src/live/state';
import { fixture, liveGame, tick } from './live-helpers';

const oct = parseTides(fixture('noaa-tides-hilo.json'));
const june = parseTides(fixture('noaa-tides-hilo-june.json'));

describe('live tides', () => {
  it('[R-LIVE-TIDES] parses NOAA high and low predictions for station 9414290', () => {
    expect(oct).toHaveLength(11);
    expect(oct[0]).toEqual({ t: Date.parse('2026-10-18T06:38:00Z'), h: 0.192, high: false });
    expect(oct[1].high).toBe(true);
    expect(tideSpec.url(new Date('2026-10-19T12:00:00Z'))).toContain('station=9414290');
    expect(tideSpec.url(new Date('2026-10-19T12:00:00Z'))).toContain('begin_date=20261018');
    expect(() => parseTides({ error: 'x' })).toThrow();
    expect(() => parseTides({ predictions: [{ t: '2026-01-01 00:00', v: '1', type: 'H' }] })).toThrow();
  });

  it('[R-LIVE-TIDES] the harmonic fallback matches NOAA highs and lows within 5 cm and 10 minutes', () => {
    for (const events of [oct, june]) {
      const mine = harmonicEvents(events[0].t - 3 * 3600_000, events[events.length - 1].t + 3 * 3600_000);
      for (const e of events) {
        const m = mine.reduce((b, x) => (Math.abs(x.t - e.t) < Math.abs(b.t - e.t) ? x : b));
        expect(Math.abs(m.t - e.t), new Date(e.t).toISOString()).toBeLessThan(10 * 60_000);
        expect(Math.abs(m.h - e.h)).toBeLessThan(0.05);
        expect(m.high).toBe(e.high);
      }
    }
  });

  it('[R-LIVE-TIDES] the harmonic curve tracks NOAA hourly heights within 5 cm', () => {
    const hourly = (fixture('noaa-tides-hourly.json') as { predictions: { t: string; v: string }[] }).predictions;
    expect(hourly).toHaveLength(73);
    for (const p of hourly) expect(Math.abs(harmonicHeight(Date.parse(`${p.t.replace(' ', 'T')}:00Z`)) - Number(p.v))).toBeLessThan(0.05);
  });

  it('[R-LIVE-TIDES] interpolates between events and reports the next high or low', () => {
    expect(heightBetween(oct, oct[2].t)).toBeCloseTo(oct[2].h, 6);
    const mid = (oct[2].t + oct[3].t) / 2;
    expect(heightBetween(oct, mid)).toBeCloseTo((oct[2].h + oct[3].h) / 2, 6);
    expect(heightBetween(oct, 0)).toBeNull();
    const now = tideNow(oct, mid);
    expect(now.rising).toBe(true);
    expect(now.next).toEqual(oct[3]);
    expect(now.after).toEqual(oct[4]);
    const late = tideNow(oct, oct[10].t + 3600_000);
    expect(late.next).toBeNull();
    expect(late.height).toBeCloseTo(harmonicHeight(oct[10].t + 3600_000), 6);
  });

  it('[R-LIVE-FALLBACK] offline, the tide system fills a two day harmonic table', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const game = liveGame('2026-10-19T19:30:00Z', true);
    await system.init!(game);
    await tick();
    system.update!(1 / 30, game);
    const s = liveState(game);
    expect(fetch).not.toHaveBeenCalled();
    expect(s.feeds.get('tides')?.status).toBe('fallback');
    expect(s.tides.length).toBeGreaterThan(6);
    const first = s.tides;
    system.update!(1 / 30, game);
    expect(s.tides).toBe(first);
    vi.unstubAllGlobals();
  });
});
