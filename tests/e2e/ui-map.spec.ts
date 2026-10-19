import { test, expect, boot } from './fixtures';

test.describe('map and waypoints', () => {
  test('[R-MAP] the map draws the city, the player and every mappable activity, and sets a waypoint', async ({ page }) => {
    const errors = await boot(page);
    const expected = await page.evaluate(() => window.__fly.activities().filter((a) => a.kind !== 'achievement' && !a.hidden).map((a) => a.id).sort());
    await page.keyboard.press('KeyM');
    await page.evaluate(() => window.__fly.step(1 / 30));
    const wrap = page.locator('.map-wrap');
    await expect(wrap).toBeVisible();
    const ids = await page.locator('.map-marker').evaluateAll((n) => n.map((b) => (b as HTMLElement).dataset.activity!).sort());
    expect(ids).toEqual(expected);
    await expect(page.locator('.map-me')).toBeVisible();
    const painted = await page.evaluate(() => {
      const c = document.querySelector('.map-canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      return colors.size;
    });
    expect(painted).toBeGreaterThan(12);

    const scale = page.locator('.map-scale');
    const before = await scale.textContent();
    const box = (await wrap.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 800);
    await expect(scale).not.toHaveText(before!);
    await page.getByRole('button', { name: 'Show the whole city' }).click();
    await page.getByRole('button', { name: 'Center on my drone' }).click();

    const kind = await page.locator('.chip[data-kind]').first().getAttribute('data-kind');
    await page.locator(`.chip[data-kind="${kind}"]`).click();
    await expect(page.locator(`.chip[data-kind="${kind}"]`)).toHaveAttribute('aria-pressed', 'false');
    for (const m of await page.locator('.map-marker').all()) {
      const k = await m.evaluate((b) => window.__fly.game.activities.defs.get((b as HTMLElement).dataset.activity!)!.kind);
      if (k === kind) await expect(m).toBeHidden();
    }
    await page.locator(`.chip[data-kind="${kind}"]`).click();

    const marker = page.locator('.map-marker:visible').first();
    const id = await marker.getAttribute('data-activity');
    await marker.dispatchEvent('click');
    const card = page.locator('.map-card');
    await expect(card).toHaveAttribute('data-activity', id!);
    const title = await card.locator('h3').textContent();
    await card.getByRole('button', { name: 'Set waypoint' }).click();
    await expect(page.locator('.sheet')).toBeHidden();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe(title);
    expect(errors).toEqual([]);
  });

  test('[R-MAP] tapping empty map drops a pin that can become a waypoint', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('map'));
    const box = (await page.locator('.map-wrap').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.8);
    const card = page.locator('.map-card');
    await expect(card.locator('h3')).toHaveText('Dropped pin');
    await expect(card).toContainText(/37\.\d{4}, -122\.\d{4}/);
    await card.getByRole('button', { name: 'Set waypoint' }).click();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe('Dropped pin');
  });

  test('[R-WAYPOINT] the HUD marker shows distance, flips to an edge arrow when behind, and clears on arrival', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('journal'));
    const label = await page.locator('.journal-item strong').first().textContent();
    await page.locator('.journal-go').first().click();
    await page.evaluate(() => {
      const w = window.__fly.game.waypoint!;
      window.__fly.teleport({ x: w.x, y: w.y, z: w.z + 400 }, 0);
    });
    const wp = page.locator('.wp');
    await expect(wp.locator('.wp-label')).toBeVisible();
    await expect(wp.locator('b')).toHaveText(label!);
    await expect(wp.locator('span')).toHaveText('400 m');
    await expect(wp).not.toHaveClass(/off/);
    await expect(wp.locator('.wp-ring')).toBeVisible();
    await expect(page.locator('.hud-compass .wp-compass')).toBeVisible();
    await page.evaluate(() => window.__fly.teleport({ ...window.__fly.game.flight.pos }, Math.PI));
    await expect(wp).toHaveClass(/off/);
    await expect(page.locator('.wp-arrow')).toBeVisible();
    await page.evaluate(() => {
      const w = window.__fly.game.waypoint!;
      window.__fly.teleport({ x: w.x, y: w.y, z: w.z + 5 });
    });
    await expect(page.locator('.toast', { hasText: `Arrived: ${label}` })).toBeVisible();
    expect(await page.evaluate(() => window.__fly.game.waypoint)).toBeNull();
    await expect(wp.locator('.wp-label')).toBeHidden();
  });

  test('[R-MAP] the minimap opens the map and can be switched off', async ({ page }) => {
    await boot(page);
    const mini = page.locator('.minimap');
    await expect(mini).toBeVisible();
    await mini.click();
    await expect(page.locator('.sheet[data-panel="map"]')).toBeVisible();
    await page.locator('.chip', { hasText: 'Minimap' }).click();
    await page.keyboard.press('Escape');
    await expect(mini).toBeHidden();
    expect(await page.evaluate(() => window.__fly.game.save.data.settings.minimap)).toBe(false);
  });
});

test('[R-WAYPOINT] the compass shows nearby things to do and the menu suggests the nearest', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__fly.step(0.1));
  await expect(page.locator('.compass-pip:not([hidden])').first()).toBeVisible();
  await page.evaluate(() => window.__fly.game.panels.open('menu'));
  const first = page.locator('.menu-next-item').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-activity');
  await first.click();
  await expect(page.locator('.sheet')).toBeHidden();
  const label = await page.evaluate((a) => window.__fly.game.activities.defs.get(a!)!.title, id);
  expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe(label);
});
