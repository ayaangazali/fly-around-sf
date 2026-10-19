import { test, expect, boot } from './fixtures';
import type { Page } from '@playwright/test';
import type { GameAudio } from '../../src/audio/game-audio';

declare global {
  interface Window {
    __audio(): GameAudio;
    __acNew: number;
    __acNodes: number;
  }
}

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    window.__acNew = 0;
    window.__acNodes = 0;
    window.AudioContext = class extends Real {
      constructor(o?: AudioContextOptions) {
        super(o);
        window.__acNew++;
      }
    };
    const proto = BaseAudioContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!k.startsWith('create') || typeof proto[k] !== 'function') continue;
      const fn = proto[k];
      proto[k] = function (this: unknown, ...a: unknown[]) {
        window.__acNodes++;
        return fn.apply(this, a);
      };
    }
    window.__audio = () => (window.__fly.game.systems.find((s) => s.id === 'audio') as unknown as { audio: GameAudio }).audio;
  });
}

async function start(page: Page): Promise<string[]> {
  await instrument(page);
  return boot(page);
}

async function gesture(page: Page): Promise<void> {
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__audio().graph?.ctx.state === 'running');
}

async function flyTo(page: Page, lat: number, lon: number, alt: number): Promise<void> {
  await page.evaluate(
    ([lat, lon, alt]) => {
      const g = window.__fly.game;
      const { x, z } = g.world.toLocal(lat, lon);
      window.__fly.teleport({ x, y: g.world.groundAt(x, z) + alt, z });
    },
    [lat, lon, alt],
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => window.__fly.step(0.5));
}

const busGains = (page: Page) =>
  page.evaluate(() => {
    const b = window.__audio().graph!.buses;
    return { master: b.master.gain.value, music: b.music.gain.value, sfx: b.sfx.gain.value, ambience: b.ambience.gain.value };
  });

