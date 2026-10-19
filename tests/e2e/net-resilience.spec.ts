import { test, expect, boot } from './fixtures';

test('[R-NET-OFFLINE] unreachable relays are reported and single player keeps working', async ({ page }) => {
  test.setTimeout(180_000);
  await page.routeWebSocket(/.*/, (ws) => ws.close({ code: 1011, reason: 'offline' }));
  const errors = await boot(page, 'room=QXRK7');
  await page.evaluate(() => window.__fly.step(0.05));
  await expect(page.locator('.net-chip')).toContainText('QXRK7');
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__fly.step(0.05));
        return page.evaluate(() => window.__fly.game.net.status);
      },
      { timeout: 30_000 },
    )
    .toBe('unreachable');
  await expect(page.locator('.net-banner')).toContainText('Single player keeps working');
  await expect(page.locator('.net-chip')).toContainText('offline');
  await page.evaluate(() => window.__fly.game.panels.open('friends'));
  await expect(page.locator('.fr-room .fr-status')).toContainText('Cannot reach the matchmaking relays');
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => window.__fly.state().pos);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__fly.step(2));
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__fly.state().pos);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(30);
  expect(await page.evaluate(() => window.__fly.solve('rings-marina-warmup'))).toEqual({ ok: true });
  expect(await page.evaluate(() => window.__fly.errors)).toEqual([]);
  expect(errors.filter((e) => !/favicon|WebSocket/i.test(e))).toEqual([]);
});

test('[R-NET-OFFLINE] if the multiplayer code cannot load, the game says so and keeps flying', async ({ page }) => {
  await page.route(/\/assets\/p2p-[^/]+\.js$/, (r) => r.abort());
  await boot(page, 'room=QXRK8');
  await expect
    .poll(async () => {
      await page.evaluate(() => window.__fly.step(0.05));
      return page.evaluate(() => window.__fly.game.net.status);
    })
    .toBe('unreachable');
  await expect(page.locator('.toast', { hasText: 'Multiplayer could not start' })).toBeVisible();
  expect(await page.evaluate(() => window.__fly.game.net.room)).toBeNull();
  await page.evaluate(() => window.__fly.step(1));
  expect(await page.evaluate(() => window.__fly.errors)).toEqual([]);
});

test('[R-NET-SAFE] a hostile peer cannot inject markup, spoof matches or flood the room', async ({ page }) => {
  await boot(page, 'net=local&room=SAFE2');
  const result = await page.evaluate(async () => {
    const net = window.__fly.game.net;
    const ch = new BroadcastChannel('fly-around-sf:room-SAFE2');
    const post = (d: unknown) => ch.postMessage(JSON.stringify({ k: 'msg', from: 'evil', d }));
    ch.postMessage(JSON.stringify({ k: 'hello', from: 'evil' }));
    post({ t: 'hi', name: '<img src=x onerror="window.__owned=1">', color: 'url(javascript:alert(1))' });
    for (let i = 0; i < 40; i++) post({ t: 'chat', text: `<b>flood ${i}</b>` });
    post({ t: 'start', id: 'x', mode: 'tag', roster: ['evil', 'someone'], duration: 60, role: 'evil' });
    post({ t: 'st', p: [1e9, 1e9, -1e9], v: [1e9, 0, 0], y: 99 });
    await new Promise((r) => setTimeout(r, 400));
    window.__fly.step(0.2);
    const peer = net.visiblePeers()[0];
    ch.close();
    return { name: peer?.name, color: peer?.color, chats: net.chat.length, match: net.match, pos: peer?.sample?.p, imgs: document.querySelectorAll('.net-hud img, .net-tags img').length };
  });
  expect(result.name).toBe('<img src=x onerror="');
  expect(result.color).toBe('#f2f2ee');
  expect(result.chats).toBeLessThanOrEqual(4);
  expect(result.chats).toBeGreaterThan(0);
  expect(result.match).toBeNull();
  expect(result.pos).toEqual({ x: 40000, y: 3000, z: -40000 });
  expect(result.imgs).toBe(0);
  await expect(page.locator('.net-feed li').first()).toContainText('<b>flood 0</b>');
  expect(await page.evaluate(() => (window as unknown as { __owned?: number }).__owned)).toBeUndefined();
});

