import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { alongPath, extrapolate, flowPath, FLOWS, parseOpenSky, planeSpec, simulate } from '../../src/live/planes';
import { M_PER_DEG_LAT, M_PER_DEG_LON } from '../../src/core/geo';
import { system, currentPlanes } from '../../src/systems/live-planes';
import { liveState } from '../../src/live/state';
import { toLocal } from '../../src/core/geo';
import { fixture, liveGame, respond, tick } from './live-helpers';

afterEach(() => vi.unstubAllGlobals());

const NOON = Date.parse('2026-10-19T19:30:00Z');

describe('live planes', () => {
  it('[R-LIVE-PLANES] parses the real OpenSky response and keeps only airborne aircraft', () => {
    const t = parseOpenSky(fixture('opensky-sf.json'));
    expect(t.time).toBe(1792402340_000);
    expect(t.planes).toHaveLength(1);
    expect(t.planes[0]).toMatchObject({ id: 'a7f50e', label: 'UAL2416', alt: 2400.3, track: 358.08, speed: 153.9, landing: true });
    expect(planeSpec.url(new Date())).toContain('lamin=37.45');
    expect(() => parseOpenSky({ states: [] })).toThrow();
    expect(parseOpenSky({ time: 1, states: null }).planes).toEqual([]);
    const anon = parseOpenSky({ time: 1, states: [['abc123', '  ', 'US', 1, 1, -122.4, 37.7, 1000, false, 100, 90, 0, null, null]] });
    expect(anon.planes[0]).toMatchObject({ label: 'ABC123', alt: 1000 });
  });

  it('[R-LIVE-PLANES] extrapolates live positions along the track for up to two minutes', () => {
    const t = parseOpenSky(fixture('opensky-sf.json'));
    const [p] = extrapolate(t, t.time + 60_000);
    const dn = (p.lat - t.planes[0].lat) * M_PER_DEG_LAT;
    const de = (p.lon - t.planes[0].lon) * M_PER_DEG_LON;
    expect(Math.hypot(dn, de)).toBeCloseTo(153.9 * 60, -1);
    expect(dn).toBeGreaterThan(0);
    expect(p.alt).toBeCloseTo(2400.3 + 17.56 * 60, 3);
    expect(extrapolate(t, t.time + 3600_000)[0].lat).toBeCloseTo(extrapolate(t, t.time + 120_000)[0].lat, 9);
  });

  it('[R-LIVE-PLANES] simulated SFO arrivals fly the runway 28 final course on a 3 degree glide path', () => {
    const arrivals = simulate(NOON, 12).filter((p) => p.id.startsWith('sfo-28r') && p.alt > 20);
    expect(arrivals.length).toBeGreaterThan(0);
    const thr = { lat: 37.613534, lon: -122.357141 };
    for (const p of arrivals) {
      expect(p.track).toBeCloseTo(298, 6);
      const d = Math.hypot((p.lat - thr.lat) * M_PER_DEG_LAT, (p.lon - thr.lon) * M_PER_DEG_LON);
      expect(p.alt).toBeCloseTo(15 + d * Math.tan((3 * Math.PI) / 180), -1);
      expect(p.climb).toBeLessThan(0);
      expect(p.landing).toBe(true);
    }
  });

  it('[R-LIVE-PLANES] simulated departures climb out of 1L/1R and OAK 30 and turn over the bay', () => {
    const sfo = flowPath(FLOWS.find((f) => f.id === 'sfo-01r')!);
    const climb = alongPath(sfo, 6000);
    expect(climb.heading).toBe(28);
    expect(climb.grade).toBeGreaterThan(0.05);
    expect(alongPath(sfo, sfo.length).heading).toBeCloseTo(98, 9);
    expect(alongPath(sfo, sfo.length).y).toBe(4200);
    const oak = flowPath(FLOWS.find((f) => f.id === 'oak-30-dep')!);
    expect(alongPath(oak, 1000).heading).toBe(310);
    expect(alongPath(oak, 1000).y).toBe(2);
    expect(flowPath(FLOWS[0])).toBe(flowPath(FLOWS[0]));
    const deps = simulate(NOON, 12).filter((p) => p.label.includes('departure'));
    expect(deps.length).toBeGreaterThan(2);
    expect(deps.some((p) => p.bank > 0)).toBe(true);
  });

  it('[R-LIVE-PLANES] traffic is deterministic and thins out after midnight', () => {
    expect(simulate(NOON, 12)).toEqual(simulate(NOON, 12));
    let day = 0;
    let night = 0;
    for (let i = 0; i < 12; i++) {
      day += simulate(NOON + i * 600_000, 12).length;
      night += simulate(NOON + i * 600_000, 3).length;
    }
    expect(night).toBeLessThan(day * 0.5);
    expect(night).toBeGreaterThan(0);
  });

  it('[R-LIVE-PLANES] the planes system renders simulated traffic and warns of a close call once', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const game = liveGame('2026-10-19T19:30:00Z');
    await system.init!(game);
    await tick();
    system.update!(1 / 30, game);
    const s = liveState(game);
    expect(s.feeds.get('planes')?.status).toBe('fallback');
    expect(s.planes.length).toBeGreaterThan(3);
    const group = game.scene.getObjectByName('live-planes') as THREE.Group;
    expect(group.children.filter((c) => c.visible).length).toBe(Math.min(24, s.planes.length));
    const p = s.planes[0];
    const { x, z } = toLocal(p.lat, p.lon);
    game.flight.pos = { x: x + 30, y: p.alt, z };
    system.update!(0, game);
    expect(game.toasts[0]).toMatch(/^Close call! .+ passed \d+ m away$/);
    expect(game.save.data.cards).toEqual(['plane-spotter']);
    expect(game.chase.shake).toBeGreaterThan(0);
    system.update!(0, game);
    expect(game.toasts).toHaveLength(2);
  });

  it('[R-LIVE-PLANES] uses live OpenSky traffic when the feed works and the clock is real', async () => {
    const t = fixture('opensky-sf.json') as { time: number };
    const now = Date.now();
    vi.stubGlobal('fetch', vi.fn(() => respond({ ...t, time: Math.floor(now / 1000) })));
    const game = liveGame(new Date(now).toISOString());
    await system.init!(game);
    await tick();
    await tick();
    const planes = currentPlanes(game, now);
    expect(planes.map((p) => p.label)).toEqual(['UAL2416']);
    expect(currentPlanes(game, now - 3600_000).every((p) => /^(sfo|oak)-/.test(p.id))).toBe(true);
  });
});
