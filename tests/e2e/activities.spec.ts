import { test, expect, boot } from './fixtures';

test('[R-ACT-ALL] every activity in the game can be completed by the solver', async ({ page }) => {
  test.setTimeout(900_000);
  await boot(page);
  const result = await page.evaluate(async () => {
    const failures: string[] = [];
    const list = window.__fly.activities();
    for (const a of list) {
      window.__fly.reset();
      const r = await window.__fly.solve(a.id);
      if (!r.ok) failures.push(`${a.id}: ${r.error}`);
    }
    return { total: list.length, failures };
  });
  expect(result.failures).toEqual([]);
  expect(result.total).toBeGreaterThan(0);
});

test('[R-CONTENT-150] at least 150 startable (non-passive) activities across at least 12 kinds', async ({ page }) => {
  await boot(page);
  const stats = await page.evaluate(() => {
    const list = window.__fly.activities();
    const active = list.filter((a) => !a.passive);
    return { active: active.length, kinds: new Set(list.map((a) => a.kind)).size };
  });
  expect(stats.active).toBeGreaterThanOrEqual(150);
  expect(stats.kinds).toBeGreaterThanOrEqual(12);
});
