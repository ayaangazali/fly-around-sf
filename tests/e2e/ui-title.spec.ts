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
    await expect(page.locator('.title-credit')).toContainText('OpenStreetMap contributors');
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

  test('[R-HOLD] nothing happens behind the title: the HUD is out of reach and the first card waits for Start', async ({ page }) => {
    test.setTimeout(240_000);
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.goto('./?cityRadius=1500&quality=low');
    await expect(page.locator('.title-menu')).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fly-around-sf:save') ?? '{}').cards)).toEqual([]);
    await expect(page.locator('.reveal')).toHaveCount(0);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#ui'))).toBe(false);
    }
    await page.locator('.title-btn[data-action="start"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reveal')).toBeVisible();
    await expect(page.locator('.toast', { hasText: 'to chat' })).toHaveCount(0);
  });

  test('[R-TITLE] a share link with a room offers Join friends first, and a broken one says so', async ({ page }) => {
    await boot(page, 'title&room=fgc-ty2');
    const join = page.locator('.title-btn[data-action="join"]');
    await expect(join).toContainText('Join friends');
    await expect(join).toContainText('Room FGCTY2');
    await expect(join).toHaveClass(/primary/);
    await join.click();
    await expect(page.locator('#loading')).toHaveCount(0);
    await boot(page, 'title&room=MEET-AT-PIER-39-B0AT');
    await expect(page.locator('.title-btn[data-action="join"]')).toHaveCount(0);
    await expect(page.locator('.title-warn')).toHaveText(/This room link is not valid/);
    await expect(page.locator('.title-btn.primary')).toHaveAttribute('data-action', 'start');
    await expect(page.locator('.title-card')).not.toContainText('MEET-AT-PIER');
  });
});

const ensureTrail = (page: Page) =>
  page.evaluate(() => {
    const g = window.__fly.game;
    if (g.activities.list().some((d) => d.kind === 'trail')) return;
    const kind = { kind: 'trail', label: 'Trail', icon: '⭐', validate: () => [], start: () => ({ update: () => 'running' as const, progress: () => 0, hud: () => '' }), solve: () => [] };
    const stop = (order: number, lat: number, lon: number) => ({ id: `trail-test-${order}`, kind: 'trail', title: `Test stop ${order}`, blurb: 'b', neighborhood: 'n', at: { lat, lon }, params: { order } });
    g.activities.register([kind], [stop(2, 37.7955, -122.3937), stop(1, 37.8075, -122.4175)]);
  });

const firstStop = (page: Page) =>
  page.evaluate(() => {
    const g = window.__fly.game;
    const d = g.activities
      .list()
      .filter((a) => a.kind === 'trail' && !g.save.isDone(a.id))
      .sort((a, b) => Number(a.params?.order) - Number(b.params?.order))[0];
    const p = g.activities.position(d);
    return { title: d.title, x: p.x, z: p.z };
  });

const offTarget = (page: Page) =>
  page.evaluate(() => {
    const g = window.__fly.game;
    const w = g.waypoint!;
    const f = g.flight;
    const rel = Math.atan2(w.x - f.pos.x, -(w.z - f.pos.z)) + f.yaw;
    return Math.atan2(Math.sin(rel), Math.cos(rel));
  });

