import { afterEach, describe, expect, it, vi } from 'vitest';
import { haversineKm, newQuakes, parseQuakes, quakeSpec, QUAKE_RADIUS_KM, shakeFor } from '../../src/live/quakes';
import { system } from '../../src/systems/live-quakes';
import { liveState } from '../../src/live/state';
import { fixture, liveGame, respond, tick } from './live-helpers';

const raw = fixture('usgs-bay-area.json') as { features: { id: string; properties: { time: number } }[] };
const quakes = parseQuakes(raw);

afterEach(() => vi.unstubAllGlobals());

describe('live earthquakes', () => {
  it('[R-LIVE-QUAKE] parses the real USGS GeoJSON, newest first, all within 100 km of SF', () => {
    expect(quakes.length).toBe(20);
    expect(quakes[0]).toMatchObject({ id: 'nc75451991', mag: 1.71, place: '1 km SW of San Ramon, CA' });
    expect(quakes[0].km).toBeGreaterThan(35);
    expect(quakes[0].km).toBeLessThan(45);
    for (let i = 1; i < quakes.length; i++) expect(quakes[i].time).toBeLessThanOrEqual(quakes[i - 1].time);
    expect(quakes.every((q) => q.km <= QUAKE_RADIUS_KM)).toBe(true);
    expect(quakeSpec.url(new Date('2026-10-19T00:00:00Z'))).toContain('maxradiuskm=100');
    expect(quakeSpec.url(new Date('2026-10-19T00:00:00Z'))).toContain('starttime=2026-09-19');
  });

  it('[R-LIVE-QUAKE] drops quakes outside the radius and malformed features', () => {
    const far = { id: 'far', properties: { mag: 5, time: 1, place: 'Fresno' }, geometry: { coordinates: [-119.79, 36.74, 5] } };
    const bad = { id: 'bad', properties: { mag: 'x' }, geometry: { coordinates: [] } };
    const near = { id: 'near', properties: { mag: 2, time: 2 }, geometry: { coordinates: [-122.42, 37.77, 4] } };
    const list = parseQuakes({ features: [far, bad, near] });
    expect(list.map((q) => q.id)).toEqual(['near']);
    expect(list[0].place).toBe('Bay Area');
    expect(() => parseQuakes({ type: 'nope' })).toThrow();
    expect(haversineKm(37.7749, -122.4194, 37.8044, -122.2712)).toBeCloseTo(13.4, 0);
  });

  it('[R-LIVE-QUAKE] only reports ids not seen before and recent enough', () => {
    const seen = new Set<string>();
    expect(newQuakes(seen, quakes.slice(1), 0)).toHaveLength(19);
    expect(newQuakes(seen, quakes, quakes[0].time - 1).map((q) => q.id)).toEqual(['nc75451991']);
    expect(newQuakes(seen, quakes, 0)).toEqual([]);
    expect(shakeFor({ mag: 6, km: 20 })).toBe(2.5);
    expect(shakeFor({ mag: 1, km: 90 })).toBe(0.25);
    expect(shakeFor({ mag: 4, km: 10 })).toBeGreaterThan(shakeFor({ mag: 3, km: 10 }));
  });

  it('[R-LIVE-QUAKE] a new quake during the session shakes the camera, toasts and grants the rare card once', async () => {
    const first = { ...raw, features: raw.features.slice(1) };
    let body: unknown = first;
    vi.stubGlobal('fetch', vi.fn(() => respond(body)));
    const game = liveGame('2026-10-18T19:00:00Z');
    const now = raw.features[0].properties.time + 600_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now - 300_000);
    await system.init!(game);
    await system.poll(game, now - 200_000);
    expect(game.chase.shake).toBe(0);
    body = raw;
    await system.poll(game, now);
    expect(game.chase.shake).toBeGreaterThan(0);
    expect(game.toasts).toEqual(['Earthquake! M1.7, 1 km SW of San Ramon, CA (38 km away)', 'New card: Felt a Quake']);
    expect(game.save.data.cards).toEqual(['felt-a-quake']);
    expect(liveState(game).quakes[0].id).toBe('nc75451991');
    await system.poll(game, now + 200_000);
    expect(game.toasts).toHaveLength(2);
    vi.useRealTimers();
  });

  it('[R-LIVE-FALLBACK] with the network down the quake list is empty and nothing shakes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const game = liveGame('2026-10-18T19:00:00Z');
    await system.init!(game);
    await tick();
    for (let i = 0; i < 4; i++) system.update!(60, game);
    await tick();
    expect(liveState(game).feeds.get('quakes')?.status).toBe('fallback');
    expect(liveState(game).quakes).toEqual([]);
    expect(game.chase.shake).toBe(0);
  });
});
