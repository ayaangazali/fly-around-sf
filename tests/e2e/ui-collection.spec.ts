import AxeBuilder from '@axe-core/playwright';
import { test, expect, boot } from './fixtures';

test.describe('collection, achievements and HUD effects', () => {
  test('[R-DEX] the book lists every card and locked cards are mysteries with hints', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('dex'));
    const body = page.locator('.dex-body');
    const total = Number(await body.getAttribute('data-total'));
    await expect(page.locator('.dex-view .tcard')).toHaveCount(total);
    if (total === 0) {
      await expect(page.locator('.dex-empty')).toBeVisible();
      return;
    }
    const ids = await page.locator('.dex-view .tcard').evaluateAll((n) => n.map((c) => (c as HTMLElement).dataset.card!));
    expect(new Set(ids).size).toBe(total);
    await expect(page.locator('.dex-view .tcard.locked')).toHaveCount(total);
    await expect(page.locator('.tcard.locked .tcard-info b').first()).toHaveText('???');
    await page.locator('.tcard.locked').first().click();
    await expect(page.locator('.dex-hint')).toBeVisible();
    await expect(page.locator('.dex-info h3')).toHaveText('Undiscovered card');
    await page.getByRole('button', { name: '← All cards' }).click();
    await page.evaluate((id) => {
      window.__fly.game.save.addCard(id);
      window.__fly.game.panels.open('dex');
    }, ids[0]);
    await expect(page.locator('.dex-view .tcard.locked')).toHaveCount(total - 1);
    await page.locator(`.tcard[data-card="${ids[0]}"]`).click();
    await expect(page.locator('.dex-lore')).toBeVisible();
    await expect(page.locator('.dex-sources a').first()).toHaveAttribute('href', /^https:\/\//);
    await page.locator('.dex-actions .btn').scrollIntoViewIfNeeded();
    const r = await new AxeBuilder({ page }).include('.sheet').analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    const tab = page.locator('.dex-tab').nth(1);
    const cat = await tab.getAttribute('data-category');
    await tab.click();
    for (const c of await page.locator('.dex-view .tcard').all()) await expect(c).toHaveClass(new RegExp(`cat-${cat}`));
  });

  test('[R-CARD-REVEAL] unlocking a card plays the reveal and opens it in the book', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('dex'));
    const cards = page.locator('.dex-view .tcard');
    const first = (await cards.count()) ? await cards.first().getAttribute('data-card') : null;
    await page.keyboard.press('Escape');
    test.skip(!first, 'this build has no card content');
    await page.evaluate((id) => window.__fly.game.bus.emit('card:unlock', { id }), first!);
    const reveal = page.locator(`.reveal[data-card="${first}"]`);
    await expect(reveal).toBeVisible();
    await expect(reveal.locator('.reveal-caption small')).toHaveText(/^New (common|rare|legendary) card$/);
    await reveal.getByRole('button', { name: 'View card' }).click();
    await expect(page.locator(`.dex-detail[data-card="${first}"]`)).toBeVisible();
    await expect(page.locator('.reveal')).toHaveCount(0);
  });

  test('[R-ACHIEVEMENTS] an achievement unlocks once, shows a banner and appears in the pilot log', async ({ page }) => {
    await boot(page);
    const count = await page.evaluate(() => window.__fly.activities().filter((a) => a.kind === 'achievement').length);
    expect(count).toBeGreaterThanOrEqual(30);
    const before = await page.evaluate(() => {
      window.__fly.step(0.1);
      return Object.keys(window.__fly.game.save.data.completed).filter((id) => id.startsWith('achievement-')).length;
    });
    await page.evaluate(() => {
      window.__fly.game.panels.open('map');
      window.__fly.game.panels.close();
      window.__fly.step(0.1);
    });
    const banner = page.locator('.ach[data-activity="achievement-cartographer"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Cartographer');
    await expect(page.locator('.toast', { hasText: 'Cartographer' })).toHaveCount(0);
    await page.evaluate(() => window.__fly.game.panels.open('stats'));
    await expect(page.locator('.ach-card.got[data-activity="achievement-cartographer"]')).toBeVisible();
    await expect(page.locator('.stat-tile[data-stat="achievements"] b')).toHaveText(`${before + 1}/${count}`);
    await page.evaluate(() => {
      window.__fly.game.panels.close();
      window.__fly.game.panels.open('map');
      window.__fly.game.panels.close();
      window.__fly.step(0.1);
    });
    expect(await page.evaluate(() => Object.keys(window.__fly.game.save.data.completed).filter((id) => id === 'achievement-cartographer').length)).toBe(1);
    await expect(page.locator('.ach[data-activity="achievement-cartographer"]')).toHaveCount(1);
  });

  test('[R-ACHIEVEMENTS] the pilot log shows flight stats and completion breakdowns', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const s = window.__fly.game.save.data.stats;
      s.distance = 12345;
      s.flightTime = 3725;
      s.crashes = 3;
      window.__fly.game.panels.open('stats');
    });
    await expect(page.locator('.stat-tile[data-stat="distance"] b')).toHaveText('12.3 km');
    await expect(page.locator('.stat-tile[data-stat="time"] b')).toHaveText('1h 02m');
    await expect(page.locator('.stat-tile[data-stat="crashes"] b')).toHaveText('3');
    await expect(page.locator('.stat-section', { hasText: 'By neighborhood' }).locator('li').first()).toBeVisible();
    await expect(page.locator('.stat-section', { hasText: 'By kind' }).locator('li').first()).toBeVisible();
    await expect(page.locator('.pilot [role="progressbar"]')).toHaveAttribute('aria-valuenow', /\d+/);
  });

  test('[R-HUD-FX] crashes flash and shake, splashes splash, boost draws speed lines', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.bus.emit('player:crash', { speed: 30 }));
    await expect(page.locator('.fx-crash')).toHaveClass(/on/);
    await expect(page.locator('canvas#view')).toHaveClass(/shake/);
    await page.evaluate(() => window.__fly.game.bus.emit('player:splash', {}));
    await expect(page.locator('.fx-splash')).toHaveClass(/on/);
    await expect(page.locator('.fx-speed')).toHaveCSS('opacity', '0');
    await page.evaluate(() => {
      const f = window.__fly.game.flight;
      f.vel = { x: 60, y: 0, z: 0 };
      f.battery = 0.1;
    });
    await expect.poll(async () => Number(await page.locator('.fx-speed').evaluate((n) => getComputedStyle(n).opacity))).toBeGreaterThan(0.5);
    await expect(page.locator('.fx-low')).toHaveClass(/on/);
    await expect(page.locator('.hud-fps')).toBeHidden();
    await page.evaluate(() => (window.__fly.game.save.data.settings.showFps = true));
    await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/);
  });
});
