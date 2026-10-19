import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { test, expect, boot } from './fixtures';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/live/${name}`, import.meta.url), 'utf8');
const local = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
const netNoise = (e: string) => /ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to load resource|favicon/.test(e);

async function offline(page: Page, allow: Record<string, () => string> = {}) {
  const blocked: string[] = [];
  await page.route('**/*', (route: Route) => {
    const url = route.request().url();
    if (local(url)) return route.continue();
    const hit = Object.entries(allow).find(([host]) => url.includes(host));
    if (hit) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: hit[1]() });
    blocked.push(url);
    return route.abort('internetdisconnected');
  });
  return blocked;
}

const liveState = () => {
  const g = window.__fly.game;
  const sys = g.systems.find((s) => s.id === 'live-weather') as unknown as { state(g: unknown): { feeds: Map<string, { status: string }>; transit: { status: string; vehicles: { mode: string }[] }; planes: unknown[]; tides: unknown[] } };
  const s = sys.state(g);
  return { feeds: Object.fromEntries([...s.feeds].map(([k, f]) => [k, f.status])), transit: s.transit.status, vehicles: s.transit.vehicles.length, cable: s.transit.vehicles.filter((v) => v.mode === 'cable').length, planes: s.planes.length, tides: s.tides.length };
};

test.describe('live data', () => {
  test('[R-LIVE-FALLBACK] with every outside request blocked the game boots and each feed reports its fallback', async ({ page }) => {
    const blocked = await offline(page);
    const errors = await boot(page, 'live');
    await expect.poll(() => page.evaluate(liveState).then((s) => Object.values(s.feeds).every((v) => v === 'fallback') && s.transit === 'schedule'), { timeout: 30_000 }).toBe(true);
    await page.evaluate(() => window.__fly.step(1));
    const s = await page.evaluate(liveState);
    expect(Object.keys(s.feeds).sort()).toEqual(['planes', 'quakes', 'tides', 'weather']);
    expect(s.vehicles).toBeGreaterThan(50);
    expect(s.planes).toBeGreaterThan(2);
    expect(s.tides).toBeGreaterThan(5);
    expect(blocked.some((u) => u.includes('open-meteo'))).toBe(true);
    expect(blocked.some((u) => u.includes('earthquake.usgs.gov'))).toBe(true);
    expect(blocked.some((u) => u.includes('opensky-network'))).toBe(true);
    expect(blocked.some((u) => u.includes('tidesandcurrents.noaa.gov'))).toBe(true);
    await page.evaluate(() => window.__fly.game.panels.open('live'));
    for (const id of ['weather', 'quakes', 'planes', 'tides']) await expect(page.locator(`.live-chip[data-feed="${id}"]`)).toHaveAttribute('data-status', 'fallback');
    await expect(page.locator('.live-chip[data-feed="transit"]')).toHaveAttribute('data-status', 'schedule');
    await expect(page.locator('.live-quakes')).toContainText('Loma Prieta');
    await expect(page.locator('.live-tides')).toContainText('harmonic constants');
    expect(await page.evaluate(() => window.__fly.errors)).toEqual([]);
    expect(errors.filter((e) => !netNoise(e))).toEqual([]);
  });

  test('[R-LIVE-WEATHER] the real foggy Open-Meteo hour thickens the fog and the westerly pushes the drone east', async ({ page }) => {
    await offline(page, { 'api.open-meteo.com': () => fixture('open-meteo-sf.json') });
    await boot(page, 'live&time=2026-10-18T18:00:00Z');
    await expect.poll(() => page.evaluate(liveState).then((s) => s.feeds.weather), { timeout: 30_000 }).toBe('live');
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const before = { ...g.flight.pos };
      window.__fly.step(4);
      return { fog: g.sky.fogDensity, wind: g.env.wind!, drift: g.flight.pos.x - before.x };
    });
    await page.waitForTimeout(300);
    const far = await page.evaluate(() => window.__fly.game.sky.fog.far);
    expect(far).toBeLessThan(3000);
    expect(r.fog).toBe(3);
    expect(r.wind.x).toBeGreaterThan(0.5);
    expect(r.drift).toBeGreaterThan(1);
    await page.evaluate(() => window.__fly.game.panels.open('live'));
    await expect(page.locator('.live-weather')).toContainText('Fog');
    await expect(page.locator('.live-weather')).toContainText('Karl is here');
    await expect(page.locator('.live-chip[data-feed="weather"]')).toHaveAttribute('data-status', 'live');
  });

  test('[R-LIVE-QUAKE] a quake reported mid-session shakes the camera, toasts and grants the rare card', async ({ page }) => {
    const usgs = JSON.parse(fixture('usgs-bay-area.json'));
    const newest = usgs.features[0].properties.time as number;
    let body = JSON.stringify({ ...usgs, features: usgs.features.slice(1) });
    await page.clock.setFixedTime(new Date(newest + 120_000));
    await offline(page, { 'earthquake.usgs.gov': () => body });
    await boot(page, 'live');
    await expect.poll(() => page.evaluate(liveState).then((s) => s.feeds.quakes), { timeout: 30_000 }).toBe('live');
    body = fixture('usgs-bay-area.json');
    const r = await page.evaluate(async (now) => {
      const g = window.__fly.game;
      const sys = g.systems.find((s) => s.id === 'live-quakes') as unknown as { poll(g: unknown, now: number): Promise<void> };
      await sys.poll(g, now);
      return { shake: g.chase.shake, cards: window.__fly.state().cards };
    }, newest + 600_000);
    expect(r.shake).toBeGreaterThan(0.2);
    expect(r.cards).toContain('felt-a-quake');
    await expect(page.locator('.toast').filter({ hasText: 'Earthquake! M1.7' })).toBeVisible();
    await page.evaluate(() => window.__fly.game.panels.open('live'));
    await expect(page.locator('.live-quakes')).toContainText('San Ramon');
  });

  test('[R-LIVE-PLANES] simulated airliners fly with blinking nav lights and a close pass warns the pilot', async ({ page }) => {
    await offline(page);
    await boot(page, 'live');
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      window.__fly.step(0.2);
      const group = g.scene.getObjectByName('live-planes')!;
      const visible = group.children.filter((c) => c.visible);
      const p = visible.find((c) => c.position.y > 50 && c.position.y < 850)!.position;
      window.__fly.teleport({ x: p.x + 40, y: p.y, z: p.z });
      window.__fly.step(1 / 30);
      return { visible: visible.length, alt: p.y, cards: window.__fly.state().cards };
    });
    expect(r.visible).toBeGreaterThan(2);
    expect(r.cards).toContain('plane-spotter');
    await expect(page.locator('.toast').filter({ hasText: 'Close call!' })).toBeVisible();
  });

  test('[R-LIVE-TRANSIT] cable cars climb Hyde Street on the real timetable', async ({ page }) => {
    await boot(page, 'spawn=37.8005,-122.4185,3.14');
    await expect.poll(() => page.evaluate(liveState).then((s) => s.transit), { timeout: 30_000 }).toBe('schedule');
    const r = await page.evaluate(() => {
      window.__fly.step(0.2);
      const g = window.__fly.game;
      const sys = g.systems.find((s) => s.id === 'live-weather') as unknown as { state(g: unknown): { transit: { vehicles: { route: string; x: number; y: number; z: number; heading: number }[] } } };
      const t = g.world.toLocal(37.8016, -122.4189);
      const ph = sys.state(g).transit.vehicles.filter((v) => v.route === 'PH').sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
      const v = ph[0];
      const before = { x: v.x, z: v.z };
      window.__fly.step(10);
      const after = sys.state(g).transit.vehicles.filter((w) => w.route === 'PH').sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0];
      const fx = -Math.sin(after.heading);
      const fz = -Math.cos(after.heading);
      const ox = fx * 9 - fz * 5;
      const oz = fz * 9 + fx * 5;
      window.__fly.teleport({ x: after.x + ox, y: after.y + 3, z: after.z + oz }, Math.atan2(ox, oz));
      window.__fly.step(1 / 30);
      return { count: ph.length, moved: Math.hypot(after.x - before.x, after.z - before.z), ground: v.y - g.world.surfaceAt(v.x, v.z), cards: window.__fly.state().cards };
    });
    expect(r.count).toBeGreaterThanOrEqual(5);
    expect(r.moved).toBeGreaterThan(5);
    expect(r.moved).toBeLessThan(60);
    expect(Math.abs(r.ground)).toBeLessThan(3);
    expect(r.cards).toEqual([]);
    await page.waitForTimeout(800);
    expect((await page.screenshot()).length).toBeGreaterThan(30_000);
  });

  test('[R-LIVE-PANEL] the Live SF panel opens from the menubar and points the pilot at a cable car', async ({ page }) => {
    await offline(page);
    const errors = await boot(page, 'live&spawn=37.8005,-122.4185,3.14');
    await page.evaluate(() => window.__fly.step(0.2));
    await page.locator('.menubar-btn[data-panel="live"]').click();
    const sheet = page.locator('.sheet[data-panel="live"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.live-chip')).toHaveCount(5);
    await expect(sheet.locator('.live-weather')).toContainText(/°C/);
    await expect(sheet.locator('.live-planes')).toContainText('in the air within 30 km');
    await expect(sheet.locator('.live-transit')).toContainText(/Powell-(Hyde|Mason) toward .+ (in \d+ min|arriving now|at )/);
    await expect(sheet.locator('.live-tides')).toContainText(/(High|Low) tide/);
    await expect(sheet.locator('.live-tide-curve polyline')).toHaveCount(1);
    await page.waitForTimeout(2300);
    await sheet.getByRole('button', { name: 'Find a cable car' }).click();
    await expect(sheet).toBeHidden();
    const wp = await page.evaluate(() => window.__fly.game.waypoint);
    expect(wp?.label).toMatch(/Powell|California/);
    await page.evaluate(() => (window.__fly.game.save.data.settings.units = 'imperial'));
    await page.evaluate(() => window.__fly.game.panels.open('live'));
    await expect(sheet.locator('.live-weather')).toContainText(/°F/);
    expect(errors.filter((e) => !netNoise(e))).toEqual([]);
  });

  test('[R-LIVE-PANEL] the live panel fits touch screens without sideways scrolling @touch', async ({ page }) => {
    await offline(page);
    await boot(page, 'live');
    await page.evaluate(() => window.__fly.step(0.2));
    await page.evaluate(() => window.__fly.game.panels.open('live'));
    await expect(page.locator('.live-card')).toHaveCount(5);
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('.sheet-body')!;
      return { page: document.documentElement.scrollWidth - window.innerWidth, sheet: body.scrollWidth - body.clientWidth };
    });
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.sheet).toBeLessThanOrEqual(0);
    const small = await page.locator('.live-btn').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetHeight < 40).length);
    expect(small).toBe(0);
  });
});