test.describe('audio', () => {
  test('[R-AUDIO] no AudioContext exists before a gesture, one runs after a click, volumes reach the buses', async ({ page }) => {
    const errors = await start(page);
    await page.evaluate(() => {
      window.__fly.step(1);
      window.__fly.game.panels.open('sound');
      window.__fly.game.panels.close();
    });
    expect(await page.evaluate(() => ({ made: window.__acNew, graph: window.__audio().graph }))).toEqual({ made: 0, graph: null });
    await gesture(page);
    expect(await page.evaluate(() => window.__acNew)).toBe(1);
    await page.mouse.click(600, 500);
    await page.keyboard.press('KeyW');
    expect(await page.evaluate(() => window.__acNew)).toBe(1);
    await page.evaluate(() => {
      const s = window.__fly.game.save;
      Object.assign(s.data.settings, { volMaster: 0.5, volMusic: 0.3, volSfx: 1 });
      s.persist();
    });
    await page.waitForTimeout(600);
    const g = await busGains(page);
    expect(g.master).toBeCloseTo(0.25, 2);
    expect(g.music).toBeCloseTo(0.09, 2);
    expect(g.sfx).toBeCloseTo(1, 2);
    expect(g.ambience).toBeCloseTo(1, 2);
    expect(await page.evaluate(() => window.__fly.errors)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('[R-AUDIO] mute persists across a reload and the N key toggles it', async ({ page }) => {
    await start(page);
    await page.keyboard.press('KeyN');
    await page.waitForFunction(() => window.__audio().graph !== null);
    expect(await page.evaluate(() => window.__fly.game.save.data.settings.muted)).toBe(true);
    await page.waitForTimeout(700);
    expect((await busGains(page)).master).toBeLessThan(0.001);
    expect(await page.evaluate(() => window.__audio().graph!.ctx.state)).toBe('suspended');
    await page.evaluate(() => window.__fly.step(0.1));
    expect(await page.locator('.menubar-btn[data-panel="sound"]').getAttribute('aria-label')).toBe('Sound (muted)');

    await page.reload();
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
    await page.evaluate(() => window.__fly.step(0.1));
    expect(await page.evaluate(() => window.__fly.game.save.data.settings.muted)).toBe(true);
    await expect(page.locator('.menubar-btn[data-panel="sound"]')).toHaveText('🔇');
    await page.mouse.click(640, 520);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__audio().graph!.ctx.state)).toBe('suspended');
    expect((await busGains(page)).master).toBe(0);

    await page.keyboard.press('KeyN');
    await page.waitForFunction(() => window.__audio().graph!.ctx.state === 'running');
    await page.waitForTimeout(500);
    expect((await busGains(page)).master).toBeCloseTo(0.64, 2);
    await page.evaluate(() => window.__fly.step(0.1));
    await expect(page.locator('.menubar-btn[data-panel="sound"]')).toHaveText('🔊');
  });

  test('[R-AUDIO-DRONE] boosting raises the motor pitch, the whine and the wind', async ({ page }) => {
    await start(page);
    await gesture(page);
    const read = () =>
      page.evaluate(() => {
        const l = (window.__audio() as unknown as { layers: Record<string, { frequency: AudioParam; gain: AudioParam }> }).layers;
        return { motor: l.motorTone.frequency.value, whine: l.whineAmp.gain.value, wind: l.windAmp.gain.value };
      });
    await page.evaluate(() => window.__fly.step(0.2));
    await page.waitForTimeout(600);
    const idle = await read();
    await page.evaluate(() => {
      const g = window.__fly.game;
      g.teleport({ ...g.flight.pos, y: g.flight.pos.y + 200 });
      const saved = g.input.flight.bind(g.input);
      g.input.flight = () => ({ forward: 1, strafe: 0, lift: 0, yaw: 0, boost: true });
      window.__fly.step(4);
      g.input.flight = saved;
    });
    await page.waitForTimeout(800);
    const fast = await read();
    expect(fast.motor).toBeGreaterThan(idle.motor + 1000);
    expect(fast.whine).toBeGreaterThan(0.05);
    expect(fast.wind).toBeGreaterThan(0.1);
    expect(idle.whine).toBeLessThan(0.01);
  });

  test('[R-AUDIO-PLACES] sound spots open near their real places and only in the right conditions', async ({ page }) => {
    await start(page);
    await gesture(page);
    const live = () => page.evaluate(() => [...window.__audio().ambience!.live.keys()].sort());

    await flyTo(page, 37.810636, -122.41158, 20);
    expect(await live()).toContain('pier-39-sea-lions');
    const pos = await page.evaluate(() => {
      const l = window.__audio().ambience!.live.get('pier-39-sea-lions')!;
      const want = window.__fly.game.world.toLocal(37.810636, -122.41158);
      return { dx: l.panner.positionX.value - want.x, dz: l.panner.positionZ.value - want.z };
    });
    expect(Math.hypot(pos.dx, pos.dz)).toBeLessThan(1);

    await flyTo(page, 37.7955, -122.4096, 10);
    expect(await live()).toContain('cable-car-bells');

    await flyTo(page, 37.8143, -122.4777, 60);
    expect(await live()).not.toContain('ggb-south-horn');
    await page.evaluate(() => {
      window.__fly.game.sky.fogDensity = 3;
      window.__fly.step(0.5);
    });
    expect(await live()).toEqual(expect.arrayContaining(['ggb-south-horn', 'ggb-midspan-horn']));
    await page.evaluate(() => {
      window.__fly.game.sky.fogDensity = 1;
      window.__fly.step(0.5);
    });
    expect(await live()).not.toContain('ggb-south-horn');

    await flyTo(page, 37.7544, -122.4477, 300);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__fly.step(0.5));
    expect(await live()).toEqual([]);
    expect(await page.evaluate(() => window.__audio().ambience!.nodes)).toBe(0);
  });

  test('[R-AUDIO-BELLS] Grace Cathedral rings the real noon hour with the angelus, and only by day', async ({ page }) => {
    await start(page);
    await gesture(page);
    await flyTo(page, 37.7937, -122.4035, 80);
    const at = (iso: string) =>
      page.evaluate((iso) => {
        const g = window.__fly.game;
        g.clockOffset += Date.parse(iso) - g.date().getTime();
        window.__fly.step(0.4);
      }, iso);
    await at('2026-10-19T18:59:58Z');
    const live = await page.evaluate(() => [...window.__audio().ambience!.live.keys()]);
    expect(live).toContain('grace-cathedral-bells');
    expect(await page.evaluate(() => window.__audio().counts['grace-angelus'] ?? 0)).toBe(0);
    await page.evaluate(() => window.__fly.step(3));
    const after = await page.evaluate(() => {
      const a = window.__audio();
      return { grace: a.counts['grace-angelus'], queue: a.ambience!.live.get('grace-cathedral-bells')!.queue.length };
    });
    expect(after.grace).toBe(1);
    expect(after.queue).toBeGreaterThan(10);

    await at('2026-10-19T21:59:58Z');
    await page.evaluate(() => window.__fly.step(3));
    expect(await page.evaluate(() => window.__audio().counts['grace-hour'])).toBe(1);

    await at('2026-10-20T03:59:58Z');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => window.__fly.step(3));
    const night = await page.evaluate(() => window.__audio().counts);
    expect(night['grace-hour']).toBe(1);
    expect(night['grace-angelus']).toBe(1);
  });

  test('[R-AUDIO-MUSIC] lo-fi plays, lifts during an activity, ducks under a card and turns to night', async ({ page }) => {
    await start(page);
    await gesture(page);
    await page.evaluate(() => window.__fly.step(0.2));
    const music = await page.evaluate(() => ({ notes: window.__audio().music!.notes, mood: window.__audio().mood() }));
    expect(music.notes).toBeGreaterThan(5);
    expect(music.mood).toBe('day');

    const id = await page.evaluate(() => window.__fly.activities().find((a) => !a.passive)!.id);
    await page.evaluate((id) => {
      window.__fly.game.activities.start(id);
      window.__fly.step(0.1);
    }, id);
    await page.waitForTimeout(1600);
    expect(await page.evaluate(() => window.__audio().graph!.musicTone.frequency.value)).toBeGreaterThan(4500);
    await page.evaluate(() => {
      window.__fly.game.activities.stop();
      window.__fly.step(0.1);
    });

    await page.evaluate(() => window.__fly.game.bus.emit('card:unlock', { id: 'golden-gate-bridge' }));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__audio().graph!.duck.gain.value)).toBeLessThan(0.5);
    await page.waitForTimeout(3500);
    expect(await page.evaluate(() => window.__audio().graph!.duck.gain.value)).toBeGreaterThan(0.85);

    await page.evaluate(() => {
      const g = window.__fly.game;
      g.clockOffset += Date.parse('2026-10-20T06:00:00Z') - g.date().getTime();
    });
    await page.waitForFunction(() => window.__audio().mood() === 'night');
  });

  test('[R-AUDIO-SFX] every game event plays its own sound', async ({ page }) => {
    await start(page);
    await gesture(page);
    const ids = await page.evaluate(() => {
      const list = window.__fly.activities();
      return { passive: list.find((a) => a.passive)!.id, rings: list.find((a) => a.kind === 'rings')!.id };
    });
    const solved = await page.evaluate((id) => window.__fly.solve(id), ids.rings);
    expect(solved.ok).toBe(true);
    await page.evaluate((ids) => {
      const g = window.__fly.game;
      g.bus.emit('activity:complete', { id: ids.passive });
      g.bus.emit('activity:fail', { id: ids.rings, reason: 'time' });
      g.bus.emit('card:unlock', { id: 'golden-gate-bridge' });
      g.bus.emit('player:crash', { speed: 20 });
      g.bus.emit('player:splash', {});
      g.bus.emit('photo', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      g.panels.open('sound');
      g.panels.close();
    }, ids);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__fly.game.toast('Hello', 'reward');
      window.__fly.step(0.1);
    });
    const counts = await page.evaluate(() => window.__audio().counts);
    for (const name of ['start', 'ring', 'complete', 'sparkle', 'fail', 'fanfare', 'crash', 'splash', 'shutter', 'open', 'close', 'reward'])
      expect(counts[name], name).toBeGreaterThanOrEqual(1);
    expect(counts.ring).toBeLessThan(20);
  });

  test('[R-AUDIO-CPU] the graph and live voices stay bounded on a tour of every sound spot', async ({ page }) => {
    await start(page);
    await gesture(page);
    const base = await page.evaluate(() => window.__acNodes);
    await page.evaluate(() => (window.__fly.game.sky.fogDensity = 3));
    const stops: [number, number, number][] = [
      [37.810636, -122.41158, 20],
      [37.7955, -122.4096, 10],
      [37.778628, -122.389799, 40],
      [37.7955, -122.3935, 70],
      [37.814333, -122.477739, 60],
      [37.828128, -122.425512, 30],
      [37.7637, -122.512, 20],
      [37.8055, -122.4547, 20],
    ];
    let maxLive = 0;
    for (const [lat, lon, alt] of stops) {
      await flyTo(page, lat, lon, alt);
      await page.evaluate(() => window.__fly.step(2));
      await page.waitForTimeout(300);
      maxLive = Math.max(maxLive, await page.evaluate(() => window.__audio().ambience!.live.size));
    }
    const stats = await page.evaluate(() => window.__audio().stats());
    await flyTo(page, 37.7544, -122.4477, 300);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__fly.step(0.5));
    const far = await page.evaluate(() => window.__audio().stats());
    test.info().annotations.push({ type: 'audio-nodes', description: JSON.stringify({ baseGraph: base, peakVoices: stats.peakVoices, voicesNow: stats.voices, ambienceNodesAtPeak: stats.ambience, maxLiveSpots: maxLive, farAmbience: far.ambience }) });
    expect(base).toBeLessThan(90);
    expect(maxLive).toBeGreaterThanOrEqual(1);
    expect(stats.peakVoices).toBeLessThan(160);
    expect(far.ambience).toBe(0);
    await page.evaluate(() => window.__audio().engine.setHidden(true));
    await page.waitForFunction(() => window.__audio().graph!.ctx.state === 'suspended');
    await page.evaluate(() => window.__audio().engine.setHidden(false));
    await page.waitForFunction(() => window.__audio().graph!.ctx.state === 'running');
  });

  test('[R-AUDIO-PANEL] the Sound panel mixes, mutes, lists every spot and sets a waypoint', async ({ page }) => {
    await start(page);
    await page.locator('.menubar-btn[data-panel="sound"]').click();
    await expect(page.locator('.sheet[data-panel="sound"]')).toBeVisible();
    await expect(page.locator('.snd-spot')).toHaveCount(9);
    await expect(page.locator('.snd-slider input')).toHaveCount(4);
    await page.locator('input[data-key="volMusic"]').fill('25');
    expect(await page.evaluate(() => window.__fly.game.save.data.settings.volMusic)).toBe(0.25);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fly-around-sf:save')!).settings.volMusic)).toBe(0.25);
    await expect(page.locator('.snd-slider output').nth(1)).toHaveText('25%');
    await page.waitForFunction(() => window.__audio().graph?.ctx.state === 'running');
    await expect(page.locator('.snd-chip').first()).not.toBeEmpty();

    await page.locator('.snd-mute').click();
    await expect(page.locator('.snd-mute')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__fly.game.save.data.settings.muted)).toBe(true);
    await flyTo(page, 37.810636, -122.41158, 20);
    const pier = page.locator('.snd-spot[data-spot="pier-39-sea-lions"] .snd-chip');
    await expect(pier).toHaveText('In earshot, sound is off');
    await page.locator('.snd-mute').click();
    await expect(page.locator('.snd-mute')).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => window.__fly.step(0.5));
    await expect(pier).toHaveText('Playing now');

    await page.locator('.snd-spot[data-spot="pier-39-sea-lions"] .snd-go').click();
    await expect(page.locator('.sheet')).toBeHidden();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe('Pier 39 sea lions');

    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('.menubar-btn[data-panel="sound"]').click();
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('.sheet-body')!;
      return body.scrollWidth - body.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
