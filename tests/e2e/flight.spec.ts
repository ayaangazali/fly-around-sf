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

  test('[R-V2-CAMERA] backed up against a tower, the chase camera pulls in instead of entering it or jumping onto its roof', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const c = g.world.city;
      const p = g.world.toLocal(37.792, -122.4036);
      let b = -1;
      for (const i of c.near(p.x, p.z, 60)) if (b < 0 || c.height[i] > c.height[b]) b = i;
      let x = c.cx[b];
      while (c.contains(b, x, c.cz[b])) x += 1;
      window.__fly.teleport({ x: x + 5, y: c.ground[b] + 22, z: c.cz[b] }, -Math.PI / 2);
      let worst = { above: 0, inside: false, blocked: false };
      for (let i = 0; i < 40; i++) {
        window.__fly.step(1 / 30);
        g.render(1 / 30);
        const cam = g.camera.position;
        const d = g.flight.pos;
        let blocked = false;
        for (let k = 1; k < 10; k++) {
          const q = { x: d.x + ((cam.x - d.x) * k) / 10, y: d.y + ((cam.y - d.y) * k) / 10, z: d.z + ((cam.z - d.z) * k) / 10 };
          blocked ||= g.world.collide(q, 0.1);
        }
        worst = { above: Math.max(worst.above, cam.y - d.y), inside: worst.inside || g.world.collide({ x: cam.x, y: cam.y, z: cam.z }, 0.1), blocked: worst.blocked || blocked };
      }
      return { ...worst, height: c.height[b] };
    });
    expect(r.height).toBeGreaterThan(150);
    expect(r.above).toBeLessThan(10);
    expect(r.inside).toBe(false);
    expect(r.blocked).toBe(false);
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
