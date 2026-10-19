import { test, expect, boot } from './fixtures';
import type { Page } from '@playwright/test';

async function goTo(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const f = window.__fly;
    f.reset();
    const def = f.game.activities.defs.get(id)!;
    for (const r of def.requires ?? []) f.game.save.complete(r);
    f.teleport(f.game.activities.position(def));
    f.step(0.1);
  }, id);
}

async function shot(page: Page, path: string): Promise<void> {
  await page.waitForTimeout(700);
  await page.screenshot({ path });
}

async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.evaluate(() => window.__fly.step(0.1));
}

test('[R-PLACES] [R-TRIVIA] [R-TOUR] every place discovery, trivia and tour is completed by the solver', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await boot(page);
  const result = await page.evaluate(async () => {
    const f = window.__fly;
    const list = f.activities().filter((a) => /^(discover|trivia|tour)-/.test(a.id));
    const failures: string[] = [];
    for (const a of list) {
      f.reset();
      const r = await f.solve(a.id);
      if (!r.ok) failures.push(`${a.id}: ${r.error}`);
    }
    return { failures, counts: { discover: list.filter((a) => a.kind === 'discover').length, trivia: list.filter((a) => a.kind === 'trivia').length, tour: list.filter((a) => a.kind === 'tour').length } };
  });
  expect(result.failures).toEqual([]);
  expect(result.counts.discover).toBeGreaterThanOrEqual(130);
  expect(result.counts.trivia).toBeGreaterThanOrEqual(70);
  expect(result.counts.tour).toBeGreaterThanOrEqual(14);
  expect(errors).toEqual([]);
});

test('[R-TRIVIA] pressing F opens the question; a wrong click fails and reveals the answer, a right key press wins', async ({ page }) => {
  const errors = await boot(page);
  const id = 'trivia-golden-gate-bridge';
  await goTo(page, id);
  await expect(page.locator('.hud-prompt')).toContainText('Golden Gate Bridge Trivia');
  await press(page, 'KeyF');
  const card = page.locator('.trivia');
  await expect(card).toBeVisible();
  await expect(card.locator('.trivia-q')).toHaveText('When did the Golden Gate Bridge open to the public?');
  await expect(card.locator('.trivia-opt')).toHaveCount(4);
  await page.evaluate(() => window.__fly.step(3));
  await shot(page, test.info().outputPath('trivia-question.png'));

  await card.locator('.trivia-opt:not([data-option="0"])').first().click();
  await page.evaluate(() => window.__fly.step(0.1));
  await expect(card).toHaveClass(/wrong/);
  await expect(card.locator('.trivia-result strong')).toHaveText('Not quite. It was 1937.');
  await expect(card.locator('.trivia-opt.is-answer')).toContainText('1937');
  await expect(card.locator('.trivia-opt.is-chosen')).toHaveCount(1);
  expect(await page.evaluate((id) => [window.__fly.state().active, window.__fly.game.save.isDone(id)], id)).toEqual([null, false]);
  await shot(page, test.info().outputPath('trivia-wrong.png'));

  await press(page, 'KeyF');
  const fresh = page.locator('.trivia:not(.answered)');
  await expect(fresh).toBeVisible();
  const slot = await fresh.locator('.trivia-opt').evaluateAll((els) => els.findIndex((e) => (e as HTMLElement).dataset.option === '0'));
  await press(page, `Digit${slot + 1}`);
  await expect(page.locator('.trivia.right .trivia-result strong')).toHaveText('Correct!');
  expect(await page.evaluate((id) => window.__fly.game.save.isDone(id), id)).toBe(true);
  expect(await page.evaluate(() => window.__fly.state().cards)).toContain('golden-gate-bridge');
  await shot(page, test.info().outputPath('trivia-right.png'));
  expect(errors).toEqual([]);
});

test('[R-TOUR] a tour narrates each stop in order and points the waypoint at the next', async ({ page }) => {
  const errors = await boot(page);
  const id = 'tour-golden-gate-shoreline';
  await goTo(page, id);
  await press(page, 'KeyF');
  const panel = page.locator('.tour');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.tour-title')).toHaveText('🧭Golden Gate Shoreline');
  const stops = await page.evaluate((id) => (window.__fly.game.activities.defs.get(id)!.params as { stops: { name: string; line: string }[] }).stops, id);
  for (const [i, stop] of stops.entries()) {
    if (i > 0) {
      expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe(stop.name);
      await page.evaluate(([id, i]) => {
        const f = window.__fly;
        const def = f.game.activities.defs.get(id as string)!;
        const s = f.game.activities.kindOf(def).solve(def, f.game)[(i as number) * 2];
        if ('teleport' in s) f.teleport(s.teleport);
        f.step(0.1);
      }, [id, i] as const);
    }
    await expect(panel.locator('.tour-kicker')).toHaveText(`Stop ${i + 1} of ${stops.length}`);
    await expect(panel.locator('.tour-name')).toHaveText(stop.name);
    await expect(panel.locator('.tour-line')).toHaveText(stop.line);
    await expect(panel.locator('.tour-dots li.done')).toHaveCount(i + 1);
    if (i < stops.length - 1) await expect(panel.locator('.tour-next')).toHaveText(`Next: ${stops[i + 1].name}`);
    if (i === 1) await shot(page, test.info().outputPath('tour-stop.png'));
  }
  await expect(panel).toHaveClass(/complete/);
  await expect(panel.locator('.tour-next')).toHaveText('Tour complete');
  expect(await page.evaluate((id) => window.__fly.game.save.isDone(id), id)).toBe(true);
  expect(await page.evaluate(() => window.__fly.game.waypoint)).toBeNull();
  await shot(page, test.info().outputPath('tour-complete.png'));
  expect(errors).toEqual([]);
});

test('[R-TRIVIA] [R-TOUR] @touch tapping the prompt and an answer works and the overlays fit the screen', async ({ page }) => {
  test.skip(!test.info().project.use.hasTouch, 'needs a touch screen');
  const errors = await boot(page);
  await goTo(page, 'trivia-boudin-bakery');
  await page.locator('.hud-prompt').tap();
  await page.evaluate(() => window.__fly.step(0.1));
  const card = page.locator('.trivia');
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
  await card.locator('.trivia-opt[data-option="3"]').tap();
  await page.evaluate(() => window.__fly.step(0.1));
  await expect(card).toHaveClass(/right/);
  await shot(page, test.info().outputPath('trivia-touch.png'));

  await goTo(page, 'tour-chinatown');
  await page.locator('.hud-prompt').tap();
  await page.evaluate(() => window.__fly.step(0.1));
  const panel = await page.locator('.tour').boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, test.info().outputPath('tour-touch.png'));
  expect(errors).toEqual([]);
});
