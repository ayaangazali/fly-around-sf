import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers';
import { DEFAULTS, readSettings, sanitize, setSetting, settingsOf, timeModeOffset, cleanName, randomPilotName } from '../../src/ui/settings-model';
import { savedQuality } from '../../src/ui';
import { emptySave } from '../../src/core/save';
import { parseOptions, type Game } from '../../src/game';
import { createFlight, stepFlight } from '../../src/player/flight';
import { sunPosition } from '../../src/core/sun';
import { ORIGIN } from '../../src/core/geo';

const DEG = Math.PI / 180;

function game(): Game {
  const g = fakeGame();
  let color = '';
  const any = g as unknown as Record<string, unknown>;
  any.env = { groundAt: () => 0, collide: () => false };
  any.clockOffset = 0;
  any.date = () => new Date(Date.parse('2026-10-19T19:30:00Z') + g.clockOffset);
  any.drone = { body: { children: [{ material: { color: { set: (c: string) => (color = c) } } }] } };
  any.droneColor = () => color;
  return g;
}

describe('settings', () => {
  it('[R-SETTINGS] every documented key has a default and bad values fall back', () => {
    const s = readSettings(emptySave());
    for (const k of ['quality', 'units', 'volMaster', 'volMusic', 'volSfx', 'volVoice', 'muted', 'reducedMotion', 'turnSpeed', 'timeMode', 'playerName', 'droneColor', 'showFps', 'aiProxyUrl'] as const) expect(s).toHaveProperty(k);
    expect(s).toMatchObject({ ...DEFAULTS, reducedMotion: false });
    const bad = readSettings({ ...emptySave(), settings: { quality: 'ultra', volMaster: 4, volSfx: -1, turnSpeed: 9, muted: 'yes', droneColor: 'red', aiProxyUrl: 'http://x', timeMode: 'dawn', units: 'feet' } });
    expect(bad).toMatchObject({ quality: 'auto', volMaster: 1, volSfx: 0, turnSpeed: 1.5, muted: false, droneColor: '#f2f2ee', aiProxyUrl: '', timeMode: 'real', units: 'metric' });
    expect(readSettings(emptySave(), true).reducedMotion).toBe(true);
  });

  it('[R-SETTINGS] names are cleaned and proxy URLs must be https', () => {
    expect(cleanName('  <b>Ace</b>\u0007 of the Bay and beyond  ')).toBe('bAce/b of the Bay an');
    expect(sanitize('playerName', '   ')).toMatch(/^Pilot-\d{4}$/);
    expect(randomPilotName(() => 0)).toBe('Pilot-1000');
    expect(sanitize('aiProxyUrl', 'https://city.example.workers.dev')).toBe('https://city.example.workers.dev');
    expect(() => sanitize('aiProxyUrl', 'http://insecure.example')).toThrow(/https/);
    expect(sanitize('aiProxyUrl', '')).toBe('');
  });

  it('[R-SETTINGS] setSetting persists, emits and applies turn speed and drone color live', () => {
    const g = game();
    const seen: string[] = [];
    g.bus.on('settings:change', ({ key }) => seen.push(key));
    expect(setSetting(g, 'turnSpeed', 0.5)).toBe(0.5);
    expect(g.env.turnRate).toBe(0.5);
    setSetting(g, 'droneColor', '#FF6A3D');
    expect((g as unknown as { droneColor(): string }).droneColor()).toBe('#ff6a3d');
    setSetting(g, 'volMusic', 2);
    expect(g.save.data.settings).toMatchObject({ turnSpeed: 0.5, droneColor: '#ff6a3d', volMusic: 1 });
    expect(seen).toEqual(['turnSpeed', 'droneColor', 'volMusic']);
    expect(settingsOf(g).volMusic).toBe(1);
  });

  it('[R-SETTINGS] turn speed scales the flight yaw rate', () => {
    const turn = (rate: number) => {
      const s = createFlight(0, 50, 0);
      stepFlight(s, { forward: 0, strafe: 0, lift: 0, yaw: 1, boost: false }, 0.5, { groundAt: () => 0, collide: () => false, turnRate: rate });
      return s.yaw;
    };
    expect(turn(0.5)).toBeCloseTo(turn(1) / 2);
    expect(turn(1.5)).toBeCloseTo(turn(1) * 1.5);
  });

  it('[R-SETTINGS] time of day modes shift the clock to golden hour, noon and night', () => {
    const now = Date.parse('2026-10-19T19:30:00Z');
    const alt = (o: number) => sunPosition(new Date(now + o), ORIGIN.lat, ORIGIN.lon).altitude;
    expect(timeModeOffset('real', now)).toBe(0);
    const golden = alt(timeModeOffset('golden', now));
    expect(golden).toBeGreaterThan(2 * DEG);
    expect(golden).toBeLessThan(5 * DEG);
    expect(alt(timeModeOffset('noon', now))).toBeGreaterThan(40 * DEG);
    expect(alt(timeModeOffset('night', now))).toBeLessThan(-18 * DEG);
    const g = game();
    setSetting(g, 'timeMode', 'night');
    expect(sunPosition(g.date(), ORIGIN.lat, ORIGIN.lon).altitude).toBeLessThan(-18 * DEG);
    setSetting(g, 'timeMode', 'real');
    expect(g.clockOffset).toBe(0);
  });

  it('[R-SETTINGS] a saved quality applies on reload unless the URL overrides it', () => {
    const opts = parseOptions('');
    savedQuality(opts, '', 'low');
    expect(opts.quality).toBe('low');
    const url = parseOptions('?quality=high');
    savedQuality(url, '?quality=high', 'low');
    expect(url.quality).toBe('high');
    const auto = parseOptions('');
    const before = auto.quality;
    savedQuality(auto, '', 'auto');
    expect(auto.quality).toBe(before);
  });
});
