import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers';

const pub = (p: string) => join(ROOT, 'public', p);
const pngSize = (p: string) => {
  const b = readFileSync(pub(p));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

describe('progressive web app', () => {
  const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'));

  it('[R-PWA] manifest is complete and every icon exists at its declared size', () => {
    expect(manifest).toMatchObject({ name: 'Fly Around SF', short_name: expect.any(String), start_url: './', scope: './', display: expect.stringMatching(/fullscreen|standalone/) });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    const sizes = new Set<string>();
    for (const icon of manifest.icons) {
      expect(existsSync(pub(icon.src)), icon.src).toBe(true);
      if (icon.type !== 'image/png') continue;
      const png = pngSize(icon.src);
      expect(`${png.width}x${png.height}`).toBe(icon.sizes);
      sizes.add(`${icon.sizes} ${icon.purpose}`);
    }
    expect(sizes).toEqual(new Set(['192x192 any', '512x512 any', '512x512 maskable']));
    expect(pngSize('icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });

  it('[R-PWA] index links the manifest and the service worker caches the shell and data with a version', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="./manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    const sw = readFileSync(pub('sw.js'), 'utf8');
    expect(sw).toMatch(/const VERSION = `fly-sf-\$\{new URL\(self\.location\.href\)\.searchParams\.get\('v'\)/);
    for (const f of ['./index.html', './manifest.webmanifest', './data/terrain.bin', './data/city.bin']) expect(sw).toContain(`'${f}'`);
    expect(sw).toContain('caches.delete');
  });
});
