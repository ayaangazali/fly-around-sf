import { afterEach, describe, expect, it, vi } from 'vitest';
import { climate, describe as describeCode, fogDensity, fogLabel, gustFactor, MAX_WIND, parseWeather, sampleAt, weatherSpec, windVector } from '../../src/live/weather';
import { system } from '../../src/systems/live-weather';
import { fixture, liveGame, respond, tick } from './live-helpers';

const samples = parseWeather(fixture('open-meteo-sf.json'));
const at = (iso: string) => sampleAt(samples, Date.parse(iso))!;

afterEach(() => vi.unstubAllGlobals());

describe('live weather', () => {
  it('[R-LIVE-WEATHER] parses every hour of the real Open-Meteo response', () => {
    expect(samples).toHaveLength(120);
    expect(samples[0].t).toBe(Date.parse('2026-10-16T00:00:00Z'));
    const fog = at('2026-10-18T18:00:00Z');
    expect(fog).toMatchObject({ code: 45, vis: 200, lowCloud: 100, wind: 3.98, dir: 266 });
    expect(weatherSpec.url(new Date())).toContain('api.open-meteo.com');
    expect(() => parseWeather({})).toThrow();
    expect(() => parseWeather({ hourly: { time: ['x'], temperature_2m: [] } })).toThrow();
    expect(() => parseWeather({ hourly: { time: [] } })).toThrow();
  });

  it('[R-LIVE-WEATHER] real fog thickens the game fog to Karl and clear air leaves it normal', () => {
    expect(fogDensity(at('2026-10-18T18:00:00Z'))).toBe(3);
    expect(fogDensity(at('2026-10-16T21:00:00Z'))).toBe(1);
    const overcast = fogDensity(at('2026-10-19T09:00:00Z'));
    expect(overcast).toBeGreaterThan(1.2);
    expect(overcast).toBeLessThan(2);
    expect(fogLabel(3)).toBe('Karl is here');
    expect(fogLabel(1)).toBe('Clear air');
  });

  it('[R-LIVE-WEATHER] the real westerly pushes the drone east, the offshore wind pushes it west', () => {
    const westerly = windVector(at('2026-10-19T02:00:00Z'), 10, 0);
    expect(westerly.x).toBeGreaterThan(2);
    expect(Math.abs(westerly.z)).toBeLessThan(0.3);
    const offshore = windVector(at('2026-10-16T17:00:00Z'), 10, 0);
    expect(offshore.x).toBeLessThan(0);
    expect(offshore.z).toBeLessThan(0);
    const low = Math.hypot(...Object.values(windVector(at('2026-10-19T02:00:00Z'), 1, 0)));
    const high = Math.hypot(...Object.values(windVector(at('2026-10-19T02:00:00Z'), 400, 0)));
    expect(high).toBeGreaterThan(low * 1.5);
    expect(high).toBeCloseTo(MAX_WIND, 6);
  });

  it('[R-LIVE-WEATHER] interpolates between hours and wraps wind direction through north', () => {
    const s = [
      { t: 0, temp: 10, code: 0, lowCloud: 0, vis: 20000, wind: 2, dir: 350, gust: 4 },
      { t: 3600_000, temp: 12, code: 3, lowCloud: 100, vis: 10000, wind: 4, dir: 10, gust: 6 },
    ];
    const mid = sampleAt(s, 1800_000)!;
    expect(mid.temp).toBe(11);
    expect(mid.dir).toBeCloseTo(0, 5);
    expect(mid.code).toBe(3);
    expect(sampleAt(s, 0)!.code).toBe(0);
    expect(sampleAt(s, 5 * 3600_000)).toBeNull();
    expect(sampleAt([], 0)).toBeNull();
    const gusts = Array.from({ length: 60 }, (_, i) => gustFactor(i * 0.7));
    expect(Math.min(...gusts)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...gusts)).toBeLessThanOrEqual(1);
  });

  it('[R-LIVE-FALLBACK] the offline climate model is foggy on July mornings and clear on October afternoons', () => {
    const july = climate(new Date('2026-07-15T14:00:00Z'));
    expect(fogDensity(july)).toBeGreaterThan(2.4);
    const oct = climate(new Date('2026-10-15T23:00:00Z'));
    expect(fogDensity(oct)).toBeLessThan(1.5);
    expect(windVector(oct, 10, 0).x).toBeGreaterThan(0);
  });

  it('[R-LIVE-WEATHER] names every WMO weather code', () => {
    expect([0, 1, 2, 3, 45, 48, 53, 63, 81, 73, 95, 4].map((c) => describeCode(c).text)).toEqual([
      'Clear',
      'Mostly clear',
      'Partly cloudy',
      'Overcast',
      'Fog',
      'Fog',
      'Drizzle',
      'Rain',
      'Rain',
      'Snow',
      'Thunderstorm',
      'Cloudy',
    ]);
  });

  it('[R-LIVE-WEATHER] the weather system writes real fixture fog and wind into the game', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(fixture('open-meteo-sf.json'))));
    const game = liveGame('2026-10-18T18:00:00Z');
    await system.init!(game);
    await tick();
    system.update!(1 / 30, game);
    expect(system.state(game).feeds.get('weather')?.status).toBe('live');
    expect(game.sky.fogDensity).toBe(3);
    expect(game.env.wind!.x).toBeGreaterThan(0.5);
    expect(game.save.data.cards).toEqual([]);
    game.flight.vel.x = 10;
    game.flight.speed = 10;
    system.update!(1 / 30, game);
    expect(game.save.data.cards).toContain('karl-the-fog');
    expect(game.toasts).toContain('New card: Karl the Fog');
  });

  it('[R-LIVE-FALLBACK] in plain test mode the weather system stays offline and leaves the game calm', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const game = liveGame('2026-07-15T14:00:00Z', true);
    await system.init!(game);
    await tick();
    for (let i = 0; i < 10; i++) system.update!(40, game);
    expect(fetch).not.toHaveBeenCalled();
    expect(system.state(game).feeds.get('weather')?.status).toBe('fallback');
    expect(system.state(game).fog).toBeGreaterThan(2.4);
    expect(game.sky.fogDensity).toBe(1);
    expect(game.env.wind).toBeUndefined();
  });
});
