import { test, expect, boot } from './fixtures';

test('[R-ACT-ALL] every ride-along can be won by the solver in the browser', async ({ page }) => {
  test.setTimeout(300_000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const ids = window.__fly.activities().filter((a) => a.kind === 'ride-along').map((a) => a.id);
    const failures: string[] = [];
    for (const id of ids) {
      window.__fly.reset();
      const res = await window.__fly.solve(id);
      if (!res.ok) failures.push(`${id}: ${res.error}`);
      if (window.__fly.game.scene.getObjectByName('ride-along-vehicle')) failures.push(`${id}: vehicle left behind`);
    }
    return { ids, failures, cards: window.__fly.state().cards };
  });
  expect(r.ids.length).toBeGreaterThanOrEqual(12);
  expect(r.failures).toEqual([]);
});

test('[R-LIVE-TRANSIT] a ride-along starts with F, shows the vehicle and fails if you wander off', async ({ page }) => {
  await boot(page, 'spawn=37.8018,-122.4189,3.14');
  const r = await page.evaluate(() => {
    const f = window.__fly;
    const g = f.game;
    const def = g.activities.defs.get('ride-along-hyde-street-plunge')!;
    f.teleport(g.activities.position(def));
    f.step(0.1);
    const near = g.activities.nearby?.id;
    g.input.press('interact');
    f.step(1 / 30);
    const active = g.activities.active?.def.id;
    const vehicle = !!g.scene.getObjectByName('ride-along-vehicle');
    f.teleport({ x: g.flight.pos.x + 400, y: g.flight.pos.y + 50, z: g.flight.pos.z });
    f.step(6);
    return { near, active, vehicle, after: g.activities.active?.def.id ?? null, gone: !g.scene.getObjectByName('ride-along-vehicle') };
  });
  expect(r).toEqual({ near: 'ride-along-hyde-street-plunge', active: 'ride-along-hyde-street-plunge', vehicle: true, after: null, gone: true });
  await expect(page.locator('.toast').filter({ hasText: 'try again' })).toBeVisible();
});
