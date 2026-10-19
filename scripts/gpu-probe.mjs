import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const VIEWS = [
  ['downtown noon', 37.7985, -122.388, 2.4, 180, 'noon', 1],
  ['downtown night', 37.799, -122.383, 1.9, 200, 'night', 1],
  ['embarcadero low', 37.8005, -122.3985, 2.4, 14, 'noon', 1],
  ['mission low night', 37.7605, -122.4195, 0, 40, 'night', 1],
  ['twin peaks noon', 37.7544, -122.4477, -2.2, 120, 'noon', 1],
  ['golden gate sunset', 37.803, -122.462, 0.35, 90, 'golden', 1],
  ['golden gate night', 37.8075, -122.4655, 0.9, 120, 'night', 1],
  ['ocean beach thick karl', 37.7605, -122.508, 1.57, 60, 'golden', 3],
  ['karl over the city', 37.78, -122.45, -1.4, 300, 'night', 1],
];

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
for (const quality of ['low', 'medium', 'high']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await page.goto(`${url}?test&quality=${quality}`);
  await page.waitForFunction(() => window.__fly?.ready, undefined, { timeout: 180_000 });
  for (const [name, lat, lon, yaw, alt, mode, fog] of VIEWS) {
    const r = await page.evaluate(
      ([lat, lon, yaw, alt, mode, fog]) => {
        const g = window.__fly.game;
        g.save.data.settings.timeMode = mode;
        g.sky.fogDensity = fog;
        window.__fly.teleport(g.world.point({ lat, lon, alt }), yaw);
        window.__fly.step(0.2);
        g.running = false;
        const gl = g.renderer.getContext();
        const px = new Uint8Array(4);
        const karlA = g.sky.sky.material.uniforms.envKarlA.value;
        const time = (karl) => {
          const update = g.sky.update;
          g.sky.update = (d, f) => {
            update.call(g.sky, d, f);
            if (!karl) karlA[0] = 0;
          };
          for (let i = 0; i < 10; i++) g.render(0);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const t0 = performance.now();
          for (let i = 0; i < 40; i++) g.render(0);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          g.sky.update = update;
          return (performance.now() - t0) / 40;
        };
        const on = Math.min(time(true), time(true));
        const info = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
        const off = Math.min(time(false), time(false));
        return { ...info, on, off, px: g.renderer.getPixelRatio() };
      },
      [lat, lon, yaw, alt, mode, fog],
    );
    console.log(`${quality.padEnd(6)} ${name.padEnd(24)} ${String(r.calls).padStart(4)} calls ${(r.tris / 1e6).toFixed(2).padStart(5)}M tris at ${r.px}x: ${r.on.toFixed(1).padStart(5)} ms a frame, ${r.off.toFixed(1).padStart(5)} ms without Karl`);
  }
  await page.close();
}
const renderer = await (await browser.newPage()).evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
});
console.log(renderer);
await browser.close();
