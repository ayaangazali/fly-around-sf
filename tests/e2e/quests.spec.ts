import { test, expect, boot } from './fixtures';

const MINE = ['quest', 'riddle', 'scavenger', 'daily'];

test.describe('quests', () => {
  test('[R-QUEST] [R-RIDDLE] [R-SCAVENGER] [R-DAILY] every quest activity can be won by the solver in the browser', async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page);
    const r = await page.evaluate(async (kinds) => {
      const list = window.__fly.activities().filter((a) => kinds.includes(a.kind));
      const failures: string[] = [];
      for (const a of list) {
        window.__fly.reset();
        const res = await window.__fly.solve(a.id);
        if (!res.ok) failures.push(`${a.id}: ${res.error}`);
      }
      const counts = Object.fromEntries(kinds.map((k) => [k, list.filter((a) => a.kind === k).length]));
      return { failures, counts };
    }, MINE);
    expect(r.failures).toEqual([]);
    expect(r.counts).toMatchObject({ quest: 12, daily: 1 });
    expect(r.counts.riddle).toBeGreaterThanOrEqual(36);
    expect(r.counts.scavenger).toBeGreaterThanOrEqual(14);
  });

  test('[R-QUEST] chapters unlock one at a time and finish in story order', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const g = window.__fly.game;
      const order: string[] = [];
      g.bus.on('activity:complete', (e) => e.id.startsWith('quest-') && order.push(e.id));
      const lockedBefore = g.activities.start('quest-git-blame');
      await window.__fly.solve('quest-force-push');
      return { lockedBefore, order, waypoint: g.waypoint?.label ?? null, cards: window.__fly.state().cards };
    });
    expect(r.lockedBefore).toBe(false);
    expect(r.order).toEqual([
      'quest-initial-commit', 'quest-git-blame', 'quest-buried-fleet', 'quest-imperial-decree', 'quest-semaphore', 'quest-escape-velocity',
      'quest-pulling-cable', 'quest-five-twelve', 'quest-golden-hydrant', 'quest-be-in', 'quest-edge-of-the-map', 'quest-force-push',
    ]);
    expect(r.cards).toContain('quest-norton-bridge');
  });

  test('[R-QUEST] [R-RIDDLE] [R-SCAVENGER] [R-DAILY] every chapter, riddle and hunt starts by flying to its beacon and pressing F', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page);
    const wrong = await page.evaluate((kinds) => {
      const g = window.__fly.game;
      const out: string[] = [];
      for (const a of window.__fly.activities().filter((x) => kinds.includes(x.kind))) {
        window.__fly.reset();
        document.querySelector<HTMLButtonElement>('.qd-skip')?.click();
        const unlock = (id: string) => {
          for (const r of g.activities.defs.get(id)?.requires ?? []) {
            unlock(r);
            g.save.complete(r, 0);
          }
        };
        unlock(a.id);
        g.teleport(g.activities.position(g.activities.defs.get(a.id)!));
        window.__fly.step(0.1);
        g.input.press('interact');
        window.__fly.step(1 / 30);
        const active = window.__fly.state().active;
        if (active !== a.id) out.push(`${a.id} started ${active}`);
      }
      return out;
    }, MINE);
    expect(wrong).toEqual([]);

    await page.evaluate(() => {
      window.__fly.reset();
      document.querySelector<HTMLButtonElement>('.qd-skip')?.click();
      const g = window.__fly.game;
      g.save.complete('quest-initial-commit', 0);
      g.teleport(g.activities.position(g.activities.defs.get('quest-git-blame')!));
      window.__fly.step(0.1);
    });
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.__fly.step(0.05));
    expect(await page.evaluate(() => window.__fly.state().active)).toBe('quest-git-blame');
  });

  test('[R-DIALOGUE] while the Emperor is talking, F reads on instead of starting the activity next to you', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
      await window.__fly.solve('quest-initial-commit');
      const g = window.__fly.game;
      g.teleport(g.activities.position(g.activities.defs.get('riddle-movie-palace')!));
      window.__fly.step(0.1);
    });
    await expect(page.locator('.qd')).toBeVisible();
    expect(await page.evaluate(() => window.__fly.game.activities.nearby?.id)).toBe('riddle-movie-palace');
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.__fly.step(0.05));
    expect(await page.evaluate(() => window.__fly.state().active)).toBeNull();
    await page.locator('.qd-skip').click();
    await expect(page.locator('.qd')).toBeHidden();
    await page.evaluate(() => window.__fly.step(0.05));
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.__fly.step(0.05));
    expect(await page.evaluate(() => window.__fly.state().active)).toBe('riddle-movie-palace');
  });

  test('[R-DIALOGUE] the Emperor speaks with a portrait, typewriter text, F to advance, click and skip', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      g.teleport(g.activities.position(g.activities.defs.get('quest-initial-commit')!));
      window.__fly.step(0.1);
    });
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.__fly.step(0.05));
    const card = page.locator('.qd');
    await expect(card).toBeVisible();
    await expect(page.locator('.qd-portrait svg')).toBeVisible();
    await expect(page.locator('.qd-who')).toHaveText('Emperor Norton');
    await expect(page.locator('.qd-count')).toHaveText('1/4');
    const full = await page.locator('.qd-text .sr-only').textContent();
    expect(full).toContain('Halt, citizen!');
    expect((await page.locator('.qd-typed').textContent())!.length).toBeLessThan(full!.length);
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.__fly.step(0.05));
    await expect(page.locator('.qd-typed')).toHaveText(full!);
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.__fly.step(0.05));
    await expect(page.locator('.qd-count')).toHaveText('2/4');
    for (let i = 0; i < 3 && (await page.locator('.qd-count').textContent()) !== '3/4'; i++) await page.locator('.qd-text').click();
    await expect(page.locator('.qd-count')).toHaveText('3/4');
    await page.locator('.qd-skip').click();
    await expect(card).toBeHidden();
    await expect(page.locator('.qt')).toBeVisible();
    await expect(page.locator('.qt-text')).toHaveText('Fly to the rotunda of the Palace of Fine Arts.');
    const beacon = await page.evaluate(() => window.__fly.game.scene.getObjectByName('quest-markers')!.children.filter((c) => c.visible).length);
    expect(beacon).toBe(1);
  });

  test('[R-QUESTLOG] the quest log shows the story so far, the current objective and sets a waypoint', async ({ page }) => {
    await boot(page);
    await page.locator('.menubar-btn[data-panel="quests"]').click();
    await expect(page.locator('.sheet[data-panel="quests"] .ql-hero h3')).toHaveText('The Lost Commit');
    await expect(page.locator('.ql-chapter.current strong')).toHaveText('Initial Commit');
    await page.locator('.ql-chapter.current .ql-btn').click();
    await expect(page.locator('.sheet')).toBeHidden();
    const beacon = await page.evaluate(() => {
      const g = window.__fly.game;
      window.__fly.step(0.05);
      const w = g.waypoint!;
      const shown = g.scene.getObjectByName('quest-markers')!.children.filter((c) => c.visible);
      return { label: w.label, count: shown.length, off: Math.hypot(shown[0].position.x - w.x, shown[0].position.z - w.z) };
    });
    expect(beacon).toEqual({ label: 'Chapter 1: Initial Commit', count: 1, off: 0 });

    await page.evaluate(async () => {
      await window.__fly.solve('quest-initial-commit');
      document.querySelector<HTMLButtonElement>('.qd-skip')?.click();
      const g = window.__fly.game;
      g.teleport(g.activities.position(g.activities.defs.get('quest-git-blame')!));
      window.__fly.step(0.1);
      g.activities.start('quest-git-blame');
    });
    await expect(page.locator('.qt')).toBeVisible();
    await page.keyboard.press('KeyL');
    await page.evaluate(() => window.__fly.step(0.05));
    await expect(page.locator('.sheet[data-panel="quests"]')).toBeVisible();
    await expect(page.locator('.qt')).toBeHidden();
    await expect(page.locator('.ql-progress span').first()).toHaveText('1 of 12 chapters restored');
    await expect(page.locator('.ql-objectives .now')).toContainText('cannonballs could skip');
    await page.locator('.ql-chapter.done summary').click();
    await expect(page.locator('.ql-chapter.done .ql-story p').first()).toContainText('Halt, citizen!');
    await page.locator('.ql-tab[data-tab="riddles"]').click();
    await expect(page.locator('.ql-item')).toHaveCount(await page.evaluate(() => window.__fly.activities().filter((a) => a.kind === 'riddle').length));
    await page.locator('.ql-item .ql-btn').first().click();
    expect(await page.evaluate(() => window.__fly.game.waypoint?.label)).toBeTruthy();
    await expect(page.locator('.qt')).toBeVisible();
  });

  test('[R-DAILY] the daily decree starts from the log and copies a shareable result', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await boot(page);
    await page.evaluate(() => window.__fly.game.panels.open('quests'));
    await page.locator('.ql-tab[data-tab="daily"]').click();
    await expect(page.locator('.ql-daily h3')).toHaveText('Daily Decree #1');
    await page.locator('.ql-daily .ql-btn.primary').click();
    expect(await page.evaluate(() => window.__fly.state().active)).toBe('daily-clue');
    await expect(page.locator('.qt-title')).toHaveText('Daily Decree #1');
    await page.evaluate(() => window.__fly.solve('daily-clue'));
    await page.evaluate(() => window.__fly.game.panels.open('quests'));
    await page.locator('.ql-tab[data-tab="daily"]').click();
    await expect(page.locator('.ql-share')).toContainText('Fly Around SF · Daily Decree #1 · 2026-10-19');
    await page.locator('.ql-daily .ql-btn.primary').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Daily Decree #1');
  });

  test('[R-SCAVENGER] every hunt note floats in open air, never inside a landmark', async ({ page }) => {
    await boot(page);
    const buried = await page.evaluate(() => {
      const g = window.__fly.game;
      return window.__fly
        .activities()
        .filter((a) => a.kind === 'scavenger')
        .flatMap((a) => {
          const def = g.activities.defs.get(a.id)!;
          const notes = (def.params as { tokens: { name?: string }[] }).tokens;
          const points = g.activities.kindOf(def).solve(def, g).flatMap((s) => ('teleport' in s ? [s.teleport] : []));
          return points.flatMap((q, i) => (g.world.collide({ ...q }, 0.05) ? [`${a.id}: ${notes[i].name ?? i}`] : []));
        });
    });
    expect(buried).toEqual([]);
  });

  test('[R-SCAVENGER] a hunt pulses warmer as you close in and shows the note only up close', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const d = g.activities.defs.get('scavenger-north-beach')!;
      g.teleport(g.activities.position(d));
      window.__fly.step(0.1);
      g.activities.start(d.id);
      const p = g.world.point((d.params as { tokens: { lat: number; lon: number }[] }).tokens[0], 4);
      const visible = () => g.scene.getObjectByName('quest-markers')!.children.filter((c) => c.visible).length;
      g.teleport({ x: p.x - 500, y: p.y + 40, z: p.z });
      window.__fly.step(1);
      const far = visible();
      g.teleport({ x: p.x - 300, y: p.y + 40, z: p.z });
      window.__fly.step(1);
      const trend = g.activities.active?.inst.hud();
      g.teleport({ x: p.x - 30, y: p.y + 10, z: p.z });
      window.__fly.step(0.1);
      return { far, trend, near: visible() };
    });
    expect(r.far).toBe(0);
    expect(r.trend).toContain('warmer');
    expect(r.near).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.qt-heat')).toBeVisible();
    await expect(page.locator('.qt-heat span')).not.toHaveText('');
  });
});

