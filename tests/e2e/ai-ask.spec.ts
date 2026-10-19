import type { Page, Route } from '@playwright/test';
import { test, expect, boot } from './fixtures';
import { FIXTURE_CARDS } from '../unit/ai-fixtures';
import type { CardDef } from '../../src/content/types';

const PROXY = 'https://ask.fly.test/';

async function setup(page: Page, cards: CardDef[] | null = FIXTURE_CARDS, proxy = '') {
  const errors = await boot(page);
  await page.evaluate(
    ([cards, proxy]) => {
      const g = window.__fly.game;
      (g.panels.get('ask') as unknown as { cards: unknown }).cards = cards;
      g.save.data.settings.aiProxyUrl = proxy;
      const p = g.world.point({ lat: 37.8, lon: -122.418, alt: 60 });
      window.__fly.teleport(p, 0);
      window.__fly.step(0.1);
    },
    [cards, proxy] as const,
  );
  return errors;
}

async function openAsk(page: Page) {
  await page.keyboard.press('Slash');
  await page.evaluate(() => window.__fly.step(0.05));
  await expect(page.locator('.sheet[data-panel="ask"]')).toBeVisible();
}

async function askQuestion(page: Page, q: string) {
  await page.locator('.ask-input').first().fill(q);
  await page.locator('.ask-input').first().press('Enter');
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };

