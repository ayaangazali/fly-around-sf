import { test, expect } from './fixtures';

test('[R-PWA] manifest and icons are served, the service worker registers and the game loads offline', async ({ page, context }) => {
  test.setTimeout(240_000);
  const manifest = await (await page.request.get('./manifest.webmanifest')).json();
  for (const icon of manifest.icons) {
    const res = await page.request.get(`./${icon.src}`);
    expect(res.ok(), icon.src).toBe(true);
    expect(res.headers()['content-type']).toContain(icon.type);
  }
  await page.goto('./?cityRadius=1500');
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.scriptURL ?? '';
  });
  expect(sw).toMatch(/\/sw\.js\?v=index-[\w-]+\.js$/);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const c = await caches.open(keys.find((k) => k.startsWith('fly-sf-index-'))!);
          return (await Promise.all(['./', './data/city.bin', './data/terrain.bin', './manifest.webmanifest'].map((u) => c.match(u)))).every(Boolean);
        }),
      { timeout: 120_000 },
    )
    .toBe(true);
  await expect(page.locator('.title-menu')).toBeVisible({ timeout: 120_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator('.title-menu')).toBeVisible({ timeout: 120_000 });
  const reached: string[] = [];
  await context.route('**/*', (route) => {
    reached.push(route.request().url());
    return route.abort('internetdisconnected');
  });
  await page.reload();
  await expect(page.locator('.title-menu')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.loading-error')).toBeEmpty();
  expect(reached.filter((u) => /\/(assets|data)\//.test(u))).toEqual([]);
});