test('[R-QUESTLOG] the quest log and dialogue fit on touch screens @touch', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const g = window.__fly.game;
    g.teleport(g.activities.position(g.activities.defs.get('quest-initial-commit')!));
    window.__fly.step(0.1);
    g.activities.start('quest-initial-commit');
  });
  await expect(page.locator('.qd')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.locator('.menubar-btn[data-panel="quests"]').click();
  await expect(page.locator('.sheet[data-panel="quests"]')).toBeVisible();
  await expect(page.locator('.qd')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const heights = await page.locator('.ql-tab, .ql-btn').evaluateAll((els) => els.map((e) => (e as HTMLElement).offsetHeight));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
});

test('[R-QUESTLOG] the objective tracker stays out of the way on small screens and expands on tap @touch', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const g = window.__fly.game;
    g.teleport(g.activities.position(g.activities.defs.get('riddle-movie-palace')!));
    window.__fly.step(0.1);
    g.activities.start('riddle-movie-palace');
    window.__fly.step(121, 0.25);
  });
  await page.locator('.qd-skip').click();
  const tracker = page.locator('.qt');
  await expect(tracker).toBeVisible();
  const narrow = page.viewportSize()!.width <= 640;
  const before = (await tracker.boundingBox())!.height;
  if (narrow) {
    await expect(page.locator('.qt-hint')).toBeHidden();
    expect(before).toBeLessThan(110);
  }
  await tracker.click();
  await expect(tracker).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.qt-hint')).toBeVisible();
  await expect(page.locator('.qt-hint')).toContainText('between Market and 18th');
  if (narrow) expect((await tracker.boundingBox())!.height).toBeGreaterThan(before);
  await page.evaluate(() => window.__fly.game.panels.open('quests'));
  await expect(tracker).toBeHidden();
  await page.evaluate(() => window.__fly.game.panels.close());
  await expect(tracker).toBeVisible();
  expect(await page.evaluate(() => window.__fly.state().active)).toBe('riddle-movie-palace');
});
