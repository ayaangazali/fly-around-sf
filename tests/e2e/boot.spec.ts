import { test, expect, boot } from './fixtures';

test.describe('boot and flight', () => {
  test('[R-BOOT] loads the whole city with no errors and draws pixels', async ({ page }) => {
    const errors = await boot(page);
    const info = await page.evaluate(() => {
      const g = window.__fly.game;
      return { chunks: g.cityRenderer.chunks, done: g.cityRenderer.done, buildings: g.world.city.count, errors: window.__fly.errors };
    });
    expect(info.done).toBe(true);
    expect(info.buildings).toBeGreaterThan(170000);
    expect(info.chunks).toBeGreaterThan(200);
    expect(info.errors).toEqual([]);
    await page.waitForTimeout(1500);
    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(30_000);
    expect(errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e))).toEqual([]);
  });

  test('[R-FLY] keyboard flight moves the drone forward, up and turns it', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => window.__fly.state());
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await page.evaluate(() => window.__fly.step(2));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    await page.keyboard.down('KeyD');
    await page.evaluate(() => window.__fly.step(0.5));
    await page.keyboard.up('KeyD');
    const after = await page.evaluate(() => window.__fly.state());
    const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z);
    expect(moved).toBeGreaterThan(30);
    expect(after.pos.y).toBeGreaterThan(before.pos.y + 10);
    expect(after.yaw).toBeLessThan(before.yaw - 0.5);
  });

  test('[R-COLLIDE] cannot fly through a downtown tower', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const c = g.world.city;
      const p = g.world.toLocal(37.792, -122.4036);
      let b = -1;
      for (const i of c.near(p.x, p.z, 40)) if (b < 0 || c.height[i] > c.height[b]) b = i;
      window.__fly.teleport({ x: c.cx[b] + 150, y: c.ground[b] + c.height[b] * 0.75, z: c.cz[b] }, Math.PI / 2);
      g.input.held.add('KeyW');
      g.input.held.add('KeyR');
      let inside = 0;
      let closest = Infinity;
      for (let i = 0; i < 360; i++) {
        window.__fly.step(1 / 30);
        const s = window.__fly.state();
        closest = Math.min(closest, Math.hypot(s.pos.x - c.cx[b], s.pos.z - c.cz[b]));
        if (c.contains(b, s.pos.x, s.pos.z) && s.pos.y < c.top(b) - 1) inside++;
      }
      g.input.held.clear();
      return { inside, closest, height: c.height[b] };
    });
    expect(r.height).toBeGreaterThan(150);
    expect(r.closest).toBeLessThan(80);
    expect(r.inside).toBe(0);
  });

  test('[R-SAVE] progress survives export, reset and import', async ({ page }) => {
    await boot(page);
    const ok = await page.evaluate(async () => {
      const id = window.__fly.activities().find((a) => a.passive)!.id;
      await window.__fly.solve(id);
      const code = window.__fly.exportSave();
      window.__fly.reset();
      const cleared = window.__fly.state().completed.length === 0;
      window.__fly.importSave(code);
      return cleared && window.__fly.state().completed.includes(id);
    });
    expect(ok).toBe(true);
  });

  test('[R-PANELS] every menu panel opens and closes cleanly', async ({ page }) => {
    const errors = await boot(page);
    const ids = await page.evaluate(() => window.__fly.game.panels.list().map((p) => p.id));
    expect(ids.length).toBeGreaterThan(1);
    for (const id of ids) {
      await page.evaluate((pid) => window.__fly.game.panels.open(pid), id);
      await expect(page.locator(`.sheet[data-panel="${id}"]`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.sheet')).toBeHidden();
    }
    await page.locator('.menubar-btn[data-panel="menu"]').click();
    await expect(page.locator('.sheet[data-panel="menu"]')).toBeVisible();
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
});

test.describe('touch devices @touch', () => {
  test('[R-MOBILE] renders HUD without horizontal overflow on touch screens @touch', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.hud-stats')).toBeVisible();
    await expect(page.locator('.menubar')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