test.describe('onboarding', () => {
  test('[R-ONBOARD] the tutorial advances as the pilot flies, then never shows again', async ({ page }) => {
    await boot(page, 'title');
    await ensureTrail(page);
    await page.locator('.title-btn[data-action="start"]').click();
    await onStep(page, 'forward');
    await expect(page.locator('.onboard-count')).toHaveText('Step 1 of 5');
    await expect(page.locator('.onboard-hint kbd').first()).toHaveText('W');
    await hold(page, ['KeyW'], 2);
    await onStep(page, 'turn');
    await hold(page, ['KeyD'], 1);
    await onStep(page, 'climb');
    await hold(page, ['ShiftLeft'], 1.5);
    await expect(page.locator('.onboard-parts span.ok')).toHaveText('Descend');
    await hold(page, ['Space'], 1.5);
    await onStep(page, 'boost');
    await hold(page, ['KeyW', 'KeyR'], 3);
    await onStep(page, 'objective');
    const stop = await firstStop(page);
    expect(await page.evaluate(() => window.__fly.game.waypoint)).toMatchObject({ label: stop.title, x: stop.x, z: stop.z });
    await page.evaluate(({ x, z }) => {
      const g = window.__fly.game;
      const f = g.flight.pos;
      const d = Math.hypot(x - f.x, z - f.z);
      window.__fly.teleport({ x: f.x + ((x - f.x) / d) * 150, y: f.y, z: f.z + ((z - f.z) / d) * 150 });
      window.__fly.step(1 / 30);
    }, stop);
    await onStep(page, 'done');
    await expect(page.locator('.onboard-title')).toHaveText(`First stop: ${stop.title}`);
    expect(await page.evaluate(() => window.__fly.game.save.data.flags.onboarded)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
    await page.locator('.title-btn.primary').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.onboard')).toHaveCount(0);
  });

  test('[R-V2-ONBOARD] on the free-running game, real key presses finish all five steps, descending first, and the tutorial ends pointing at trail stop 1', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'title');
    await ensureTrail(page);
    await page.locator('.title-btn[data-action="start"]').click();
    await page.evaluate(() => (window.__fly.game.autoSim = true));
    const until = async (keys: string[], id: string) => {
      for (const k of keys) await page.keyboard.down(k);
      await expect(page.locator(`.onboard[data-step="${id}"]`)).toBeVisible({ timeout: 60_000 });
      for (const k of keys) await page.keyboard.up(k);
    };
    await expect(page.locator('.onboard-count')).toHaveText('Step 1 of 5');
    await until(['KeyW'], 'turn');
    await until(['KeyD'], 'climb');
    await page.keyboard.down('ShiftLeft');
    await expect(page.locator('.onboard-parts span').nth(1)).toHaveClass(/ok/, { timeout: 60_000 });
    await page.keyboard.up('ShiftLeft');
    await until(['Space'], 'boost');
    await until(['KeyW', 'KeyR'], 'objective');
    const stop = await firstStop(page);
    for (let i = 0; i < 80; i++) {
      const rel = await offTarget(page);
      if (Math.abs(rel) < 0.25) break;
      const key = rel > 0 ? 'KeyD' : 'KeyA';
      await page.keyboard.down(key);
      await page.waitForTimeout(120);
      await page.keyboard.up(key);
    }
    await until(['KeyW'], 'done');
    await expect(page.locator('.onboard-title')).toHaveText(`First stop: ${stop.title}`);
    expect(await page.evaluate(() => window.__fly.game.waypoint)).toMatchObject({ label: stop.title, x: stop.x, z: stop.z });
    await expect(page.locator('.wp-label')).toBeVisible();
    expect(await page.evaluate(() => window.__fly.game.save.data.flags.onboarded)).toBe(true);
  });

  test('[R-V2-ONBOARD] on a phone, real touches on the sticks and buttons finish all five steps @touch', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'title');
    test.skip(!(await page.evaluate(() => document.documentElement.classList.contains('touch'))), 'touch devices only');
    await ensureTrail(page);
    await page.locator('.title-btn[data-action="start"]').click();
    await page.evaluate(() => (window.__fly.game.autoSim = true));
    const cdp = await page.context().newCDPSession(page);
    const center = async (sel: string) => {
      const b = (await page.locator(sel).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id })) });
    const press = async (points: { x: number; y: number }[], to: { x: number; y: number }[], done: () => Promise<void>) => {
      await touch('touchStart', points);
      await touch('touchMove', to);
      await done();
      await touch('touchEnd', []);
    };
    const stick = await center('.stick-left');
    const step = (id: string) => () => expect(page.locator(`.onboard[data-step="${id}"]`)).toBeVisible({ timeout: 60_000 });
    await press([stick], [{ x: stick.x, y: stick.y - 60 }], step('turn'));
    await press([stick], [{ x: stick.x + 60, y: stick.y }], step('climb'));
    const down = await center('.tbtn-down');
    await press([down], [down], () => expect(page.locator('.onboard-parts span').nth(1)).toHaveClass(/ok/, { timeout: 60_000 }));
    const up = await center('.tbtn-up');
    await press([up], [up], step('boost'));
    const boost = await center('.tbtn-boost');
    await press([stick, boost], [{ x: stick.x, y: stick.y - 60 }, boost], step('objective'));
    const stop = await firstStop(page);
    for (let i = 0; i < 80; i++) {
      const rel = await offTarget(page);
      if (Math.abs(rel) < 0.25) break;
      await press([stick], [{ x: stick.x + Math.sign(rel) * 60, y: stick.y }], () => page.waitForTimeout(120));
    }
    await press([stick], [{ x: stick.x, y: stick.y - 60 }], step('done'));
    await expect(page.locator('.onboard-title')).toHaveText(`First stop: ${stop.title}`);
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe(stop.title);
  });

  test('[R-ONBOARD] at spawn the tutorial, the activity prompt and the drone never cover each other @touch', async ({ page }) => {
    await boot(page, 'title');
    await page.locator('.title-btn[data-action="start"]').click();
    await onStep(page, 'forward');
    const layout = () =>
      page.evaluate(async () => {
        window.__fly.step(0.1);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const g = window.__fly.game;
        const box = (s: string) => {
          const e = document.querySelector(s);
          const r = e?.getBoundingClientRect();
          return r && r.width > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
        };
        const Vec = g.camera.position.constructor as new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number } };
        const v = new Vec(g.flight.pos.x, g.flight.pos.y, g.flight.pos.z).project(g.camera);
        return { card: box('.onboard'), prompt: box('.hud-prompt'), drone: { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }, W: innerWidth };
      });
    type Box = { l: number; t: number; r: number; b: number } | null;
    const meet = (a: Box, b: Box) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const first = await layout();
    expect(first.card).not.toBeNull();
    expect(meet(first.card, first.prompt)).toBe(false);
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    const { prompt, drone, W } = await layout();
    expect(prompt).not.toBeNull();
    expect(prompt!.r - prompt!.l).toBeGreaterThanOrEqual(Math.min(300, W - 90));
    expect(meet(prompt, { l: drone.x - 20, t: drone.y - 20, r: drone.x + 20, b: drone.y + 20 })).toBe(false);
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
