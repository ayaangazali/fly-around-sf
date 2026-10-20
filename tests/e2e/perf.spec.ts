import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { test, expect, boot, LITE } from './fixtures';

const dist = (file: string) => new URL(`../../dist/${file}`, import.meta.url);
const gates = JSON.parse(readFileSync(new URL('../../requirements.json', import.meta.url), 'utf8')).gates as { max_initial_js_gzip_kb: number };

function stubDraws(): void {
  const gl = WebGL2RenderingContext.prototype as unknown as Record<string, unknown>;
  for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) gl[k] = () => undefined;
}

test.describe('performance', () => {
  test('[R-PERF] the entry chunk and its static imports stay under the initial JS gzip budget', () => {
    const manifest = JSON.parse(readFileSync(dist('.vite/manifest.json'), 'utf8')) as Record<string, { file: string; isEntry?: boolean; imports?: string[] }>;
    const initial = new Set<string>();
    const walk = (key: string) => {
      if (initial.has(key)) return;
      initial.add(key);
      for (const k of manifest[key].imports ?? []) walk(k);
    };
    for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) walk(key);
    const files = [...initial].map((k) => manifest[k].file).filter((f) => f.endsWith('.js'));
    const kb = files.reduce((sum, f) => sum + gzipSync(readFileSync(dist(f))).length, 0) / 1000;
    test.info().annotations.push({ type: 'initial js', description: `${kb.toFixed(1)} KB gzip in ${files.length} files` });
    expect(files.length).toBeGreaterThan(0);
    expect(kb).toBeLessThan(gates.max_initial_js_gzip_kb);
  });

  test('[R-PERF] the city is ready within 30 seconds, with activity content fetched alongside the city data', async ({ page }) => {
    await boot(page);
    const seconds = (await page.evaluate(() => performance.now())) / 1000;
    test.info().annotations.push({ type: `city ready${LITE ? ' (lite)' : ''}`, description: `${seconds.toFixed(1)} s` });
    expect(seconds).toBeLessThan(LITE ? 30 : 60);
    const manifest = JSON.parse(readFileSync(dist('.vite/manifest.json'), 'utf8')) as Record<string, { file: string }>;
    const content = Object.entries(manifest).filter(([key]) => key.startsWith('src/content/activities/')).map(([, chunk]) => chunk.file.split('/').pop());
    const timing = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((r) => ({ file: r.name.split('/').pop(), start: r.startTime, end: r.responseEnd })));
    const city = timing.find((r) => r.file === 'city.bin')!;
    expect(content.length).toBeGreaterThan(0);
    for (const file of content) expect(timing.find((r) => r.file === file)?.start, file).toBeLessThan(city.end);
  });

  test('[R-PERF-SHADERS] every shader in the loaded scene compiles before ready, so new views by day and night link no programs in flight', async ({ page }) => {
    await page.route('**/data/transit.json', (r) => r.abort());
    await boot(page);
    const added = await page.evaluate(async () => {
      const g = window.__fly.game;
      const before = g.renderer.info.programs!.length;
      for (const [lat, lon, yaw, alt, mode] of [[37.7985, -122.388, 2.4, 180, 'noon'], [37.799, -122.383, 1.9, 200, 'night'], [37.7694, -122.4862, 1, 60, 'night']] as const) {
        g.save.data.settings.timeMode = mode;
        window.__fly.teleport(g.world.point({ lat, lon, alt }), yaw);
        window.__fly.step(0.2);
        for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      }
      return g.renderer.info.programs!.length - before;
    });
    expect(added).toBe(0);
  });

  test('[R-V2-PERF-GOVERNOR] slow frames make auto quality drop shadows, view distance and pixel ratio without linking new shaders', async ({ page }) => {
    await page.addInitScript(stubDraws);
    await boot(page, 'quality=auto');
    const r = await page.evaluate(async () => {
      const g = window.__fly.game;
      const read = () => ({ rung: g.governor!.rung, ratio: g.renderer.getPixelRatio(), shadows: g.renderer.shadowMap.enabled, intensity: g.sky.sun.shadow.intensity, far: g.camera.far, fog: g.sky.fog.far, programs: g.renderer.info.programs!.length });
      const before = read();
      let slow = true;
      const spin = () => {
        if (!slow) return;
        requestAnimationFrame(spin);
        const end = performance.now() + 45;
        while (performance.now() < end);
      };
      requestAnimationFrame(spin);
      const t0 = performance.now();
      while (g.governor!.rung < 3 && performance.now() - t0 < 20_000) await new Promise((done) => setTimeout(done, 200));
      slow = false;
      for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
      return { before, after: read() };
    });
    expect(r.before).toMatchObject({ rung: 0, shadows: true, intensity: 1, far: 14000 });
    expect(r.after).toMatchObject({ rung: 3, shadows: false, intensity: 0, far: 4000 });
    expect(r.after.ratio).toBeLessThan(r.before.ratio);
    expect(r.after.fog).toBeLessThan(4000);
    expect(r.after.programs).toBe(r.before.programs);
  });

});

