import { test, expect, boot } from './fixtures';
import type { Page } from '@playwright/test';

const KINDS = ['photo', 'delivery', 'landing', 'collect', 'follow', 'chase', 'hover'];
const SAMPLE: Record<string, string> = {
  photo: 'photo-coit-tower-from-the-bay',
  delivery: 'delivery-ghirardelli-to-coit',
  landing: 'landing-fairmont-nob-hill',
  collect: 'collect-chinatown-fortune-cookies',
  follow: 'follow-powell-hyde-cable-car',
  chase: 'chase-pier-39-seagull',
  hover: 'hover-coit-tower-crown',
};

const press = async (page: Page, sel: string) => ((await page.evaluate(() => navigator.maxTouchPoints > 0)) ? page.locator(sel).tap() : page.locator(sel).click());

const album = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fly-around-sf:album') ?? '[]') as { title: string; stars: number; img: string }[]);

test.describe('minigames', () => {
  test('[R-MINIGAMES] the bot wins every minigame activity', async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page);
    const r = await page.evaluate(async (kinds) => {
      const failures: string[] = [];
      const list = window.__fly.activities().filter((a) => kinds.includes(a.kind) || a.id.startsWith('rings-'));
      for (const a of list) {
        window.__fly.reset();
        const res = await window.__fly.solve(a.id);
        if (!res.ok) failures.push(`${a.id}: ${res.error}`);
      }
      return { total: list.length, failures };
    }, KINDS);
    expect(r.failures).toEqual([]);
    expect(r.total).toBeGreaterThanOrEqual(133);
  });

  test('[R-MINIGAMES] [R-RESULTS] every kind can be won and lost, with a results card each time', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = await boot(page);
    for (const kind of KINDS) {
      const id = SAMPLE[kind];
      const won = await page.evaluate(async (aid) => {
        window.__fly.reset();
        const r = await window.__fly.solve(aid);
        const g = window.__fly.game;
        return { ok: r.ok, best: g.save.data.best[aid], medal: g.save.data.flags[`medal:${aid}`] };
      }, id);
      expect(won.ok, kind).toBe(true);
      expect(won.best, kind).toBeGreaterThan(0);
      expect(won.medal, kind).toBeGreaterThan(0);
      await expect(page.locator('.results.results-win'), kind).toBeVisible();
      await expect(page.locator('.results h3'), kind).not.toBeEmpty();
      await expect(page.locator('.results-stats'), kind).toContainText(kind === 'photo' ? /Best★/ : kind === 'follow' ? /Best\d+%/ : /Best\d/);
      const lost = await page.evaluate((aid) => {
        const f = window.__fly;
        const g = f.game;
        f.reset();
        const fails: string[] = [];
        const off = g.bus.on('activity:fail', (e) => fails.push(e.id));
        g.activities.start(aid);
        f.teleport({ x: g.flight.pos.x + 5000, y: 400, z: g.flight.pos.z + 5000 });
        for (let i = 0; i < 400 && g.activities.active; i++) f.step(1, 1 / 10);
        off();
        return { fails, done: g.save.isDone(aid) };
      }, id);
      expect(lost.fails, kind).toEqual([id]);
      expect(lost.done, kind).toBe(false);
      await expect(page.locator('.results.results-fail'), kind).toBeVisible();
      await expect(page.locator('.results-verdict'), kind).not.toHaveText('Try again');
    }
    expect(errors).toEqual([]);
  });

  test('[R-RESULTS] Retry restarts the activity from its start and Close dismisses the card', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
      window.__fly.reset();
      await window.__fly.solve('delivery-la-taqueria-burrito');
    });
    await expect(page.locator('.results-win .results-verdict')).toContainText('medal');
    await page.locator('.results-retry').click();
    const s = await page.evaluate(() => {
      const g = window.__fly.game;
      const p = g.activities.position(g.activities.defs.get('delivery-la-taqueria-burrito')!);
      return { active: window.__fly.state().active, d: Math.hypot(p.x - g.flight.pos.x, p.z - g.flight.pos.z) };
    });
    expect(s.active).toBe('delivery-la-taqueria-burrito');
    expect(s.d).toBeLessThan(2);
    await expect(page.locator('.results')).toBeHidden();
    await page.evaluate(() => {
      window.__fly.game.activities.stop();
      window.__fly.game.bus.emit('activity:fail', { id: 'delivery-la-taqueria-burrito', reason: 'failed' });
    });
    await expect(page.locator('.results-fail')).toBeVisible();
    await page.locator('.results-close').click();
    await expect(page.locator('.results')).toBeHidden();
  });

  test('[R-MEDALS] the results card names the medal and keeps the best one', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const f = window.__fly;
      f.reset();
      await f.solve('rings-fidi-canyon-run');
      const g = f.game;
      const first = g.save.data.flags['medal:rings-fidi-canyon-run'];
      g.save.data.flags['medal:rings-fidi-canyon-run'] = 3;
      g.activities.start('rings-fidi-canyon-run');
      for (const s of g.activities.kindOf(g.activities.defs.get('rings-fidi-canyon-run')!).solve(g.activities.defs.get('rings-fidi-canyon-run')!, g)) {
        if ('teleport' in s) {
          f.teleport(s.teleport);
          f.step(6);
        }
      }
      return { first, after: g.save.data.flags['medal:rings-fidi-canyon-run'] };
    });
    expect(r.first).toBe(3);
    expect(r.after).toBe(3);
    await expect(page.locator('.results-stats')).toContainText('Gold');
    await expect(page.locator('.results-note')).toContainText('Gold under');
  });

  test('[R-FLYABLE] no start, ring, pad, stop, collectible or hover spot sits inside a building or landmark', async ({ page }) => {
    await boot(page);
    const bad = await page.evaluate((kinds) => {
      const f = window.__fly;
      const g = f.game;
      const out: string[] = [];
      const clear = (p: { x: number; y: number; z: number }, r: number) => !g.world.collide({ ...p }, r);
      for (const d of g.activities.list()) {
        if (!kinds.includes(d.kind) && d.kind !== 'rings') continue;
        const p = (d.params ?? {}) as Record<string, any>;
        if (!clear(g.activities.position(d), 2)) out.push(`${d.id} start`);
        if (d.kind === 'rings') for (const r of p.rings) if (!clear(g.world.point({ alt: 25, ...r }), (p.radius ?? 14) * 0.6)) out.push(`${d.id} ring`);
        if (['delivery', 'hover', 'landing'].includes(d.kind)) {
          const spots = (g.activities.kindOf(d).solve(d, g) as { teleport?: { x: number; y: number; z: number } }[]).flatMap((s) => (s.teleport ? [s.teleport] : []));
          for (const s of new Set(spots)) if (!clear(s, d.kind === 'landing' ? 0.5 : 2)) out.push(`${d.id} spot`);
          if (d.kind === 'landing') {
            const s = spots[0];
            const top = s.y - 1.4;
            const flat = (x: number, z: number) => g.world.collide({ x, y: top, z }, 0.3) && !g.world.collide({ x, y: top + 0.9, z }, 0.3);
            const r = (p.padRadius ?? 5) * 0.8;
            const loaded = top - g.world.surfaceAt(s.x, s.z) > 1;
            if (loaded && ![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => flat(s.x + dx, s.z + dz))) out.push(`${d.id} pad not on a flat roof`);
          }
        }
        if (d.kind === 'collect') {
          f.reset();
          g.activities.start(d.id);
          const inst = g.activities.active!.inst as unknown as { props(): { pos: { x: number; y: number; z: number } }[] };
          inst.props().forEach((q, i) => clear(q.pos, 2) || out.push(`${d.id} item ${i}`));
          g.activities.stop();
        }
      }
      return out;
    }, KINDS);
    expect(bad).toEqual([]);
  });

  test('[R-MARKERS] beacons, rings, props and waypoint beacon render, and the guide arrow shows only when the target is off screen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const f = window.__fly;
      const g = f.game;
      f.reset();
      g.save.data.settings.sideActivities = true;
      const count = (n: string) => (g.scene.getObjectByName(n) as unknown as { geometry: { instanceCount: number } }).geometry.instanceCount;
      const def = g.activities.defs.get('rings-aquatic-park-arc')!;
      f.teleport(g.activities.position(def));
      f.step(0.6);
      const beacons = count('beacon-beams');
      g.activities.start(def.id);
      f.step(0.1);
      const rings = (g.scene.getObjectByName('ring-targets') as unknown as { count: number }).count;
      const targets = g.activities.active!.inst.targets!().length;
      const t = g.activities.active!.inst.targets!()[0];
      const arrowFacing = (yaw: number) => {
        f.teleport({ x: t.x - 200, y: t.y + 10, z: t.z }, yaw);
        f.step(0.05);
        return g.scene.getObjectByName('guide-arrow')!.visible;
      };
      const arrow = arrowFacing(Math.PI / 2);
      const arrowAhead = arrowFacing(-Math.PI / 2);
      g.activities.stop();
      g.activities.start('follow-powell-hyde-cable-car');
      f.step(0.1);
      const props = g.scene.getObjectByName('markers')!.children.filter((c) => c.userData.type === 'cable-car' && c.visible).length;
      const marker = g.scene.getObjectByName('target-marker')!.visible;
      g.activities.stop();
      f.step(0.6);
      const before = count('beacon-beams');
      g.waypoint = { ...g.activities.position(def), label: 'test' };
      f.step(0.1);
      const withWaypoint = count('beacon-beams');
      g.waypoint = null;
      return { beacons, rings, targets, arrow, arrowAhead, props, marker, before, withWaypoint };
    });
    expect(r.beacons).toBeGreaterThan(3);
    expect(r.rings).toBe(r.targets);
    expect(r.rings).toBeGreaterThan(2);
    expect(r.arrow).toBe(true);
    expect(r.arrowAhead).toBe(false);
    expect(r.props).toBe(1);
    expect(r.marker).toBe(true);
    expect(r.withWaypoint).toBe(r.before + 1);
  });

  test('[R-PHOTO] P opens the viewfinder, P shoots, the challenge scores stars and the album keeps the shot', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => {
      const f = window.__fly;
      const g = f.game;
      f.reset();
      localStorage.removeItem('fly-around-sf:album');
      const id = 'photo-ferry-building-clock';
      const def = g.activities.defs.get(id)!;
      f.teleport(g.activities.position(def));
      g.activities.start(id);
      const steps = g.activities.kindOf(def).solve(def, g) as { teleport?: { x: number; y: number; z: number }; yaw?: number; call?: (x: unknown) => void }[];
      f.teleport(steps[0].teleport!, steps[0].yaw);
      steps[1].call!(g);
      f.step(0.1);
    });
    await page.keyboard.press('KeyP');
    await page.evaluate(() => window.__fly.step(0.1));
    await expect(page.locator('.vf')).toBeVisible();
    await expect(page.locator('.vf-checks li.ok')).toHaveCount(3);
    await page.keyboard.press('KeyP');
    await page.evaluate(() => window.__fly.step(0.2));
    const state = await page.evaluate(() => window.__fly.state());
    expect(state.completed).toContain('photo-ferry-building-clock');
    const photos = await album(page);
    expect(photos).toHaveLength(1);
    expect(photos[0].title).toBe('Ferry Building Clock');
    expect(photos[0].stars).toBeGreaterThanOrEqual(2);
    expect(photos[0].img).toMatch(/^data:image\/jpeg;base64,/);
    expect(photos[0].img.length).toBeLessThan(40_000);
    await expect(page.locator('.results-win')).toContainText('★');
    await page.evaluate(() => window.__fly.game.panels.open('album'));
    await expect(page.locator('.album-item')).toHaveCount(1);
    await expect(page.locator('.album-item img')).toHaveJSProperty('complete', true);
    expect(errors).toEqual([]);
  });

  test('[R-PHOTO] a blocked or off-frame shot does not count and gives a hint', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const f = window.__fly;
      const g = f.game;
      f.reset();
      const id = 'photo-coit-tower-from-the-bay';
      g.activities.start(id);
      let hint = '';
      g.bus.on('photo:scored', (s) => void (hint = s.hint));
      f.teleport(g.activities.position(g.activities.defs.get(id)!), 0);
      g.input.press('photo');
      f.step(0.05);
      g.input.press('photo');
      f.step(0.2);
      return { hint, active: f.state().active };
    });
    expect(r.hint).toContain('out of frame');
    expect(r.active).toBe('photo-coit-tower-from-the-bay');
  });

  test('[R-PHOTO] Escape closes the viewfinder without opening the menu', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('KeyP');
    await page.evaluate(() => window.__fly.step(0.1));
    await expect(page.locator('.vf')).toBeVisible();
    await page.keyboard.down('KeyZ');
    await page.evaluate(() => window.__fly.step(0.5));
    await page.keyboard.up('KeyZ');
    await expect(page.locator('.vf-info')).not.toContainText('TILT -7°');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__fly.step(0.1));
    await expect(page.locator('.vf')).toBeHidden();
    expect(await page.evaluate(() => window.__fly.state().panel)).toBeNull();
  });

  test('[R-PHOTO] a gamepad opens the viewfinder and tilts it with the right stick', async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => {
      const pad = { connected: true, axes: [0, 0, 0, 0], buttons: [0, 1, 2].map((i) => ({ pressed: i === 2, value: i === 2 ? 1 : 0 })) };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
      window.__fly.step(0.1);
      pad.buttons[2] = { pressed: false, value: 0 };
      pad.axes[3] = -1;
      window.__fly.step(0.5);
      return document.querySelector('.vf-info')!.textContent;
    });
    await expect(page.locator('.vf')).toBeVisible();
    expect(info).toContain('TILT 16°');
  });

  test('[R-ALBUM] photos survive a reload and can be deleted', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      localStorage.removeItem('fly-around-sf:album');
      const g = window.__fly.game;
      g.input.press('photo');
      window.__fly.step(0.05);
      g.input.press('photo');
      window.__fly.step(0.05);
    });
    expect((await album(page)).length).toBe(1);
    await page.reload();
    await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
    expect((await album(page)).length).toBe(1);
    await page.evaluate(() => window.__fly.game.panels.open('album'));
    await page.locator('.album-thumb').click();
    await expect(page.locator('.album-view img')).toBeVisible();
    await page.locator('.album-del').click();
    await expect(page.locator('.album-empty')).toBeVisible();
    expect((await album(page)).length).toBe(0);
  });
});

test.describe('minigames on touch @touch', () => {
  test('[R-PHOTO] the camera button opens the viewfinder and the shutter takes a photo @touch', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => localStorage.removeItem('fly-around-sf:album'));
    await press(page, '.photo-btn');
    await expect(page.locator('.vf')).toBeVisible();
    await press(page, '.vf-shutter');
    expect((await album(page)).length).toBe(1);
    await press(page, '.vf-btn[aria-label="Close viewfinder"]');
    await expect(page.locator('.vf')).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('[R-RESULTS] the results card fits a touch screen @touch', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
      window.__fly.reset();
      await window.__fly.solve('delivery-la-taqueria-burrito');
    });
    const box = await page.locator('.results').boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    await press(page, '.results-close');
    await expect(page.locator('.results')).toBeHidden();
  });
});
