import { test, expect, boot } from './fixtures';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync(new URL('../../src/content/github-snapshot.json', import.meta.url), 'utf8')) as { towers: unknown[] };

async function solveAll(page: Page, prefix: string) {
  return page.evaluate(async (prefix) => {
    const failures: string[] = [];
    const ids = window.__fly.activities().filter((a) => a.id.startsWith(prefix)).map((a) => a.id);
    for (const id of ids) {
      window.__fly.reset();
      const r = await window.__fly.solve(id);
      if (!r.ok) failures.push(`${id}: ${r.error}`);
    }
    return { count: ids.length, failures };
  }, prefix);
}

async function startPitch(page: Page, id: string) {
  await page.evaluate((id) => {
    const g = window.__fly.game;
    const def = g.activities.defs.get(id)!;
    window.__fly.reset();
    for (const r of def.requires ?? []) g.save.complete(r);
    window.__fly.teleport(g.activities.position(def));
    window.__fly.step(0.1);
  }, id);
  await page.keyboard.press('KeyF');
  await page.evaluate((id) => {
    window.__fly.step(0.1);
    const g = window.__fly.game;
    const pad = g.world.point({ ...g.activities.defs.get(id)!.at, alt: 0 });
    window.__fly.teleport({ x: pad.x, y: pad.y + 2, z: pad.z });
    window.__fly.step(1);
  }, id);
}

const bestAnswers = (page: Page, id: string) =>
  page.evaluate((id) => (window.__fly.game.activities.defs.get(id)!.params as { rounds: { best: number }[] }).rounds.map((r) => r.best), id);

