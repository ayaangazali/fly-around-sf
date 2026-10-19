import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:4173/?test&quality=medium');
await page.waitForFunction(() => window.__fly?.ready, undefined, { timeout: 120000 });
const views = [
  ['spawn', null],
  ['downtown', [37.7985, -122.388, 2.4, 180]],
  ['goldengate', [37.8075, -122.4655, 0.9, 120]],
  ['twinpeaks', [37.7544, -122.4477, -2.2, 120]],
];
for (const [name, v] of views) {
  if (v) await page.evaluate(([lat, lon, yaw, alt]) => { const g = window.__fly.game; const p = g.world.point({ lat, lon, alt }); window.__fly.teleport(p, yaw); window.__fly.step(0.2); }, v);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
