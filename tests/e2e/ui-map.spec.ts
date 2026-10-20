import type { Page } from '@playwright/test';
import { test, expect, boot } from './fixtures';

async function trail(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = window.__fly.game;
    if (!g.activities.list().some((d) => d.kind === 'trail')) {
      const spots: [number, number, string][] = [
        [37.7955, -122.3937, 'Ferry Building'],
        [37.76082, -122.38604, 'Y Combinator'],
        [37.8024, -122.4058, 'Coit Tower'],
        [37.7694, -122.4862, 'Golden Gate Park'],
      ];
      g.activities.register(
        [{ kind: 'trail', label: 'Founder Trail', icon: '★', validate: () => [], start: () => ({ update: () => 'running', progress: () => 0, hud: () => '' }), solve: () => [] }],
        spots.map(([lat, lon, title], i) => ({ id: `trail-e2e-${i + 1}`, kind: 'trail', title, blurb: 'A stop.', neighborhood: 'SF', at: { lat, lon }, params: { order: i + 1 } })),
      );
    }
    return g.activities
      .list()
      .filter((d) => d.kind === 'trail')
      .sort((a, b) => Number(a.params?.order) - Number(b.params?.order))
      .map((d) => d.id);
  });
}

const frames = (page: Page, n: number) =>
  page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((f) => requestAnimationFrame(f));
  }, n);

