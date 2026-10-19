import { test, expect, boot } from './fixtures';

const STOPS = [
  { name: 'Fort Mason', lat: 37.8065, lon: -122.4318, alt: 40, keys: ['KeyW', 'Space'] },
  { name: 'Golden Gate', lat: 37.8155, lon: -122.4775, alt: 90, keys: ['KeyW', 'KeyR'] },
  { name: 'Presidio', lat: 37.7989, lon: -122.4662, alt: 60, keys: ['KeyW', 'KeyD'] },
  { name: 'Ocean Beach', lat: 37.7605, lon: -122.5105, alt: 30, keys: ['KeyW', 'KeyE'] },
  { name: 'Twin Peaks', lat: 37.7544, lon: -122.4477, alt: 60, keys: ['KeyW', 'KeyA', 'Space'] },
  { name: 'Mission', lat: 37.7599, lon: -122.4148, alt: 40, keys: ['KeyW', 'ShiftLeft'] },
  { name: 'downtown', lat: 37.789, lon: -122.401, alt: 120, keys: ['KeyW', 'KeyR', 'KeyQ'] },
  { name: 'Embarcadero', lat: 37.7955, lon: -122.3937, alt: 40, keys: ['KeyW'] },
];

test.describe('city tour', () => {
  test('[R-TOUR] a scripted 60-second tour across the city produces zero console errors', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = await boot(page);
    const panels = await page.evaluate(() => window.__fly.game.panels.list().map((p) => p.id));
    const perStop = Math.ceil(panels.length / STOPS.length);
    let flown = 0;
    let started = 0;
    for (const [i, stop] of STOPS.entries()) {
      const next = STOPS[(i + 1) % STOPS.length];
      await page.evaluate(
        ({ stop, next }) => {
          const g = window.__fly.game;
          const p = g.world.point(stop);
          const q = g.world.point(next);
          window.__fly.teleport(p, Math.atan2(-(q.x - p.x), -(q.z - p.z)));
          for (const k of stop.keys) g.input.held.add(k);
        },
        { stop, next },
      );
      for (let k = 0; k < 15; k++) {
        await page.evaluate(async () => {
          window.__fly.step(0.5);
          await new Promise((r) => requestAnimationFrame(r));
        });
        flown += 0.5;
      }
      await page.evaluate(() => window.__fly.game.input.held.clear());
      for (const id of panels.slice(i * perStop, (i + 1) * perStop)) {
        await page.evaluate((pid) => window.__fly.game.panels.open(pid), id);
        await expect(page.locator(`.sheet[data-panel="${id}"]`)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.sheet')).toBeHidden();
      }
      if (i % 2 === 1) {
        const id = await page.evaluate(() => {
          const g = window.__fly.game;
          const me = g.flight.pos;
          const open = g.activities.list().filter((d) => !g.activities.kindOf(d).passive && !g.activities.locked(d) && !d.hidden);
          const near = open.map((d) => ({ d, p: g.activities.position(d) })).sort((a, b) => Math.hypot(a.p.x - me.x, a.p.z - me.z) - Math.hypot(b.p.x - me.x, b.p.z - me.z))[0];
          window.__fly.teleport(near.p);
          window.__fly.step(0.1);
          return g.activities.nearby?.id ?? null;
        });
        expect(id).not.toBeNull();
        await page.keyboard.press('KeyF');
        const active = await page.evaluate(async () => {
          window.__fly.step(1 / 30);
          const a = window.__fly.state().active;
          window.__fly.step(3);
          await new Promise((r) => requestAnimationFrame(r));
          window.__fly.game.activities.stop();
          window.__fly.step(0.5);
          return a;
        });
        if (active === id) started++;
      }
    }
    test.info().annotations.push({ type: 'tour', description: `${flown} s flown, ${panels.length} panels, ${started} activities started and abandoned` });
    expect(flown).toBe(60);
    expect(started).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__fly.errors)).toEqual([]);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
});
