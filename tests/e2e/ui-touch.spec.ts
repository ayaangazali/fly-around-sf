import { test, expect, boot } from './fixtures';
import type { CDPSession, Page } from '@playwright/test';

const center = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 };
};
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

test.describe('touch controls @touch', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === 'desktop', 'touch only'));

  test('[R-TOUCH] two sticks at once fly the drone forward and up @touch', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.touch-ui')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const l = await center(page, '.stick-left');
    const r = await center(page, '.stick-right');
    const before = await page.evaluate(() => window.__fly.state());
    await touch(cdp, 'touchStart', [{ x: l.x, y: l.y, id: 1 }]);
    await touch(cdp, 'touchStart', [{ x: l.x, y: l.y, id: 1 }, { x: r.x, y: r.y, id: 2 }]);
    await touch(cdp, 'touchMove', [{ x: l.x, y: l.y - l.r, id: 1 }, { x: r.x, y: r.y - r.r, id: 2 }]);
    const axes = () => page.evaluate(() => ({ ...window.__fly.game.input.touch }));
    await expect.poll(async () => (await axes()).forward).toBeGreaterThan(0.9);
    await expect.poll(async () => (await axes()).lift).toBeGreaterThan(0.9);
    expect(Math.abs((await axes()).turn)).toBeLessThan(0.1);
    await expect(page.locator('.stick-left')).toHaveClass(/active/);
    await page.evaluate(() => window.__fly.step(2));
    const after = await page.evaluate(() => window.__fly.state());
    expect(Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)).toBeGreaterThan(30);
    expect(after.pos.y).toBeGreaterThan(before.pos.y + 10);
    await touch(cdp, 'touchMove', [{ x: l.x + l.r, y: l.y, id: 1 }, { x: r.x, y: r.y - r.r, id: 2 }]);
    await expect.poll(async () => (await axes()).turn).toBeGreaterThan(0.9);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => { const a = await axes(); return [Math.abs(a.forward) + Math.abs(a.turn) + Math.abs(a.lift) + Math.abs(a.strafe), a.boost]; }).toEqual([0, false]);
  });

  test('[R-TOUCH] boost, climb and interact buttons work by touch @touch', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const boost = await center(page, '.tbtn-boost');
    await touch(cdp, 'touchStart', [{ x: boost.x, y: boost.y, id: 3 }]);
    const input = () => page.evaluate(() => ({ ...window.__fly.game.input.touch }));
    await expect.poll(async () => (await input()).boost).toBe(true);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => (await input()).boost).toBe(false);
    const up = await center(page, '.tbtn-up');
    await touch(cdp, 'touchStart', [{ x: up.x, y: up.y, id: 4 }]);
    await expect.poll(async () => (await input()).lift).toBe(1);
    await touch(cdp, 'touchEnd', []);
    const id = await page.evaluate(() => {
      const d = window.__fly.game.activities.list().find((a) => !window.__fly.game.activities.kindOf(a).passive && !window.__fly.game.activities.locked(a))!;
      window.__fly.teleport(window.__fly.game.activities.position(d));
      window.__fly.step(1 / 30);
      return d.id;
    });
    await expect(page.locator('.tbtn-act')).toHaveClass(/ready/);
    await page.locator('.tbtn-act').tap();
    await expect.poll(() => page.evaluate(() => window.__fly.state().active)).toBe(id);
  });

  test('[R-MOBILE] HUD, title and every panel fit the screen with no horizontal overflow @touch', async ({ page }) => {
    await boot(page, 'title');
    const fits = async (what: string) => {
      const r = await page.evaluate(() => {
        const vw = window.innerWidth;
        const wide = [...document.querySelectorAll<HTMLElement>('#ui *, #loading *')].filter((n) => {
          if (!n.offsetParent && getComputedStyle(n).position !== 'fixed') return false;
          if (n.closest('.fx, .map-filters, .dex-tabs, .menubar, .map-markers, .hud-compass, .title-sky, .help-art')) return false;
          const b = n.getBoundingClientRect();
          return b.width > 0 && (b.right > vw + 1 || b.left < -1);
        });
        return { overflow: document.documentElement.scrollWidth - vw, wide: wide.slice(0, 5).map((n) => n.className) };
      });
      expect(r.overflow, what).toBeLessThanOrEqual(0);
      expect(r.wide, what).toEqual([]);
    };
    await fits('title');
    await page.locator('.title-btn.primary').click();
    await expect(page.locator('#loading')).toHaveCount(0);
    await fits('hud');
    const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tbtn, .menubar-btn, .stick')].filter((n) => n.getBoundingClientRect().width < 40 || n.getBoundingClientRect().height < 40).map((n) => n.className));
    expect(small).toEqual([]);
    const ids = await page.evaluate(() => window.__fly.game.panels.list().map((p) => p.id));
    for (const id of ids) {
      await page.evaluate((pid) => window.__fly.game.panels.open(pid), id);
      await expect(page.locator(`.sheet[data-panel="${id}"]`)).toBeVisible();
      await fits(id);
      const sheet = (await page.locator('.sheet').boundingBox())!;
      expect(sheet.x).toBeGreaterThanOrEqual(0);
      expect(sheet.x + sheet.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
      if (page.viewportSize()!.width <= 640) expect(sheet.width, id).toBeCloseTo(page.viewportSize()!.width, 0);
      await expect(page.locator('.touch-ui')).toBeHidden();
    }
  });
});

test('[R-TOUCH] desktop shows no touch controls', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await boot(page);
  await expect(page.locator('.hud-stats')).toBeVisible();
  await expect(page.locator('.touch-ui')).toHaveCount(0);
});