test.describe('map and waypoints', () => {
  test('[R-MAP] the map draws the city, the player and every mappable activity, and sets a waypoint', async ({ page }) => {
    const errors = await boot(page);
    const expected = await page.evaluate(() => {
      window.__fly.game.save.data.settings.sideActivities = true;
      return window.__fly.activities().filter((a) => a.kind === 'trail' || (a.kind !== 'achievement' && !a.hidden)).map((a) => a.id).sort();
    });
    await page.keyboard.press('KeyM');
    await page.evaluate(() => window.__fly.step(1 / 30));
    const wrap = page.locator('.map-wrap');
    await expect(wrap).toBeVisible();
    const ids = await page.locator('.map-marker').evaluateAll((n) => n.map((b) => (b as HTMLElement).dataset.activity!).sort());
    expect(ids).toEqual(expected);
    await expect(page.locator('.map-me')).toBeVisible();
    const painted = () =>
      page.evaluate(() => {
        const c = document.querySelector('.map-canvas') as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        const colors = new Set<number>();
        for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
        return colors.size;
      });
    await expect.poll(painted).toBeGreaterThan(12);

    const scale = page.locator('.map-scale');
    const before = await scale.textContent();
    const box = (await wrap.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 800);
    await expect(scale).not.toHaveText(before!);
    await page.getByRole('button', { name: 'Show the whole city' }).click();
    await page.getByRole('button', { name: 'Center on my drone' }).click();

    const kind = await page.locator('.chip[data-kind]').first().getAttribute('data-kind');
    const shown = () => page.locator('.map-marker').evaluateAll((n, k) => n.filter((b) => b.checkVisibility() && window.__fly.game.activities.defs.get((b as HTMLElement).dataset.activity!)!.kind === k).length, kind);
    await expect.poll(shown).toBeGreaterThan(0);
    await page.locator(`.chip[data-kind="${kind}"]`).click();
    await expect(page.locator(`.chip[data-kind="${kind}"]`)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(shown).toBe(0);
    await page.locator(`.chip[data-kind="${kind}"]`).click();

    const marker = page.locator('.map-marker:visible').first();
    const id = await marker.getAttribute('data-activity');
    await marker.dispatchEvent('click');
    const card = page.locator('.map-card');
    await expect(card).toHaveAttribute('data-activity', id!);
    const title = await card.locator('h3').textContent();
    await card.getByRole('button', { name: 'Set waypoint' }).click();
    await expect(page.locator('.sheet')).toBeHidden();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe(title);
    expect(errors).toEqual([]);
  });

  test('[R-MAP] tapping empty map drops a pin that can become a waypoint', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('map'));
    const box = (await page.locator('.map-wrap').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.8);
    const card = page.locator('.map-card');
    await expect(card.locator('h3')).toHaveText('Dropped pin');
    await expect(card).toContainText(/37\.\d{4}, -122\.\d{4}/);
    await card.getByRole('button', { name: 'Set waypoint' }).click();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe('Dropped pin');
  });

  test('[R-WAYPOINT] the HUD marker shows distance, flips to an edge arrow when behind, and clears on arrival', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('journal'));
    const far = page.locator('.journal-item').filter({ has: page.locator('.journal-meta', { hasText: / km/ }) }).first();
    const label = await far.locator('strong').textContent();
    await far.locator('.journal-go').click();
    await page.evaluate(() => {
      const w = window.__fly.game.waypoint!;
      window.__fly.teleport({ x: w.x, y: w.y, z: w.z + 400 }, 0);
    });
    const wp = page.locator('.wp');
    await expect(wp.locator('.wp-label')).toBeVisible();
    await expect(wp.locator('b')).toHaveText(label!);
    await expect(wp.locator('span')).toHaveText('400 m');
    await expect(wp).not.toHaveClass(/off/);
    await expect(wp.locator('.wp-ring')).toBeVisible();
    await expect(page.locator('.hud-compass .wp-compass')).toBeVisible();
    await page.evaluate(() => window.__fly.teleport({ ...window.__fly.game.flight.pos }, Math.PI));
    await expect(wp).toHaveClass(/off/);
    await expect(page.locator('.wp-arrow')).toBeVisible();
    await page.evaluate(() => {
      const w = window.__fly.game.waypoint!;
      window.__fly.teleport({ x: w.x, y: w.y, z: w.z + 5 });
    });
    await expect(page.locator('.toast', { hasText: `Arrived: ${label}` })).toBeVisible();
    expect(await page.evaluate(() => window.__fly.game.waypoint)).toBeNull();
    await expect(wp.locator('.wp-label')).toBeHidden();
  });

  test('[R-MAP] the map tools stay above markers, so Zoom out over a stop zooms out @touch', async ({ page }) => {
    await boot(page);
    const [id] = await trail(page);
    await page.evaluate(() => window.__fly.game.panels.open('map'));
    for (let i = 0; i < 14; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('.map-scale')).toHaveText(/^(10|20) m$/);
    const wrap = (await page.locator('.map-wrap').boundingBox())!;
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    const tool = (await zoomOut.boundingBox())!;
    const scale = 3;
    await page.evaluate(
      ({ id, dx, dz }) => {
        const g = window.__fly.game;
        const q = g.activities.position(g.activities.defs.get(id)!);
        window.__fly.teleport({ x: q.x - dx, y: g.flight.pos.y, z: q.z - dz });
      },
      { id, dx: (tool.x + tool.width / 2 - wrap.x - wrap.width / 2) / scale, dz: (tool.y + tool.height / 2 - wrap.y - wrap.height / 2) / scale },
    );
    await page.getByRole('button', { name: 'Center on my drone' }).click();
    const marker = page.locator(`.map-marker[data-activity="${id}"]`);
    await expect
      .poll(async () => {
        const m = await marker.boundingBox();
        return m ? Math.hypot(m.x + m.width / 2 - tool.x - tool.width / 2, m.y + m.height / 2 - tool.y - tool.height / 2) : Infinity;
      })
      .toBeLessThan(tool.width / 2);
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), { x: tool.x + tool.width / 2, y: tool.y + tool.height / 2 });
    expect(top).toBe('Zoom out');
    const before = await page.locator('.map-scale').textContent();
    await zoomOut.click();
    await expect(page.locator('.map-scale')).not.toHaveText(before!);
    await expect(page.locator('.map-card')).toBeHidden();
  });

  test('[R-MAP] panning a zoomed-in map only blits cached tiles', async ({ page }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      const w = window as unknown as { cost: number[] };
      w.cost = [];
      window.requestAnimationFrame = (f) =>
        raf((t) => {
          const a = performance.now();
          f(t);
          w.cost.push(performance.now() - a);
        });
    });
    await boot(page);
    const cost = await page.evaluate(async () => {
      const w = window as unknown as { cost: number[] };
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      window.__fly.game.panels.open('map');
      for (let i = 0; i < 90; i++) await frame();
      const wrap = document.querySelector('.map-wrap') as HTMLElement;
      const per: number[] = [];
      for (const key of ['-', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', '+', '+', 'ArrowUp', 'ArrowUp', 'ArrowUp']) {
        wrap.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        w.cost = [];
        await frame();
        await frame();
        per.push(Math.max(...w.cost));
      }
      return per.sort((a, b) => a - b);
    });
    expect(cost[Math.floor(cost.length / 2)]).toBeLessThan(20);
    expect(cost[cost.length - 1]).toBeLessThan(200);
  });

  test('[R-MAP] the minimap opens the map and can be switched off', async ({ page }) => {
    await boot(page);
    const mini = page.locator('.minimap');
    await expect(mini).toBeVisible();
    await mini.click();
    await expect(page.locator('.sheet[data-panel="map"]')).toBeVisible();
    await page.locator('.chip', { hasText: 'Minimap' }).click();
    await page.keyboard.press('Escape');
    await expect(mini).toBeHidden();
    expect(await page.evaluate(() => window.__fly.game.save.data.settings.minimap)).toBe(false);
  });
});

