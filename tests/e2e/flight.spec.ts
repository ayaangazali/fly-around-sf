import { test, expect, boot } from './fixtures';

type Pad = { buttons: { pressed: boolean; value: number }[] };

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

  test('[R-INPUT] gamepad Y, Back and Start open and close panels, even while a panel is open', async ({ page }) => {
    await page.addInitScript(() => {
      const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      (window as unknown as { __pad: Pad }).__pad = pad;
      Navigator.prototype.getGamepads = () => [pad as unknown as Gamepad];
    });
    await boot(page);
    const press = (i: number) =>
      page.evaluate((b) => {
        const pad = (window as unknown as { __pad: Pad }).__pad;
        pad.buttons[b].pressed = true;
        window.__fly.step(1 / 30);
        pad.buttons[b].pressed = false;
        window.__fly.step(1 / 30);
        return window.__fly.game.panels.openId;
      }, i);
    expect(await press(3)).toBe('map');
    expect(await press(9)).toBeNull();
    expect(await press(8)).toBe('journal');
    expect(await press(3)).toBe('map');
    expect(await press(9)).toBeNull();
    expect(await press(9)).toBe('menu');
  });
});
