import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, boot } from './fixtures';

const ROOM = 'TEST7TEST7TEST7T';

async function setName(page: Page, name: string, color: string): Promise<void> {
  await page.evaluate(
    ([n, c]) => {
      const g = window.__fly.game;
      g.save.data.settings.playerName = n;
      g.save.data.settings.droneColor = c;
      g.save.persist();
    },
    [name, color],
  );
}

async function step(pages: Page[], seconds: number, chunk = 0.5): Promise<void> {
  for (let t = 0; t < seconds - 1e-6; t += chunk) {
    for (const p of pages) await p.evaluate((s) => window.__fly.step(s), Math.min(chunk, seconds - t));
    await pages[0].waitForTimeout(40);
  }
}

const selfId = (p: Page) => p.evaluate(() => window.__fly.game.net.selfId);
const COUNTDOWN = 10;
const HEAD_START = 5;

async function joinFrom(p: Page): Promise<void> {
  await expect.poll(() => p.evaluate(() => !!window.__fly.game.net.match?.invited)).toBe(true);
  expect(await p.evaluate(() => window.__fly.game.net.joinMatch())).toBe(true);
}

test.describe.serial('multiplayer over the local test channel', () => {
  let ctx: BrowserContext;
  let a: Page;
  let b: Page;

  test.beforeAll(async ({ browser }, info) => {
    test.setTimeout(240_000);
    ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write', 'microphone'] });
    a = await ctx.newPage();
    b = await ctx.newPage();
    await boot(a, `net=local&room=${ROOM}`);
    await setName(a, 'Ana', '#5ec8ff');
    await boot(b, `net=local&room=${ROOM}`);
    await setName(b, 'Ben', '#ff7eb6');
    for (const p of [a, b]) await expect.poll(() => p.evaluate(() => window.__fly.game.net.visiblePeers().length)).toBe(1);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('[R-NET-SYNC] two players in the same room see each other move', async () => {
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.visiblePeers()[0]?.name)).toBe('Ana');
    await expect.poll(() => a.evaluate(() => window.__fly.game.net.visiblePeers()[0]?.name)).toBe('Ben');
    const target = await a.evaluate(() => {
      const g = window.__fly.game;
      const p = g.world.point({ lat: 37.8024, lon: -122.4058, alt: 60 });
      window.__fly.teleport(p, 1);
      window.__fly.step(0.1);
      return window.__fly.state().pos;
    });
    await expect
      .poll(async () => {
        await b.evaluate(() => window.__fly.step(0.5));
        return b.evaluate((t) => {
          const p = window.__fly.game.net.visiblePeers()[0].pos;
          return Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
        }, target);
      })
      .toBeLessThan(3);
    await a.evaluate(() => {
      const g = window.__fly.game;
      g.input.held.add('KeyW');
      window.__fly.step(1.5);
      g.input.held.clear();
    });
    const moved = await a.evaluate(() => window.__fly.state().pos);
    expect(Math.hypot(moved.x - target.x, moved.z - target.z)).toBeGreaterThan(15);
    await expect
      .poll(async () => {
        await b.evaluate(() => window.__fly.step(0.3));
        return b.evaluate((t) => {
          const p = window.__fly.game.net.visiblePeers()[0].pos;
          return Math.hypot(p.x - t.x, p.z - t.z);
        }, moved);
      })
      .toBeLessThan(3);
    const drone = await b.evaluate(() => {
      const g = window.__fly.game;
      const id = g.net.visiblePeers()[0].id;
      const root = g.scene.getObjectByName(`peer-${id}`);
      return root ? { x: root.position.x, z: root.position.z, visible: root.visible } : null;
    });
    expect(drone?.visible).toBe(true);
    expect(Math.hypot(drone!.x - moved.x, drone!.z - moved.z)).toBeLessThan(3);
    await expect(b.locator('.net-chip')).toContainText(`${ROOM.slice(0, 4)} · 1 friend`);
  });

  test('[R-NET-SYNC] remote drones wear floating name tags', async () => {
    const pos = await a.evaluate(() => window.__fly.state().pos);
    await b.evaluate((p) => {
      window.__fly.teleport({ x: p.x + 14, y: p.y + 2, z: p.z + 22 }, Math.atan2(14, 22));
      window.__fly.step(1);
    }, pos);
    const tag = b.locator('.net-tag', { hasText: 'Ana' });
    await expect(tag).toBeVisible();
    await expect(tag).toContainText(' m');
  });

  test('[R-V2-NET-FAR] a friend and their ping 4 km away keep their tags with the distance', async () => {
    const aId = await selfId(a);
    const pos = await a.evaluate(() => window.__fly.state().pos);
    await a.evaluate((p) => window.__fly.game.net.ping(p), pos);
    await b.evaluate((p) => {
      window.__fly.teleport({ x: p.x + 4000, y: p.y, z: p.z }, Math.PI / 2);
      window.__fly.step(1);
    }, pos);
    await expect.poll(() => b.evaluate((id) => window.__fly.game.net.pings.has(id), aId)).toBe(true);
    await b.bringToFront();
    await b.evaluate(() => window.__fly.step(0.1));
    await expect(b.locator('.net-tag', { hasText: 'Ana' })).toBeVisible();
    await expect(b.locator('.net-tag', { hasText: 'Ana' })).toContainText(/4\.\d km/);
    await expect(b.locator('.net-ping', { hasText: 'Ana' })).toBeVisible();
    await expect(b.locator('.net-ping', { hasText: 'Ana' })).toContainText(/4\.\d km/);
  });

  test('[R-NET-PING] a ping from one player appears for the other with a marker', async () => {
    await a.bringToFront();
    await a.keyboard.press('KeyG');
    await a.evaluate(() => window.__fly.step(0.1));
    const mine = await a.evaluate(() => {
      const g = window.__fly.game;
      return g.net.pings.get(g.net.selfId)?.p ?? null;
    });
    expect(mine).not.toBeNull();
    const aId = await selfId(a);
    await expect.poll(() => b.evaluate((id) => window.__fly.game.net.pings.get(id)?.p ?? null, aId)).toEqual(mine);
    await b.evaluate(() => window.__fly.step(0.1));
    expect(await b.evaluate((id) => !!window.__fly.game.scene.getObjectByName(`ping-${id}`), aId)).toBe(true);
    await expect(b.locator('.net-ping', { hasText: 'Ana' })).toBeAttached();
    const viaMap = await b.evaluate(() => {
      const g = window.__fly.game;
      const p = g.world.toLocal(37.7955, -122.3937);
      g.bus.emit('net:ping-request', { x: p.x, z: p.z });
      return g.net.pings.get(g.net.selfId)?.p ?? null;
    });
    const bId = await selfId(b);
    await expect.poll(() => a.evaluate((id) => window.__fly.game.net.pings.get(id)?.p ?? null, bId)).toEqual(viaMap);
  });

  test('[R-NET-CHAT] chat is delivered, capped at 140 characters and never parsed as HTML', async () => {
    await a.bringToFront();
    await a.keyboard.press('Enter');
    await a.evaluate(() => window.__fly.step(0.05));
    const input = a.locator('.net-chat input');
    await expect(input).toBeFocused();
    const evil = `<img src=x onerror="window.__pwned=1">hello ${'z'.repeat(200)}`;
    await input.fill(evil);
    await input.press('Enter');
    await expect(a.locator('.net-chat')).toBeHidden();
    const expected = evil.slice(0, 140);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.chat.at(-1)?.text ?? '')).toBe(expected);
    const line = b.locator('.net-feed li').last();
    await expect(line).toContainText('Ana');
    await expect(line).toContainText('<img src=x');
    expect(await b.locator('.net-feed img').count()).toBe(0);
    expect(await b.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    const flood = await a.evaluate(() => [1, 2, 3, 4, 5, 6].map((i) => window.__fly.game.net.sendChat(`spam ${i}`)));
    expect(flood).toContain('slow');
    expect(await a.evaluate(() => window.__fly.game.net.sendChat('   '))).toBe('empty');
  });

  test('[R-NET-MODES] an invite never interrupts a friend: no forced panel close, activity stop or teleport until they join', async () => {
    await b.evaluate(() => {
      const g = window.__fly.game;
      g.activities.start('rings-marina-warmup');
      g.panels.open('friends');
    });
    const before = await b.evaluate(() => window.__fly.state().pos);
    expect(await a.evaluate(() => window.__fly.game.net.startMatch('race', { activity: 'rings-marina-warmup' }))).toBe(true);
    await expect.poll(() => b.evaluate(() => !!window.__fly.game.net.match?.invited)).toBe(true);
    await step([b], 2);
    expect(
      await b.evaluate(() => {
        const g = window.__fly.game;
        return { open: g.panels.openId, active: g.activities.active?.def.id ?? null, playing: g.net.match?.playing };
      }),
    ).toEqual({ open: 'friends', active: 'rings-marina-warmup', playing: false });
    const after = await b.evaluate(() => window.__fly.state().pos);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(40);
    await expect(b.locator('.fr-modes [data-action="join-match"]')).toBeVisible();
    await expect(b.locator('.fr-modes .fr-note')).toContainText('Ana started Ring race');
    await b.evaluate(() => window.__fly.game.panels.close());
    await b.evaluate(() => window.__fly.step(0.05));
    await b.locator('.net-invite [data-action="skip-match"]').click();
    expect(await b.evaluate(() => window.__fly.game.net.match)).toBeNull();
    expect(await b.evaluate(() => window.__fly.game.activities.active?.def.id)).toBe('rings-marina-warmup');
    await step([a], COUNTDOWN + 0.5);
    expect(await a.evaluate(() => window.__fly.game.net.match)).toBeNull();
    await b.evaluate(() => window.__fly.game.activities.stop());
  });

  test('[R-NET-MODES] ring race: countdown, live ranking and a finish order', async () => {
    const started = await a.evaluate(() => window.__fly.game.net.startMatch('race', { activity: 'rings-marina-warmup' }));
    expect(started).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.match?.spec.mode)).toBe('race');
    await b.evaluate(() => window.__fly.step(0.05));
    await expect(b.locator('.net-invite')).toBeVisible();
    await expect(b.locator('.net-match-hint')).toContainText('Ana invites you');
    await b.locator('.net-invite [data-action="join-match"]').click();
    const joiner = await selfId(b);
    await expect.poll(() => a.evaluate((id) => !!window.__fly.game.net.match?.joined.has(id), joiner)).toBe(true);
    await step([a, b], COUNTDOWN - 2.5);
    await expect(b.locator('.net-count')).toHaveText('3');
    await step([a, b], 3);
    expect(await a.evaluate(() => window.__fly.game.net.match?.phase)).toBe('live');
    const ringsOf = (p: Page, wait: number) =>
      p.evaluate(async (w) => {
        const g = window.__fly.game;
        const def = g.activities.defs.get('rings-marina-warmup')!;
        for (const s of g.activities.kindOf(def).solve(def, g)) {
          if ('teleport' in s) window.__fly.teleport(s.teleport, s.yaw);
          window.__fly.step(w);
        }
        return g.net.match?.scores.get(g.net.selfId);
      }, wait);
    const benScore = await ringsOf(b, 0.4);
    expect(benScore?.d).toBe(true);
    const bId = await selfId(b);
    await expect
      .poll(async () => {
        await a.evaluate(() => window.__fly.step(0.1));
        return a.evaluate((id) => window.__fly.game.net.match?.scores.get(id)?.d, bId);
      })
      .toBe(true);
    await expect(a.locator('.net-match li', { hasText: 'Ben' })).toContainText(' s');
    const anaScore = await ringsOf(a, 0.7);
    expect(anaScore?.d).toBe(true);
    await expect.poll(async () => {
      await step([a, b], 0.2, 0.2);
      return [await a.evaluate(() => window.__fly.game.net.match?.phase), await b.evaluate(() => window.__fly.game.net.match?.phase)];
    }).toEqual(['done', 'done']);
    const results = await b.evaluate(() => window.__fly.game.net.match!.results!.map((r) => [r.name, r.label]));
    expect(results.map((r) => r[0])).toEqual(['Ben', 'Ana']);
    expect(results.every((r) => / s$/.test(r[1]))).toBe(true);
    await expect(b.locator('.net-match[data-phase="done"]')).toContainText('Final');
    await step([a, b], 13, 1);
    expect(await a.evaluate(() => window.__fly.game.net.match)).toBeNull();
  });

  test('[R-NET-MODES] tag: IT passes on contact and time free decides the winner', async () => {
    const aId = await selfId(a);
    const bId = await selfId(b);
    expect(await a.evaluate((id) => window.__fly.game.net.startMatch('tag', { role: id, duration: 20 }), aId)).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.match?.role)).toBe(aId);
    await joinFrom(b);
    await step([a, b], COUNTDOWN + HEAD_START + 0.5);
    const pos = await a.evaluate(() => window.__fly.state().pos);
    await b.evaluate((p) => {
      window.__fly.teleport({ x: p.x + 3, y: p.y, z: p.z + 3 });
      window.__fly.step(0.1);
    }, pos);
    await expect
      .poll(async () => {
        await a.evaluate(() => window.__fly.step(0.2));
        return a.evaluate(() => window.__fly.game.net.match?.role);
      })
      .toBe(bId);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.match?.role)).toBe(bId);
    await b.evaluate(() => {
      window.__fly.teleport({ ...window.__fly.state().pos, x: window.__fly.state().pos.x + 400 });
    });
    await step([a, b], 21, 1);
    await expect.poll(() => a.evaluate(() => window.__fly.game.net.match?.phase)).toBe('done');
    const res = await a.evaluate(() => window.__fly.game.net.match!.results!.map((r) => ({ name: r.name, score: r.score })));
    expect(res[0].name).toBe('Ana');
    expect(res[0].score).toBeGreaterThan(10);
    await step([a, b], 13, 1);
  });

  test('[R-NET-MODES] fog hide and seek: seeker is blinded, hunts in thick fog and wins by finding the hider after a long hunt', async () => {
    const aId = await selfId(a);
    const fogBefore = await a.evaluate(() => window.__fly.game.sky.fogDensity);
    expect(await a.evaluate((id) => window.__fly.game.net.startMatch('hide', { role: id, duration: 120 }), aId)).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.match?.role)).toBe(aId);
    await joinFrom(b);
    await step([a, b], COUNTDOWN + 2);
    expect(await a.evaluate(() => window.__fly.game.sky.fogDensity)).toBe(120);
    expect(await b.evaluate(() => window.__fly.game.sky.fogDensity)).toBeLessThan(10);
    await expect(a.locator('.net-tag', { hasText: 'Ben' })).toBeHidden();
    await step([a, b], 18.5);
    expect(await a.evaluate(() => window.__fly.game.net.match?.seeking)).toBe(true);
    expect(await a.evaluate(() => window.__fly.game.sky.fogDensity)).toBe(40);
    await step([a, b], 35, 1);
    const live = await a.evaluate(() => window.__fly.game.net.match!.standings().map((r) => r.name));
    expect(live[0]).toBe('Ben');
    const pos = await a.evaluate(() => window.__fly.state().pos);
    await b.evaluate((p) => {
      window.__fly.teleport({ x: p.x + 6, y: p.y, z: p.z });
      window.__fly.step(0.1);
    }, pos);
    await expect
      .poll(async () => {
        await step([a, b], 0.2, 0.2);
        return [await a.evaluate(() => window.__fly.game.net.match?.phase), await b.evaluate(() => window.__fly.game.net.match?.phase)];
      })
      .toEqual(['done', 'done']);
    expect(await a.evaluate(() => window.__fly.game.sky.fogDensity)).toBe(fogBefore);
    for (const p of [a, b]) {
      const res = await p.evaluate(() => window.__fly.game.net.match!.results!.map((r) => [r.name, r.label]));
      expect(res[0]).toEqual(['Ana', 'seeker · 1 found']);
      expect(res[1][0]).toBe('Ben');
      expect(Number(/found at (\d+) s/.exec(res[1][1])?.[1])).toBeGreaterThanOrEqual(34);
    }
    await step([a, b], 13, 1);
  });

  test('[R-NET-MODES] formation: followers score time near the leader', async () => {
    expect(await a.evaluate(() => window.__fly.game.net.startMatch('formation', { duration: 20 }))).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.match?.spec.mode)).toBe('formation');
    await joinFrom(b);
    await step([a, b], COUNTDOWN + 0.5);
    for (let i = 0; i < 10; i++) {
      const pos = await a.evaluate(() => window.__fly.state().pos);
      await b.evaluate((p) => window.__fly.teleport({ x: p.x + 8, y: p.y, z: p.z + 8 }), pos);
      await step([a, b], 1);
    }
    const ben = await b.evaluate(() => window.__fly.game.net.match!.scores.get(window.__fly.game.net.selfId)!.s);
    expect(ben).toBeGreaterThan(7);
    await step([a, b], 11, 1);
    await expect.poll(() => a.evaluate(() => window.__fly.game.net.match?.phase)).toBe('done');
    const rows = await a.evaluate(() => window.__fly.game.net.match!.results!.map((r) => r.label));
    expect(rows.some((l) => /leader · \d+ s avg/.test(l))).toBe(true);
    expect(rows.some((l) => /\d+ s in formation/.test(l))).toBe(true);
    await step([a, b], 13, 1);
  });

  test('[R-VOICE] fake microphone: one HRTF panner per peer, distance falloff and per-peer mute', async () => {
    await a.bringToFront();
    await a.evaluate(() => window.__fly.game.panels.open('friends'));
    await a.locator('[data-action="voice-on"]').click();
    await expect.poll(() => a.evaluate(() => window.__fly.game.net.voice.on)).toBe(true);
    await a.evaluate(() => window.__fly.game.panels.close());
    const pos = await a.evaluate(() => window.__fly.state().pos);
    await b.evaluate((p) => {
      window.__fly.teleport({ x: p.x + 5, y: p.y, z: p.z });
      window.__fly.step(0.2);
    }, pos);
    const read = () =>
      a.evaluate(async () => {
        window.__fly.step(0.2);
        await new Promise((r) => setTimeout(r, 250));
        const v = window.__fly.game.net.voice;
        const chains = [...v.chains.values()];
        return { n: chains.length, model: chains[0]?.panner.panningModel, gain: chains[0]?.gain.gain.value ?? -1, state: v.ctx?.state };
      });
    await expect.poll(async () => (await read()).gain, { timeout: 15_000 }).toBeGreaterThan(0.5);
    const near = await read();
    expect(near.n).toBe(1);
    expect(near.model).toBe('HRTF');
    await b.evaluate((p) => window.__fly.teleport({ x: p.x + 200, y: p.y, z: p.z }), pos);
    await expect.poll(async () => (await read()).gain, { timeout: 15_000 }).toBeLessThan(near.gain * 0.5);
    const far = await read();
    expect(far.gain).toBeGreaterThan(0);
    const bId = await selfId(b);
    await a.evaluate((id) => window.__fly.game.net.setMuted(id, true), bId);
    await expect.poll(async () => (await read()).gain, { timeout: 15_000 }).toBeLessThan(0.01);
    await a.evaluate((id) => window.__fly.game.net.setMuted(id, false), bId);
    await a.keyboard.down('KeyT');
    await a.evaluate(() => window.__fly.step(0.1));
    expect(await a.evaluate(() => window.__fly.game.net.voice.transmitting)).toBe(true);
    await expect.poll(async () => {
      await b.evaluate(() => window.__fly.step(0.1));
      return b.evaluate(() => window.__fly.game.net.visiblePeers()[0]?.mic);
    }).toBe(2);
    await a.keyboard.up('KeyT');
    await a.evaluate(() => window.__fly.step(0.1));
    expect(await a.evaluate(() => window.__fly.game.net.voice.transmitting)).toBe(false);
  });

  test('[R-SYNC-DEVICES] a sync code moves progress and the receiver merges it', async () => {
    await a.evaluate(() => {
      const s = window.__fly.game.save;
      s.data.completed = { 'discover-coit-tower': 100, 'discover-ferry-building': 200, 'not-a-real-activity': 1 };
      s.data.cards = ['coit-tower', 'not-a-real-card'];
      s.data.best = { 'rings-marina-warmup': 30 };
      s.data.xp = 500;
      s.persist();
    });
    await b.evaluate(() => {
      window.__fly.game.activities.defs.get('discover-coit-tower')!.card = 'coit-tower';
      const s = window.__fly.game.save;
      s.data.completed = { 'discover-palace-of-fine-arts': 50, 'discover-coit-tower': 300 };
      s.data.cards = ['palace-of-fine-arts'];
      s.data.best = { 'rings-marina-warmup': 25 };
      s.data.xp = 120;
      s.persist();
    });
    await a.bringToFront();
    await a.evaluate(() => window.__fly.game.panels.open('friends'));
    await a.locator('[data-action="sync-send"]').click();
    const code = (await a.locator('.fr-sync .fr-roomcode').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{4}( [A-Z2-9]{4}){3}$/);
    await b.bringToFront();
    await b.evaluate(() => window.__fly.game.panels.open('friends'));
    await b.locator('.fr-sync .fr-code-input').fill(code.toLowerCase());
    await b.locator('.fr-sync button[type="submit"]').click();
    await expect(b.locator('.fr-sync .fr-status')).toContainText('Merged: 1 new activity and 1 new card', { timeout: 20_000 });
    const merged = await b.evaluate(() => window.__fly.game.save.data);
    expect(Object.keys(merged.completed).sort()).toEqual(['discover-coit-tower', 'discover-ferry-building', 'discover-palace-of-fine-arts']);
    expect(merged.completed['discover-coit-tower']).toBe(100);
    expect(merged.cards.sort()).toEqual(['coit-tower', 'palace-of-fine-arts']);
    expect(merged.xp).toBe(500);
    expect(merged.best['rings-marina-warmup']).toBe(25);
    await expect(a.locator('.fr-sync .fr-status')).toContainText('Delivered');
    await b.locator('.fr-sync .fr-code-input').fill('O0O0');
    await b.locator('.fr-sync button[type="submit"]').click();
    await expect(b.locator('.fr-sync .fr-status')).toContainText('does not look right');
    for (const p of [a, b]) await p.evaluate(() => window.__fly.game.panels.close());
  });

  test('[R-SHARE] the share link carries the room code and opening it joins that room once the friend presses Join friends', async () => {
    await a.evaluate(() => window.__fly.game.net.leave());
    await a.bringToFront();
    await a.evaluate(() => window.__fly.game.panels.open('friends'));
    await a.locator('.fr-offline button', { hasText: 'Start a room' }).click();
    await expect(a.locator('.fr-online .fr-roomcode')).toHaveText(/^[A-Z2-9]{4}( [A-Z2-9]{4}){3}$/);
    const code = (await a.locator('.fr-online .fr-roomcode').textContent())!.replace(/ /g, '');
    await a.locator('[data-action="copy"]').click();
    await expect(a.locator('.fr-feedback')).toHaveText('Link copied');
    const link = await a.evaluate(() => navigator.clipboard.readText());
    const url = new URL(link);
    expect(url.searchParams.get('room')).toBe(code);
    expect(await a.locator('.fr-link').inputValue()).toBe(link);
    await boot(b, `${url.search.slice(1)}&title`);
    await expect(b.locator('.title-btn[data-action="join"]')).toContainText(code);
    await b.waitForTimeout(1500);
    expect(await b.evaluate(() => window.__fly.game.net.room)).toBeNull();
    expect(await a.evaluate(() => window.__fly.game.net.peers.size)).toBe(0);
    await a.evaluate(() => {
      const w = window as unknown as { toasts: string[] };
      w.toasts = [];
      window.__fly.game.bus.on('toast', ({ text }) => w.toasts.push(text));
    });
    const edit = b.locator('.title-edit');
    if (await edit.isVisible()) await edit.click();
    await b.locator('.title-name').fill('Ben');
    await b.locator('.title-btn[data-action="join"]').click();
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.room)).toBe(code);
    await expect.poll(() => b.evaluate(() => window.__fly.game.net.visiblePeers().map((p) => p.name))).toEqual(['Ana']);
    await expect.poll(() => a.evaluate(() => window.__fly.game.net.visiblePeers().map((p) => p.name))).toEqual(['Ben']);
    expect(await a.evaluate(() => (window as unknown as { toasts: string[] }).toasts.filter((t) => t.endsWith('joined the room')))).toEqual(['Ben joined the room']);
    await expect(a.locator('.fr-peer')).toHaveCount(1);
  });

  test('[R-NET-SAFE] a blocked player disappears and their messages are ignored', async () => {
    const bId = await selfId(b);
    await a.evaluate(() => window.__fly.game.panels.open('friends'));
    await a.locator(`.fr-peer[data-peer="${bId}"] [data-action="block"]`).click();
    await a.evaluate(() => window.__fly.step(0.2));
    expect(await a.evaluate((id) => !!window.__fly.game.scene.getObjectByName(`peer-${id}`), bId)).toBe(false);
    await b.evaluate(() => window.__fly.game.net.sendChat('can you hear me'));
    await a.waitForTimeout(400);
    expect(await a.evaluate(() => window.__fly.game.net.chat.some((l) => l.text === 'can you hear me'))).toBe(false);
    await a.locator(`.fr-peer[data-peer="${bId}"] [data-action="block"]`).click();
    await a.evaluate(() => window.__fly.step(0.2));
    expect(await a.evaluate((id) => !!window.__fly.game.scene.getObjectByName(`peer-${id}`), bId)).toBe(true);
  });
});