test.describe('Ask the City', () => {
  test('[R-AI-PROXY] [R-AI-ASK] answers offline from card lore with no proxy configured', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r.url());
    });
    const errors = await setup(page);
    await openAsk(page);
    await expect(page.locator('.ask-input').first()).toBeFocused();
    await expect(page.locator('.ask-mode')).toContainText('Archive mode · 3 lore cards, ');
    await expect(page.locator('.ask-chip').first()).toBeVisible();
    await askQuestion(page, 'Who paid for the tower on Telegraph Hill?');
    const x = page.locator('.ask-x').first();
    await expect(x).toHaveAttribute('data-mode', 'offline');
    await expect(x.locator('.ask-entry strong')).toHaveText('Coit Tower');
    await expect(x.locator('.ask-quote')).toContainText('Lillie Hitchcock Coit');
    await expect(x.locator('.ask-badge')).toHaveText('Archive');
    await expect(page.locator('.ask-input').first()).toHaveValue('');
    await x.locator('.ask-sources summary').click();
    await expect(x.locator('.ask-sources a')).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Coit_Tower');
    await askQuestion(page, 'When did the bridge open?');
    await expect(page.locator('.ask-x').first().locator('.ask-quote')).toContainText('1937');
    await expect(page.locator('.ask-x')).toHaveCount(2);
    expect(posts).toEqual([]);
    expect(await page.evaluate(() => document.querySelector('.sheet')!.textContent!.includes('\u2014'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('[R-AI-PROXY] uses the live proxy when aiProxyUrl is set', async ({ page }) => {
    const bodies: { question: string; context: { name: string }[] }[] = [];
    await page.route(`${PROXY}**`, async (route: Route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'Ah, Coit Tower! Lillie Hitchcock Coit left the city the money for it.', model: 'claude-opus-5-5' }) });
    });
    await setup(page, FIXTURE_CARDS, PROXY);
    await openAsk(page);
    await expect(page.locator('.ask-mode')).toContainText('Live guide on');
    await askQuestion(page, 'Tell me about Coit Tower');
    const x = page.locator('.ask-x').first();
    await expect(x).toHaveAttribute('data-mode', 'live');
    await expect(x.locator('.ask-live')).toContainText('Lillie Hitchcock Coit left the city');
    await expect(x.locator('.ask-badge')).toHaveText('Live guide');
    await expect(x.locator('.ask-entry strong')).toHaveText('Coit Tower');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].question).toBe('Tell me about Coit Tower');
    expect(bodies[0].context[0].name).toBe('Coit Tower');
  });

  test('[R-AI-PROXY] a live answer that lands while the panel was closed shows when it reopens', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`${PROXY}**`, async (route: Route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      await held;
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'Ah, the Golden Gate! It opened in 1937.' }) });
    });
    await setup(page, FIXTURE_CARDS, PROXY);
    await openAsk(page);
    await askQuestion(page, 'When did the bridge open?');
    await expect(page.locator('.ask-x').first()).toHaveAttribute('data-mode', 'pending');
    await page.evaluate(() => {
      const g = window.__fly.game;
      g.panels.close();
      g.panels.open('ask');
    });
    await expect(page.locator('.ask-x').first()).toHaveAttribute('data-mode', 'pending');
    release();
    const x = page.locator('.ask-x').first();
    await expect(x).toHaveAttribute('data-mode', 'live');
    await expect(x.locator('.ask-live')).toHaveText('Ah, the Golden Gate! It opened in 1937.');
    await expect(page.locator('.ask-shimmer')).toHaveCount(0);
  });

  test('[R-AI-PROXY] falls back to the offline archive when the proxy returns 500', async ({ page }) => {
    let calls = 0;
    await page.route(`${PROXY}**`, async (route: Route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      calls++;
      await route.fulfill({ status: 500, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'upstream_error', message: 'Upstream error 500.' }) });
    });
    const errors = await setup(page, FIXTURE_CARDS, PROXY);
    await openAsk(page);
    await askQuestion(page, 'How tall is the Transamerica Pyramid?');
    const x = page.locator('.ask-x').first();
    await expect(x).toHaveAttribute('data-mode', 'fallback');
    await expect(x.locator('.ask-badge')).toContainText('live guide unreachable');
    await expect(x.locator('.ask-quote')).toContainText('853 feet');
    expect(calls).toBe(1);
    expect(errors.filter((e) => !/500/.test(e))).toEqual([]);
  });

  test('[R-AI-WHAT] What is that? names the landmark ahead and sets a waypoint to it', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      const from = g.world.toLocal(37.8, -122.418);
      const to = g.world.toLocal(37.8024, -122.4058);
      const p = g.world.point({ lat: 37.8, lon: -122.418, alt: 60 });
      window.__fly.teleport(p, Math.atan2(-(to.x - from.x), -(to.z - from.z)));
      window.__fly.step(0.1);
    });
    await page.waitForTimeout(300);
    await openAsk(page);
    await page.locator('[data-ask="look"]').click();
    const x = page.locator('.ask-x').first();
    await expect(x.locator('.ask-q')).toContainText('Coit Tower');
    await expect(x.locator('.ask-q')).toContainText('ahead');
    await expect(x.locator('.ask-lead')).toHaveText('That is Coit Tower.');
    await x.locator('[data-ask="go"]').click();
    await expect(page.locator('.sheet')).toBeHidden();
    const wp = await page.evaluate(() => window.__fly.game.waypoint);
    expect(wp?.label).toBe('Coit Tower');
  });

  test('[R-AI-WHAT] a typed "what is that" uses the camera like the button does', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      const from = g.world.toLocal(37.8, -122.418);
      const to = g.world.toLocal(37.7952, -122.4028);
      window.__fly.teleport(g.world.point({ lat: 37.8, lon: -122.418, alt: 60 }), Math.atan2(-(to.x - from.x), -(to.z - from.z)));
      window.__fly.step(0.1);
    });
    await page.waitForTimeout(300);
    await openAsk(page);
    await askQuestion(page, 'what is that over there');
    const x = page.locator('.ask-x').first();
    await expect(x.locator('.ask-q')).toContainText('You pointed at Transamerica Pyramid');
    await expect(x.locator('.ask-lead')).toHaveText('That is Transamerica Pyramid.');
    await expect(page.locator('.ask-input').first()).toHaveValue('');
  });

  test('[R-AI-WHAT] facing away it says where the closest place is', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      const sea = g.world.toLocal(37.765, -122.53);
      window.__fly.teleport({ x: sea.x, y: 80, z: sea.z }, Math.PI / 2);
      window.__fly.step(0.1);
    });
    await page.waitForTimeout(300);
    await openAsk(page);
    await page.locator('[data-ask="look"]').click();
    const lead = page.locator('.ask-x').first().locator('.ask-lead');
    await expect(lead).toContainText('Nothing I know is straight ahead. The closest is');
    await expect(lead).toContainText('Golden Gate Bridge, 7.6 km to your right.');
  });

  test('[R-AI-ASK] Open in Dex opens the collection on that card', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const g = window.__fly.game;
      g.panels.register([{ id: 'dex', title: 'Dex', icon: 'D', render: (root: HTMLElement) => void (root.textContent = 'dex') }]);
      (window as unknown as { shown: string[] }).shown = [];
      g.bus.on('dex:show', ({ id }) => (window as unknown as { shown: string[] }).shown.push(id));
    });
    await openAsk(page);
    await askQuestion(page, 'Who designed the Transamerica Pyramid?');
    await page.locator('.ask-x').first().locator('[data-ask="dex"]').click();
    await expect(page.locator('.sheet[data-panel="dex"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { shown: string[] }).shown)).toEqual(['transamerica-pyramid']);
  });

  test('[R-AI-ASK] with zero cards it still answers from discovered places and admits gaps', async ({ page }) => {
    const errors = await setup(page, []);
    await openAsk(page);
    await askQuestion(page, 'Golden Gate Bridge');
    const x = page.locator('.ask-x').first();
    await expect(x.locator('.ask-entry strong')).toHaveText('Golden Gate Bridge');
    await expect(x.locator('.ask-tag')).toHaveText('place');
    await expect(x.locator('.ask-lead')).toHaveText('Here is what the map knows:');
    await expect(page.locator('.ask-mode')).toContainText('0 lore cards, ');
    await expect(x.locator('[data-ask="dex"]')).toHaveCount(0);
    await askQuestion(page, 'best ramen recipe');
    await expect(page.locator('.ask-x').first().locator('.ask-quote')).toContainText('Nothing in the archive');
    await page.locator('.ask-x').first().locator('.ask-related .ask-chip').first().click();
    await expect(page.locator('.ask-x')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('[R-AI-ASK] panel fits touch screens with no horizontal overflow @touch', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__fly.game.panels.open('ask'));
    const look = page.locator('[data-ask="look"]');
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await look.tap();
    else await look.click();
    await askQuestion(page, 'Why is the bridge orange?');
    await expect(page.locator('.ask-x')).toHaveCount(2);
    const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, sheet: document.querySelector('.sheet-body')!.scrollWidth - document.querySelector('.sheet-body')!.clientWidth }));
    expect(r.doc).toBeLessThanOrEqual(0);
    expect(r.sheet).toBeLessThanOrEqual(0);
    const h = await page.locator('[data-ask="look"]').boundingBox();
    expect(h!.height).toBeGreaterThanOrEqual(40);
  });
});
