import type { Page } from '@playwright/test';
import { test, expect, boot, LITE } from './fixtures';

interface View {
  lat: number;
  lon: number;
  yaw: number;
  alt: number;
  mode?: string;
  fog?: number;
}

async function look(page: Page, v: View): Promise<void> {
  await page.evaluate(async (v) => {
    const g = window.__fly.game;
    g.save.data.settings.timeMode = v.mode ?? 'real';
    g.sky.fogDensity = v.fog ?? 1;
    window.__fly.teleport(g.world.point({ lat: v.lat, lon: v.lon, alt: v.alt }), v.yaw);
    window.__fly.step(0.2);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  }, v);
}

interface Pixels {
  data: number[];
  w: number;
  h: number;
}

async function pixels(page: Page): Promise<Pixels> {
  return page.evaluate(() => {
    const src = window.__fly.game.renderer.domElement;
    const w = 320;
    const h = Math.round((src.height / src.width) * w);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, w, h);
    return { data: Array.from(ctx.getImageData(0, 0, w, h).data), w, h };
  });
}

function stats(p: Pixels, y0 = 0, y1 = 1) {
  let n = 0;
  let sum = 0;
  let sq = 0;
  let warm = 0;
  let green = 0;
  let blue = 0;
  let bright = 0;
  for (let y = Math.floor(p.h * y0); y < Math.floor(p.h * y1); y++) {
    for (let x = 0; x < p.w; x++) {
      const o = (y * p.w + x) * 4;
      const [r, g, b] = [p.data[o], p.data[o + 1], p.data[o + 2]];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++;
      sum += l;
      sq += l * l;
      if (r > 170 && r > b + 50 && g > 90) warm++;
      if (g > r + 8 && g > b + 8) green++;
      if (b > r + 15 && b >= g - 5) blue++;
      if (l > 120) bright++;
    }
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(sq / n - mean * mean), warm: warm / n, green: green / n, blue: blue / n, bright: bright / n };
}

const env = (page: Page) =>
  page.evaluate(() => {
    const e = (window.__fly.game.systems.find((s) => s.id === 'env') as unknown as { env: { stats(): Record<string, number> } }).env;
    return e.stats();
  });

