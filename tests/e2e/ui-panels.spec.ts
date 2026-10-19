import AxeBuilder from '@axe-core/playwright';
import { test, expect, boot } from './fixtures';
import type { Page } from '@playwright/test';

const serious = async (page: Page, selector: string) => {
  const r = await new AxeBuilder({ page }).include(selector).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test.describe('menus', () => {
  test('[R-PANELS] [R-A11Y] every panel opens from its button, renders, passes axe and closes back to its button', async ({ page }) => {
    const errors = await boot(page);
    const ids = await page.evaluate(() => window.__fly.game.panels.list().filter((p) => !p.hidden).map((p) => p.id));
    expect(ids).toEqual(expect.arrayContaining(['menu', 'map', 'journal', 'dex', 'stats', 'help', 'settings']));
    for (const id of ids) {
      const button = page.locator(`.menubar-btn[data-panel="${id}"]`);
      await button.focus();
      await page.keyboard.press('Enter');
      const sheet = page.locator(`.sheet[data-panel="${id}"]`);
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('.sheet-body')).not.toBeEmpty();
      await expect(page.locator('.sheet-head h2')).toHaveAttribute('id', 'sheet-title');
      expect.soft(await serious(page, '.sheet'), `axe on the ${id} panel`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('.sheet')).toBeHidden();
      await expect(button).toBeFocused();
    }
    expect(await serious(page, '.menubar')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('[R-A11Y] Tab stays inside an open sheet and every control is reachable', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('settings'));
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        return { inside: !!a.closest('.sheet'), tag: `${a.tagName}.${a.className}` };
      });
      expect(where.inside).toBe(true);
      seen.add(where.tag);
    }
    expect([...seen].some((t) => t.includes('switch'))).toBe(true);
    expect([...seen].some((t) => t.includes('seg-opt'))).toBe(true);
    expect([...seen].some((t) => t.startsWith('INPUT'))).toBe(true);
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as HTMLElement).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('[R-PANELS] hotkeys toggle panels and the menu tiles open every other panel', async ({ page }) => {
    await boot(page);
    for (const [key, id] of [['m', 'map'], ['j', 'journal'], ['k', 'dex'], ['h', 'help']]) {
      await page.keyboard.press(key);
      await page.evaluate(() => window.__fly.step(1 / 30));
      await expect(page.locator(`.sheet[data-panel="${id}"]`)).toBeVisible();
      await page.evaluate(() => window.__fly.game.panels.close());
    }
    await page.evaluate(() => window.__fly.game.panels.open('menu'));
    const tiles = await page.locator('.menu-tile[data-panel]').evaluateAll((n) => n.map((b) => (b as HTMLElement).dataset.panel));
    for (const id of tiles) {
      await page.evaluate(() => window.__fly.game.panels.open('menu'));
      await page.locator(`.menu-tile[data-panel="${id}"]`).click();
      await expect(page.locator(`.sheet[data-panel="${id}"]`)).toBeVisible();
    }
    await page.evaluate(() => window.__fly.game.panels.open('menu'));
    await page.locator('.menu-tile.primary').click();
    await expect(page.locator('.sheet')).toBeHidden();
  });

  test('[R-PANELS] the journal searches and sets a waypoint', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('journal'));
    const all = await page.locator('.journal-item').count();
    expect(all).toBeGreaterThan(0);
    const far = page.locator('.journal-item').filter({ has: page.locator('.journal-meta', { hasText: / km/ }) }).first();
    const id = await far.getAttribute('data-activity');
    const title = await far.locator('strong').textContent();
    await page.locator('.journal-filter').fill('zzzz-nothing');
    await expect(page.locator('.journal-item')).toHaveCount(0);
    await page.locator('.journal-filter').fill(title!.slice(0, 6));
    await expect(page.locator('.journal-item').first()).toBeVisible();
    await page.locator(`.journal-item[data-activity="${id}"] .journal-go`).click();
    await expect(page.locator('.sheet')).toBeHidden();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBeTruthy();
  });
});

test.describe('settings', () => {
  test('[R-SETTINGS] [R-HUD-FX] changes apply live and persist across a reload', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('settings'));
    const s = page.locator('.sheet');
    await s.locator('.seg-opt', { hasText: 'Imperial' }).click();
    await s.locator('.seg-opt', { hasText: 'Low' }).click();
    await expect(s.getByRole('button', { name: 'Reload now' })).toBeVisible();
    await s.locator('.set-row', { hasText: 'Show FPS' }).locator('.switch').click();
    await s.locator('.set-row', { hasText: 'Reduce motion' }).locator('.switch').click();
    await s.locator('.set-row', { hasText: 'Mute everything' }).locator('.switch').click();
    await s.locator('.set-row', { hasText: 'Turn speed' }).locator('input').fill('1.4');
    await s.locator('.set-row', { hasText: 'Master' }).locator('input').fill('0.3');
    await s.locator('.seg-opt', { hasText: 'Night' }).click();
    const name = s.locator('.set-row', { hasText: 'Pilot name' }).locator('input');
    await name.fill('Fog Runner');
    await name.press('Tab');
    await s.locator('.swatch').nth(1).click();
    const live = await page.evaluate(() => ({ turn: window.__fly.game.env.turnRate, reduce: document.documentElement.classList.contains('reduce-motion') }));
    expect(live).toEqual({ turn: 1.4, reduce: true });
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__fly.step(0.1));
    await expect(page.locator('.hud-fps')).toBeVisible();
    await expect(page.locator('.hud-stats')).toContainText('mph');
    await page.reload();
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
    const saved = await page.evaluate(() => window.__fly.game.save.data.settings);
    expect(saved).toMatchObject({ units: 'imperial', quality: 'low', showFps: true, reducedMotion: true, muted: true, turnSpeed: 1.4, volMaster: 0.3, timeMode: 'night', playerName: 'Fog Runner', droneColor: '#ff6a3d' });
    expect(await page.evaluate(() => window.__fly.game.env.turnRate)).toBe(1.4);
    await page.evaluate(() => window.__fly.game.panels.open('settings'));
    await expect(page.locator('.seg-opt[aria-checked="true"]', { hasText: 'Imperial' })).toBeVisible();
    await expect(page.locator('.set-row', { hasText: 'Pilot name' }).locator('input')).toHaveValue('Fog Runner');
  });

  test('[R-SETTINGS] reset progress needs two taps and keeps settings', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      g.save.complete(window.__fly.activities()[0].id, 50);
      g.save.data.settings.units = 'imperial';
    });
    await page.evaluate(() => window.__fly.game.panels.open('settings'));
    const wipe = page.getByRole('button', { name: 'Reset progress' });
    await wipe.click();
    expect(await page.evaluate(() => window.__fly.state().xp)).toBe(50);
    await page.getByRole('button', { name: 'Tap again to erase everything' }).click();
    const after = await page.evaluate(() => ({ ...window.__fly.state(), units: window.__fly.game.save.data.settings.units, flags: window.__fly.game.save.data.flags }));
    expect(after).toMatchObject({ xp: 0, completed: [], units: 'imperial', flags: { onboarded: true } });
  });
});