test.describe('touch @touch', () => {
  test('[R-NET-TOUCH] friends panel and hold-to-talk fit a touch screen @touch', async ({ page }) => {
    await boot(page, 'net=local&room=TAP22');
    await page.evaluate(() => window.__fly.game.panels.open('friends'));
    await expect(page.locator('.fr-roomcode').first()).toHaveText('TAP22');
    await page.locator('[data-action="voice-on"]').click();
    await expect.poll(() => page.evaluate(() => window.__fly.game.net.voice.on)).toBe(true);
    const fit = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet-body') as HTMLElement;
      const coarse = matchMedia('(pointer: coarse)').matches;
      const small = [...document.querySelectorAll<HTMLElement>('.friends button')].filter((b) => coarse && b.offsetParent && Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width) < 40).map((b) => b.textContent || b.getAttribute('aria-label'));
      return { page: document.documentElement.scrollWidth - window.innerWidth, sheet: sheet.scrollWidth - sheet.clientWidth, small };
    });
    expect(fit.page).toBeLessThanOrEqual(0);
    expect(fit.sheet).toBeLessThanOrEqual(0);
    expect(fit.small).toEqual([]);
    await page.evaluate(() => window.__fly.game.panels.close());
    await page.evaluate(() => window.__fly.step(0.05));
    const talk = page.locator('.net-voice');
    await expect(talk).toHaveText(/^🎙 Hold (T )?to talk$/);
    const box = await talk.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    await talk.dispatchEvent('pointerdown');
    await page.evaluate(() => window.__fly.step(0.05));
    expect(await page.evaluate(() => window.__fly.game.net.voice.transmitting)).toBe(true);
    await expect(talk).toHaveText('🎙 Talking');
    await talk.dispatchEvent('pointerup');
    await page.evaluate(() => window.__fly.step(0.05));
    expect(await page.evaluate(() => window.__fly.game.net.voice.transmitting)).toBe(false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('[R-NET-SAFE] peers that recolor or leave free their drone models on the GPU', async ({ page }) => {
  await boot(page, 'net=local&room=LEAKS');
  const geometries = await page.evaluate(async () => {
    const fly = window.__fly;
    const g = fly.game;
    const ch = new BroadcastChannel('fly-around-sf:room-LEAKS');
    const send = (from: string, d: unknown) => ch.postMessage(JSON.stringify({ k: 'msg', from, d }));
    const settle = async () => {
      await new Promise((r) => setTimeout(r, 100));
      fly.step(0.2);
      for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    };
    fly.teleport({ ...g.flight.pos }, 0);
    await settle();
    const count = () => g.renderer.info.memory.geometries;
    const before = count();
    const p = g.flight.pos;
    const ids = ['a', 'b', 'c'];
    for (const id of ids) ch.postMessage(JSON.stringify({ k: 'hello', from: id }));
    await settle();
    for (const [i, id] of ids.entries()) {
      send(id, { t: 'hi', name: id, color: '#ff0000' });
      send(id, { t: 'st', p: [p.x + (i - 1) * 4, p.y + 1, p.z - 20], v: [0, 0, 0], y: 0, m: 0 });
    }
    await settle();
    const joined = count();
    for (const color of ['#00ff00', '#0000ff', '#ffff00']) {
      send('a', { t: 'hi', name: 'a', color });
      await settle();
    }
    const recolored = count();
    for (const id of ids) ch.postMessage(JSON.stringify({ k: 'bye', from: id }));
    await settle();
    ch.close();
    return { before, joined, recolored, after: count() };
  });
  expect(geometries.joined).toBeGreaterThan(geometries.before);
  expect(geometries.recolored).toBe(geometries.joined);
  expect(geometries.after).toBe(geometries.before);
});
