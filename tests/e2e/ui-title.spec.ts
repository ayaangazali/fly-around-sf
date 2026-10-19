import AxeBuilder from '@axe-core/playwright';
import { test, expect, boot } from './fixtures';
import type { Page } from '@playwright/test';

const step = (page: Page, s: number) => page.evaluate((t) => window.__fly.step(t), s);
const onStep = (page: Page, id: string) => expect(page.locator(`.onboard[data-step="${id}"]`)).toBeVisible();
const hold = async (page: Page, keys: string[], seconds: number) => {
  for (const k of keys) await page.keyboard.down(k);
  await step(page, seconds);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const k of keys) await page.keyboard.up(k);
};

test.describe('title screen', () => {
  test('[R-TITLE] a new pilot picks a name and color, then starts flying', async ({ page }) => {
    const errors = await boot(page, 'title');
    await expect(page.locator('.title-progress [role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
    const name = page.getByRole('textbox', { name: 'Pilot name' });
    await expect(name).toHaveValue(/^Pilot-\d{4}$/);
    await name.fill('Karl the Fog');
    await page.getByRole('radio', { name: 'Drone color #7de0a6' }).click();
    await expect(page.getByRole('radio', { name: 'Drone color #7de0a6' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.title-btn[data-action="continue"]')).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).include('#loading').analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    await page.locator('.title-btn[data-action="start"]').click();
    await expect(page.locator('#loading')).toHaveCount(0);
    expect(await page.evaluate(() => window.__fly.game.save.data.settings)).toMatchObject({ playerName: 'Karl the Fog', droneColor: '#7de0a6' });
    await onStep(page, 'forward');
    expect(errors).toEqual([]);
  });

  test('[R-TITLE] a returning pilot can continue or start over after confirming', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      g.save.data.settings.playerName = 'Mavericks';
      g.save.data.flags.onboarded = true;
      g.save.complete(window.__fly.activities().find((a) => !a.passive)!.id, 120);
    });
    await page.goto(page.url() + '&title');
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
    const cont = page.locator('.title-btn[data-action="continue"]');
    await expect(cont).toContainText('Mavericks');
    await expect(cont).toContainText('Level 2');
    await expect(cont).toBeFocused();
    const fresh = page.locator('.title-btn[data-action="new"]');
    await fresh.click();
    await expect(fresh).toContainText('Tap again');
    expect(await page.evaluate(() => window.__fly.state().xp)).toBe(120);
    await fresh.click();
    expect(await page.evaluate(() => window.__fly.state())).toMatchObject({ xp: 0, completed: [] });
    await expect(page.getByRole('textbox', { name: 'Pilot name' })).toBeFocused();
    await page.locator('.title-btn[data-action="start"]').click();
    await onStep(page, 'forward');
  });

  test('[R-TITLE] a share link with a room offers Join friends first', async ({ page }) => {
    await boot(page, 'title&room=FOGCITY');
    const join = page.locator('.title-btn[data-action="join"]');
    await expect(join).toContainText('Join friends');
    await expect(join).toContainText('FOGCITY');
    await expect(join).toHaveClass(/primary/);
    await join.click();
    await expect(page.locator('#loading')).toHaveCount(0);
  });
});

test.describe('onboarding', () => {
  test('[R-ONBOARD] the tutorial advances as the pilot flies, then never shows again', async ({ page }) => {
    await boot(page, 'title');
    await page.locator('.title-btn[data-action="start"]').click();
    await onStep(page, 'forward');
    await expect(page.locator('.onboard-hint kbd').first()).toHaveText('W');
    await hold(page, ['KeyW'], 2);
    await onStep(page, 'turn');
    await hold(page, ['KeyD'], 1);
    await onStep(page, 'climb');
    await hold(page, ['Space'], 1.5);
    await hold(page, ['ShiftLeft'], 1);
    await onStep(page, 'boost');
    await hold(page, ['KeyW', 'KeyR'], 2.5);
    await onStep(page, 'journal');
    await page.keyboard.press('KeyJ');
    await step(page, 1 / 30);
    await expect(page.locator('.sheet[data-panel="journal"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await onStep(page, 'activity');
    const target = await page.evaluate(() => window.__fly.game.waypoint);
    expect(target?.label).toBeTruthy();
    await page.evaluate(() => {
      const g = window.__fly.game;
      const d = g.activities.list().find((a) => a.title === g.waypoint!.label)!;
      window.__fly.teleport(g.activities.position(d));
      window.__fly.step(1 / 30);
    });
    await page.keyboard.press('KeyF');
    await step(page, 1 / 30);
    await onStep(page, 'done');
    expect(await page.evaluate(() => window.__fly.game.save.data.flags.onboarded)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
    await page.locator('.title-btn.primary').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.onboard')).toHaveCount(0);
  });

  test('[R-ONBOARD] the tutorial can be skipped and replayed from settings', async ({ page }) => {
    await boot(page, 'title');
    await page.locator('.title-btn[data-action="start"]').click();
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    await expect(page.locator('.onboard')).toHaveCount(0);
    expect(await page.evaluate(() => window.__fly.game.save.data.flags.onboarded)).toBe(true);
    await page.evaluate(() => window.__fly.game.panels.open('settings'));
    await page.getByRole('button', { name: 'Replay tutorial' }).click();
    await onStep(page, 'forward');
  });
});