test.describe('SF tech layer', () => {
  test('[R-TECH-CARDS] every tech discovery completes and awards its card in the browser', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page);
    const ids = ['y-combinator', 'github', 'internet-archive', 'openai', 'anthropic', 'twitter', 'dogpatch-labs'];
    const res = await page.evaluate(async (ids) => {
      const out: string[] = [];
      for (const id of ids) {
        window.__fly.reset();
        const r = await window.__fly.solve(`discover-${id}`);
        if (!r.ok || !window.__fly.state().cards.includes(id)) out.push(id);
      }
      return out;
    }, ids);
    expect(res).toEqual([]);
    const all = await solveAll(page, 'discover-');
    expect(all.failures).toEqual([]);
    expect(all.count).toBeGreaterThanOrEqual(59);
  });

  test('[R-TECH-PITCH] every pitch is won by the solver in the browser', async ({ page }) => {
    test.setTimeout(400_000);
    await boot(page);
    const r = await solveAll(page, 'pitch-');
    expect(r.failures).toEqual([]);
    expect(r.count).toBeGreaterThanOrEqual(12);
  });

  test('[R-TECH-PITCH] keyboard pitch at YC: land, answer with number keys, sign the term sheet', async ({ page }) => {
    const errors = await boot(page);
    await startPitch(page, 'pitch-y-combinator');
    const box = page.locator('.pitch');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Y Combinator');
    await expect(box).toContainText('How big can this get?');
    await expect(page.locator('.pitch-option')).toHaveCount(3);
    for (const [i, best] of (await bestAnswers(page, 'pitch-y-combinator')).entries()) {
      await page.keyboard.press(`Digit${best + 1}`);
      await page.evaluate(() => window.__fly.step(0.1));
      await expect(page.locator('.pitch-option.right')).toHaveCount(1);
      await expect(page.locator('.pitch-reply.ok')).toBeVisible();
      await expect(page.locator('.pitch-pip.ok')).toHaveCount(i + 1);
      await page.evaluate(() => window.__fly.step(2));
    }
    await expect(page.locator('.term-sheet:not(.pass)')).toContainText('Term Sheet');
    await expect(page.locator('.term-stamp')).toBeVisible();
    await page.evaluate(() => window.__fly.step(4));
    const s = await page.evaluate(() => window.__fly.state());
    expect(s.completed).toContain('pitch-y-combinator');
    expect(s.active).toBeNull();
    await expect(box).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('[R-TECH-PITCH] an open menu freezes the round clock and swallows number keys', async ({ page }) => {
    await boot(page);
    await startPitch(page, 'pitch-greylock');
    await page.evaluate(() => window.__fly.game.panels.open('menu'));
    const before = await page.evaluate(() => (window.__fly.game.activities.active!.inst as unknown as { timeLeft(): number }).timeLeft());
    await page.keyboard.press('Digit1');
    await page.evaluate(() => window.__fly.step(30));
    const held = await page.evaluate(() => {
      const inst = window.__fly.game.activities.active!.inst as unknown as { timeLeft(): number; chosen(): number; phase(): string };
      return { left: inst.timeLeft(), chosen: inst.chosen(), phase: inst.phase() };
    });
    expect(held).toEqual({ left: before, chosen: -1, phase: 'ask' });
    await page.evaluate(() => window.__fly.game.panels.close());
    await page.keyboard.press('Digit1');
    await page.evaluate(() => window.__fly.step(0.1));
    await expect(page.locator('.pitch-option[data-option="0"]:disabled')).toHaveCount(1);
  });

  test('[R-TECH-PITCH] clicking wrong answers ends in a polite pass and no completion', async ({ page }) => {
    await boot(page);
    await startPitch(page, 'pitch-a16z');
    for (const best of await bestAnswers(page, 'pitch-a16z')) {
      await page.locator(`.pitch-option[data-option="${(best + 1) % 3}"]`).click();
      await page.evaluate(() => window.__fly.step(0.1));
      await expect(page.locator('.pitch-option.wrong')).toHaveCount(1);
      await page.evaluate(() => window.__fly.step(2));
    }
    await expect(page.locator('.term-sheet.pass')).toContainText('We are going to pass');
    await page.evaluate(() => window.__fly.step(4));
    expect((await page.evaluate(() => window.__fly.state())).completed).not.toContain('pitch-a16z');
  });

  test('[R-TECH-PITCH] @touch tapping answers works and the pitch card fits the screen', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'needs a touch screen');
    await boot(page);
    await startPitch(page, 'pitch-founders-inc');
    const vw = await page.evaluate(() => window.innerWidth);
    const card = await page.locator('.pitch').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(vw + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const best of await bestAnswers(page, 'pitch-founders-inc')) {
      await page.locator(`.pitch-option[data-option="${best}"]`).tap();
      await page.evaluate(() => window.__fly.step(2.1));
    }
    await expect(page.locator('.term-sheet:not(.pass)')).toBeVisible();
    await page.evaluate(() => window.__fly.step(4));
    expect((await page.evaluate(() => window.__fly.state())).completed).toContain('pitch-founders-inc');
  });

  test('[R-TECH-HACK] every hackathon is won by the solver, with hackers on the venue roofs', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page);
    const crew = await page.evaluate(() => {
      const g = window.__fly.game;
      const root = g.scene.getObjectByName('hackers')!;
      const venues = window.__fly.activities().filter((a) => a.kind === 'hack').length;
      const sprites = root.children.filter((c) => c.name.startsWith('hacker-'));
      const onRoof = sprites.every((s) => Math.abs(s.position.y - 1.15 - g.world.groundAt(s.position.x, s.position.z)) < 0.5);
      return { venues, sprites: sprites.length, onRoof };
    });
    expect(crew.sprites).toBeGreaterThanOrEqual(crew.venues * 3);
    expect(crew.onRoof).toBe(true);
    const r = await solveAll(page, 'hack-');
    expect(r.failures).toEqual([]);
    expect(r.count).toBeGreaterThanOrEqual(16);
  });

  test('[R-TECH-HACK] flying through glowing commits in a live hack pushes them and the clock can run out', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      window.__fly.reset();
      g.save.complete('discover-noisebridge');
      window.__fly.teleport(g.activities.position(g.activities.defs.get('hack-noisebridge')!));
      window.__fly.step(0.1);
      g.activities.start('hack-noisebridge');
      window.__fly.step(0.1);
      const orbs = () => g.scene.getObjectByName('hackers')!.children.filter((c) => c.name.startsWith('commit-') && c.visible).length;
      const before = orbs();
      const inst = g.activities.active!.inst as unknown as { commits: { p: { x: number; y: number; z: number } }[] };
      window.__fly.teleport(inst.commits[0].p);
      window.__fly.step(1);
      const after = orbs();
      const hud = g.activities.active!.inst.hud();
      window.__fly.step(70);
      return { before, after, hud, active: g.activities.active?.def.id ?? null, done: g.save.isDone('hack-noisebridge') };
    });
    expect(r.before).toBe(6);
    expect(r.after).toBe(5);
    expect(r.hud).toContain('commits 1/6');
    expect(r.active).toBeNull();
    expect(r.done).toBe(false);
  });

  test('[R-COMMIT-TOWERS] towers, labels and fireflies render from the baked snapshot with no GitHub calls', async ({ page }) => {
    const github: string[] = [];
    await page.route(/github(usercontent)?\.com/, (route) => {
      github.push(route.request().url());
      return route.abort();
    });
    const errors = await boot(page, 'time=2026-10-19T06:30:00Z');
    const info = await page.evaluate(() => {
      const g = window.__fly.game;
      const root = g.scene.getObjectByName('commit-towers')!;
      const mesh = root.getObjectByName('commit-tower-mesh') as unknown as { count: number };
      const labels = root.children.filter((c) => c.name.startsWith('tower-label-')).length;
      const flies = (root.getObjectByName('commit-fireflies') as unknown as { geometry: { attributes: { position: { count: number } } } }).geometry.attributes.position.count;
      const p = g.world.point({ lat: 37.7838, lon: -122.3842, alt: 220 });
      window.__fly.teleport(p, 2.2);
      window.__fly.step(0.5);
      return { count: mesh.count, labels, flies, night: g.sky.night };
    });
    expect(info.count).toBe(snapshot.towers.length);
    expect(info.labels).toBe(snapshot.towers.length);
    expect(info.flies).toBeGreaterThan(200);
    expect(info.night).toBeGreaterThan(0.9);
    await page.waitForTimeout(800);
    const shown = await page.evaluate(() => {
      const g = window.__fly.game;
      window.__fly.step(1 / 30);
      const { width, height } = g.renderer.domElement;
      const f = height / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
      return g.scene.getObjectByName('commit-towers')!.children
        .filter((c) => c.name.startsWith('tower-label-') && c.visible)
        .map((l) => {
          const d = l.position.distanceTo(g.camera.position);
          const p = l.position.clone().project(g.camera);
          return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height, w: (l.scale.x * f) / d / 2, h: (l.scale.y * f) / d / 2 };
        });
    });
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(snapshot.towers.length);
    for (const [i, a] of shown.entries()) for (const b of shown.slice(i + 1)) expect(Math.abs(a.x - b.x) < a.w + b.w && Math.abs(a.y - b.y) < a.h + b.h).toBe(false);
    expect((await page.screenshot()).length).toBeGreaterThan(30_000);
    expect(github).toEqual([]);
    expect(errors).toEqual([]);
  });
});