test.describe('world environment', () => {
  test('[R-ENV-STREETS] street ribbons drape on the terrain and street lights glow at night', async ({ page }) => {
    const errors = await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const roads = g.scene.getObjectByName('env:roads')!;
      let off = 0;
      let verts = 0;
      for (const m of roads.children as import('three').Mesh[]) {
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i += 97) {
          const y = p.getY(i);
          const h = g.world.terrain.meshHeightAt(p.getX(i), p.getZ(i), 3);
          off = Math.max(off, Math.abs(y - h - 0.5));
          verts++;
        }
      }
      const lamps = g.scene.getObjectByName('env:lamps') as import('three').Points;
      return { tiles: roads.children.length, verts, off, lamps: lamps.geometry.getAttribute('position').count };
    });
    expect(r.tiles).toBeGreaterThan(30);
    expect(r.verts).toBeGreaterThan(2000);
    expect(r.off).toBeLessThan(0.35);
    expect(r.lamps).toBeGreaterThan(40000);
    await look(page, { lat: 37.7605, lon: -122.4195, yaw: 0, alt: 120, mode: 'night' });
    expect(await page.evaluate(() => (window.__fly.game.scene.getObjectByName('env:lamps') as import('three').Points).visible)).toBe(true);
    const night = stats(await pixels(page), 0.4, 1);
    await look(page, { lat: 37.7605, lon: -122.4195, yaw: 0, alt: 120, mode: 'noon' });
    expect(await page.evaluate(() => window.__fly.game.scene.getObjectByName('env:lamps')!.visible)).toBe(false);
    expect(night.warm).toBeGreaterThan(0.002);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test('[R-ENV-GREEN] parks are green and real trees stand on Dolores Street', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const trees = g.scene.getObjectByName('env:trees')!;
      let instances = 0;
      let palmsOnDolores = 0;
      const a = g.world.toLocal(37.769, -122.4272);
      const b = g.world.toLocal(37.748, -122.4232);
      const m4 = new (g.camera.matrix.constructor as typeof import('three').Matrix4)();
      for (const mesh of trees.children as import('three').InstancedMesh[]) {
        instances += mesh.count;
        if (mesh.userData.kind !== 3) continue;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m4);
          const x = m4.elements[12];
          const z = m4.elements[14];
          if (x > a.x && x < b.x && z > a.z && z < b.z) palmsOnDolores++;
        }
      }
      const terrain = g.world.root.getObjectByName('terrain') as import('three').Mesh;
      return { instances, palmsOnDolores, patched: typeof (terrain.material as import('three').Material).onBeforeCompile === 'function' && (terrain.material as import('three').Material).onBeforeCompile.toString().includes('uCover') };
    });
    expect(r.instances).toBeGreaterThan(30000);
    expect(r.palmsOnDolores).toBeGreaterThan(20);
    expect(r.patched).toBe(true);
    await look(page, { lat: 37.7655, lon: -122.4545, yaw: 1.57, alt: 260, mode: 'noon' });
    const park = stats(await pixels(page), 0.45, 1);
    expect(park.green).toBeGreaterThan(0.15);
  });

  test('[R-ENV-WATER] the bay is blue, shimmers with time and reflects the sky', async ({ page }) => {
    await boot(page);
    const shader = await page.evaluate(() => {
      const w = window.__fly.game.world.root.getObjectByName('water') as import('three').Mesh;
      return (w.material as import('three').Material).onBeforeCompile.toString();
    });
    expect(shader).toContain('uDepth');
    await look(page, { lat: 37.8105, lon: -122.425, yaw: 0, alt: 60, mode: 'noon' });
    const a = await pixels(page);
    expect(stats(a, 0.55, 1).blue).toBeGreaterThan(0.5);
    await page.evaluate(async () => {
      window.__fly.step(3);
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    });
    const b = await pixels(page);
    let diff = 0;
    for (let i = Math.floor(a.data.length * 0.6); i < a.data.length; i += 4) diff += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    expect(diff / (a.data.length * 0.1)).toBeGreaterThan(0.5);
  });

  test('[R-ENV-SKY] distant fog meets the sky without a seam at every time of day, and night brings stars and the moon', async ({ page }) => {
    await boot(page);
    for (const mode of ['noon', 'golden', 'night']) {
      await look(page, { lat: 37.722, lon: -122.36, yaw: -2.356, alt: 400, mode });
      const seam = await page.evaluate(() => {
        const g = window.__fly.game;
        const cam = g.camera;
        const flat = cam.getWorldDirection(cam.position.clone()).setY(0).normalize();
        const c = g.renderer.domElement;
        const gl = g.renderer.getContext();
        g.render(0);
        const at = (k: number) => {
          const p = cam.position.clone().addScaledVector(flat, cam.far * k).setY(0).project(cam);
          const o = new Uint8Array(4);
          gl.readPixels(Math.round(((p.x + 1) / 2) * c.width), Math.round(((p.y + 1) / 2) * c.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o);
          return Array.from(o.slice(0, 3));
        };
        return { sea: at(0.95), sky: at(1.1), fogged: g.sky.fog.far < cam.far * 0.95 };
      });
      expect(seam.fogged).toBe(true);
      for (let c = 0; c < 3; c++) expect(Math.abs(seam.sky[c] - seam.sea[c]), `${mode} channel ${c}`).toBeLessThan(6);
    }
    await page.evaluate(() => (window.__fly.game.clockOffset = -86400000));
    await look(page, { lat: 37.81, lon: -122.42, yaw: 0, alt: 120, mode: 'night' });
    const moon = await page.evaluate(() => {
      const g = window.__fly.game;
      const d = g.sky.moonDir;
      window.__fly.teleport(g.flight.pos, Math.atan2(-d.x, -d.z));
      window.__fly.step(0.1);
      g.render(0);
      const cam = g.camera;
      const p = cam.position.clone().addScaledVector(d, 1000).project(cam);
      const c = g.renderer.domElement;
      const x = Math.round(((p.x + 1) / 2) * c.width);
      const y = Math.round(((1 - p.y) / 2) * c.height);
      const gl = g.renderer.getContext();
      const lum = (x: number, y: number) => {
        const o = new Uint8Array(4);
        gl.readPixels(x, c.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o);
        return 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
      };
      const ring = [0, 1, 2, 3].map((k) => lum(x + Math.round(30 * Math.cos(k * 1.57)), y + Math.round(30 * Math.sin(k * 1.57))));
      return { x, y, w: c.width, h: c.height, disk: lum(x, y), ring: Math.max(...ring), alt: d.y, stars: g.sky.stars.visible ? g.sky.stars.geometry.getAttribute('aStar').count : 0, night: g.sky.night };
    });
    expect(moon.alt).toBeGreaterThan(0.1);
    expect(moon.x).toBeGreaterThan(40);
    expect(moon.x).toBeLessThan(moon.w - 40);
    expect(moon.y).toBeGreaterThan(40);
    expect(moon.y).toBeLessThan(moon.h - 40);
    expect(moon.disk).toBeGreaterThan(moon.ring + 60);
    expect(moon.stars).toBeGreaterThan(1500);
    expect(moon.night).toBe(1);
    const sky = stats(await pixels(page), 0.05, 0.3);
    expect(sky.mean).toBeLessThan(60);
  });

  test('[R-ENV-TIME] timeMode drives the sky clock without touching the shared clock controls', async ({ page }) => {
    await boot(page);
    const at = (mode: string) =>
      page.evaluate((mode) => {
        const g = window.__fly.game;
        g.save.data.settings.timeMode = mode;
        window.__fly.step(0.1);
        g.render(0);
        return { night: g.sky.night, elev: g.sky.elevation, offset: g.clockOffset, scale: g.timeScale, lag: g.date().getTime() - g.clock().getTime() };
      }, mode);
    await page.evaluate(() => {
      window.__fly.game.clockOffset = 3 * 86400000;
      window.__fly.game.timeScale = 60;
    });
    const night = await at('night');
    expect(night.night).toBe(1);
    expect(night.elev).toBeLessThan(-18);
    const noon = await at('noon');
    expect(noon.night).toBe(0);
    expect(noon.elev).toBeGreaterThan(40);
    const golden = await at('golden');
    expect(golden.elev).toBeGreaterThan(4.5);
    expect(golden.elev).toBeLessThan(6.5);
    for (const r of [night, noon, golden]) {
      expect(r.offset).toBe(3 * 86400000);
      expect(r.scale).toBe(60);
      expect(Math.abs(r.lag)).toBeLessThan(86400000);
    }
    const held = await page.evaluate(() => {
      const g = window.__fly.game;
      const a = g.date().getTime();
      window.__fly.step(5);
      return g.date().getTime() - a;
    });
    expect(held).toBe(0);
    const real = await at('real');
    expect(real.offset).toBe(3 * 86400000);
    expect(real.lag).toBe(0);
    const flowing = await page.evaluate(() => {
      const g = window.__fly.game;
      const a = g.date().getTime();
      window.__fly.step(5);
      return g.date().getTime() - a;
    });
    expect(flowing).toBeGreaterThan(5 * 60 * 1000 * 0.95);
  });

  test('[R-ENV-FOG] thick Karl at Ocean Beach cuts visibility and washes out the view', async ({ page }) => {
    await boot(page);
    const view = { lat: 37.7605, lon: -122.508, yaw: 1.57, alt: 60, mode: 'golden' };
    await look(page, { ...view, fog: 1 });
    const clear = await page.evaluate(() => {
      const e = (window.__fly.game.systems.find((s) => s.id === 'env') as unknown as { env: { visibility(): number } }).env;
      return { vis: e.visibility(), karl: window.__fly.game.sky.karl };
    });
    const a = stats(await pixels(page), 0.35, 0.9);
    await look(page, { ...view, fog: 3 });
    const thick = await page.evaluate(() => {
      const e = (window.__fly.game.systems.find((s) => s.id === 'env') as unknown as { env: { visibility(): number } }).env;
      return { vis: e.visibility(), karl: window.__fly.game.sky.karl };
    });
    const b = stats(await pixels(page), 0.35, 0.9);
    expect(thick.karl.coverage).toBeGreaterThan(clear.karl.coverage);
    expect(thick.vis).toBeLessThan(clear.vis);
    expect(thick.vis).toBeLessThan(500);
    expect(b.std).toBeLessThan(a.std * 0.8);
  });

  test('[R-ENV-CITY] city windows light up at night with no street lights helping', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const s = window.__fly.game.scene;
      s.getObjectByName('env:roads')!.visible = false;
      s.getObjectByName('env:lamps')!.layers.disableAll();
    });
    const view = { lat: 37.806, lon: -122.425, yaw: -2.2, alt: 160 };
    await look(page, { ...view, mode: 'night' });
    const night = stats(await pixels(page), 0.35, 1);
    await page.evaluate(() => (window.__fly.game.cityRenderer.material.visible = false));
    await look(page, { ...view, mode: 'night' });
    const dark = stats(await pixels(page), 0.35, 1);
    expect(night.mean).toBeLessThan(70);
    expect(night.bright).toBeGreaterThan(0.01);
    expect(night.bright).toBeGreaterThan(dark.bright * 4);
  });

  test('[R-ENV-PERF] every quality tier stays under its draw call and triangle budget in the worst views', async ({ page }) => {
    test.setTimeout(900_000);
    const budget = { low: { calls: 280, tris: 3.0e6 }, medium: { calls: 590, tris: 6.6e6 }, high: { calls: 710, tris: 10.6e6 } };
    const views: View[] = [
      { lat: 37.7985, lon: -122.388, yaw: 2.4, alt: 180, mode: 'noon' },
      { lat: 37.799, lon: -122.383, yaw: 1.9, alt: 200, mode: 'night' },
      { lat: 37.8005, lon: -122.3985, yaw: 2.4, alt: 14, mode: 'noon' },
      { lat: 37.7605, lon: -122.4195, yaw: 0, alt: 40, mode: 'night' },
      { lat: 37.7544, lon: -122.4477, yaw: -2.2, alt: 120, mode: 'noon' },
      { lat: 37.803, lon: -122.462, yaw: 0.35, alt: 90, mode: 'golden' },
      { lat: 37.8075, lon: -122.4655, yaw: 0.9, alt: 120, mode: 'night' },
      { lat: 37.7605, lon: -122.508, yaw: 1.57, alt: 60, mode: 'golden', fog: 3 },
      { lat: 37.78, lon: -122.45, yaw: -1.4, alt: 300, mode: 'night' },
    ];
    const seen: Record<string, { calls: number; tris: number; trees: number; shadow: number; far: number }> = {};
    for (const q of ['low', 'medium', 'high'] as const) {
      await boot(page, `quality=${q}`);
      const worst = { calls: 0, tris: 0 };
      for (const v of views) {
        await look(page, v);
        const s = await env(page);
        worst.calls = Math.max(worst.calls, s.calls);
        worst.tris = Math.max(worst.tris, s.triangles);
      }
      const t = await page.evaluate(() => {
        const g = window.__fly.game;
        return { shadow: g.renderer.shadowMap.enabled ? g.sky.sun.shadow.mapSize.x : 0, far: g.camera.far };
      });
      seen[q] = { ...worst, trees: (await env(page)).trees, ...t };
      test.info().annotations.push({ type: `perf ${q}${LITE ? ' (lite)' : ''}`, description: JSON.stringify(seen[q]) });
      expect(worst.calls).toBeLessThan(budget[q].calls);
      expect(worst.tris).toBeLessThan(budget[q].tris);
    }
    expect(seen.low.trees).toBeLessThan(seen.medium.trees);
    expect(seen.medium.trees).toBeLessThan(seen.high.trees);
    expect(seen.low.shadow).toBeLessThan(seen.medium.shadow);
    expect(seen.medium.shadow).toBeLessThan(seen.high.shadow);
    expect(seen.low.far).toBeLessThan(seen.high.far);
  });
});
