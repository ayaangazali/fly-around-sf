import { test, expect, boot } from './fixtures';

test.describe('flight', () => {
  test('[R-V2-HOLD] with live wind blowing, 15 s of no input moves the drone less than 1 m', async ({ page }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await boot(page, 'live');
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      window.__fly.step(1, 1 / 60);
      const a = { ...g.flight.pos };
      window.__fly.step(15, 1 / 60);
      const b = g.flight.pos;
      return { wind: Math.hypot(g.env.wind?.x ?? 0, g.env.wind?.z ?? 0), moved: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) };
    });
    expect(r.wind).toBeGreaterThan(0.5);
    expect(r.moved).toBeLessThan(1);
  });
});
