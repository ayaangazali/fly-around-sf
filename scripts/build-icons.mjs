import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const jobs = [
  ['icon-192.png', 192, 1, 'transparent'],
  ['icon-512.png', 512, 1, 'transparent'],
  ['maskable-512.png', 512, 0.72, '#0e141b'],
  ['apple-touch-icon.png', 180, 0.86, '#0e141b'],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, scale, bg] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}"><img src="${src}" width="${inner}" height="${inner}"></body>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: out(name), omitBackground: bg === 'transparent' });
  console.log(name, size);
}
await browser.close();