test('[R-WAYPOINT] [R-V2-MAP-TRAIL] the compass shows nearby things to do only with side activities on, and the menu suggests the nearest', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__fly.step(0.1));
  await frames(page, 45);
  await expect(page.locator('.compass-pip:not([hidden])')).toHaveCount(0);
  await page.evaluate(() => {
    window.__fly.game.save.data.settings.sideActivities = true;
    window.__fly.step(0.1);
  });
  await expect(page.locator('.compass-pip:not([hidden])').first()).toBeVisible();
  await page.evaluate(() => window.__fly.game.panels.open('menu'));
  const first = page.locator('.menu-next-item').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-activity');
  await first.click();
  await expect(page.locator('.sheet')).toBeHidden();
  const label = await page.evaluate((a) => window.__fly.game.activities.defs.get(a!)!.title, id);
  expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBe(label);
});

test.describe('founder trail map', () => {
  test('[R-V2-MAP-OPEN] on the full city the map opens and paints on its first frame, right after load', async ({ page }) => {
    await page.goto('./?test');
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 150_000 });
    const r = await page.evaluate(async () => {
      const t0 = performance.now();
      window.__fly.game.panels.open('map');
      const open = performance.now() - t0;
      for (let i = 0; i < 2; i++) await new Promise((f) => requestAnimationFrame(f));
      const c = document.querySelector('.map-canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      return { open, colors: colors.size };
    });
    expect(r.open).toBeLessThan(250);
    expect(r.colors).toBeGreaterThan(12);
  });

  test('[R-V2-MAP-TRAIL] the map numbers every trail stop, highlights the objective, frames them all, and adds side activities only when switched on', async ({ page }) => {
    await boot(page);
    const ids = await trail(page);
    await page.evaluate((first) => window.__fly.game.save.complete(first), ids[0]);
    await page.keyboard.press('KeyM');
    await page.evaluate(() => window.__fly.step(1 / 30));
    await expect(page.locator('.map-wrap')).toBeVisible();
    const markers = page.locator('.map-marker');
    expect(await markers.evaluateAll((n) => n.map((b) => (b as HTMLElement).dataset.activity!).sort())).toEqual([...ids].sort());
    expect(await markers.evaluateAll((n, all) => all.map((id) => n.find((b) => (b as HTMLElement).dataset.activity === id)!.textContent), ids)).toEqual(ids.map((_, i) => String(i + 1)));
    await expect(page.locator('.map-marker.goal')).toHaveCount(1);
    await expect(page.locator('.map-marker.goal')).toHaveAttribute('data-activity', ids[1]);
    await expect(page.locator(`.map-marker[data-activity="${ids[0]}"]`)).toHaveClass(/done/);
    const title = await page.evaluate((id) => window.__fly.game.activities.defs.get(id)!.title, ids[1]);
    await expect(page.locator('.map-goal')).toContainText(title);
    await expect(page.locator('.map-goal')).toContainText(`Stop 2 of ${ids.length}`);
    await expect(page.locator('.map-me')).toBeVisible();
    const inside = () =>
      markers.evaluateAll((n) => {
        const w = document.querySelector('.map-wrap')!.getBoundingClientRect();
        return n.filter((b) => {
          const r = b.getBoundingClientRect();
          return b.checkVisibility() && r.left >= w.left && r.right <= w.right && r.top >= w.top && r.bottom <= w.bottom;
        }).length;
      });
    await expect.poll(inside).toBe(ids.length);
    await page.keyboard.press('Escape');
    const side = await page.evaluate(() => {
      const g = window.__fly.game;
      g.save.data.settings.sideActivities = true;
      g.panels.open('map');
      return g.activities.list().filter((d) => d.kind !== 'trail' && d.kind !== 'achievement' && (!d.hidden || g.save.isDone(d.id))).length;
    });
    expect(side).toBeGreaterThan(0);
    await expect(markers).toHaveCount(ids.length + side);
  });

  test('[R-V2-MAP-WARP] Warp on the objective bar and on any trail stop card emits warp with the stop position and name', async ({ page }) => {
    await boot(page);
    const ids = await trail(page);
    const target = (id: string) =>
      page.evaluate((id) => {
        const g = window.__fly.game;
        const d = g.activities.defs.get(id)!;
        const q = g.activities.position(d);
        return { x: q.x, z: q.z, label: d.title };
      }, id);
    await page.evaluate(() => {
      const w = window as unknown as { warps: unknown[] };
      w.warps = [];
      window.__fly.game.bus.on('warp', (e) => w.warps.push(e));
      window.__fly.game.panels.open('map');
    });
    await page.locator('.map-goal').getByRole('button', { name: /^Warp to / }).click();
    await expect(page.locator('.sheet')).toBeHidden();
    const last = ids[ids.length - 1];
    await page.evaluate(() => window.__fly.game.panels.open('map'));
    await page.locator(`.map-marker[data-activity="${last}"]`).dispatchEvent('click');
    const card = page.locator('.map-card');
    await expect(card).toHaveAttribute('data-activity', last);
    await expect(card.getByRole('button', { name: /^Warp to / })).toBeFocused();
    await card.getByRole('button', { name: /^Warp to / }).click();
    await expect(page.locator('.sheet')).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { warps: unknown[] }).warps)).toEqual([await target(ids[0]), await target(last)]);
  });
});
