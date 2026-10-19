import type { Page } from '@playwright/test';
import { test, expect, boot } from './fixtures';

const DAY = 'time=2026-10-19T21:30:00Z';
const NIGHT = 'time=2026-10-19T06:30:00Z';

interface View {
  id: string;
  lat: number;
  lon: number;
  dist: number;
  bearing: number;
  height: number;
  look: number;
}

const DAY_VIEWS: View[] = [
  { id: 'golden-gate-bridge', lat: 37.8197, lon: -122.4786, dist: 1500, bearing: 95, height: 150, look: 100 },
  { id: 'bay-bridge', lat: 37.7982, lon: -122.3779, dist: 1700, bearing: 300, height: 180, look: 60 },
  { id: 'transamerica-pyramid', lat: 37.7952, lon: -122.4028, dist: 450, bearing: 160, height: 120, look: 130 },
  { id: 'salesforce-tower', lat: 37.7898, lon: -122.3969, dist: 700, bearing: 200, height: 250, look: 180 },
  { id: 'coit-tower', lat: 37.8024, lon: -122.4058, dist: 140, bearing: 200, height: 70, look: 40 },
  { id: 'palace-of-fine-arts', lat: 37.8029, lon: -122.4484, dist: 180, bearing: 80, height: 45, look: 15 },
  { id: 'ferry-building', lat: 37.7955, lon: -122.3935, dist: 220, bearing: 240, height: 60, look: 40 },
  { id: 'city-hall', lat: 37.7793, lon: -122.4193, dist: 230, bearing: 100, height: 80, look: 50 },
  { id: 'sutro-tower', lat: 37.7552, lon: -122.4528, dist: 420, bearing: 40, height: 160, look: 150 },
  { id: 'alcatraz', lat: 37.8267, lon: -122.4228, dist: 420, bearing: 160, height: 110, look: 30 },
];

const NIGHT_VIEWS: View[] = [
  { id: 'golden-gate-bridge', lat: 37.8197, lon: -122.4786, dist: 1100, bearing: 120, height: 140, look: 100 },
  { id: 'bay-bridge', lat: 37.7982, lon: -122.3779, dist: 900, bearing: 300, height: 90, look: 70 },
  { id: 'salesforce-tower', lat: 37.7898, lon: -122.3969, dist: 650, bearing: 250, height: 240, look: 230 },
  { id: 'city-hall', lat: 37.7793, lon: -122.4193, dist: 220, bearing: 90, height: 70, look: 50 },
];

async function compare(page: Page, v: View): Promise<{ diff: number; lit: number; shot: Buffer }> {
  const stats = await page.evaluate((view) => {
    const g = window.__fly.game;
    const t = g.world.toLocal(view.lat, view.lon);
    const b = (view.bearing * Math.PI) / 180;
    const x = t.x + view.dist * Math.sin(b);
    const z = t.z - view.dist * Math.cos(b);
    const gy = Math.max(0, g.world.heightAt(t.x, t.z));
    window.__fly.teleport({ x, y: gy + view.height, z }, 0);
    g.drone.root.visible = false;
    g.camera.position.set(x, gy + view.height, z);
    g.camera.lookAt(t.x, gy + view.look, t.z);
    g.sky.update(g.date(), g.camera.position);
    const group = g.world.root.children.find((c) => c.name === `landmark:${view.id}`)!;
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const grab = (visible: boolean) => {
      group.visible = visible;
      g.renderer.render(g.scene, g.camera);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const hidden = grab(false);
    const shown = grab(true);
    let changed = 0;
    let brighter = 0;
    for (let i = 0; i < shown.length; i += 4) {
      const d = Math.abs(shown[i] - hidden[i]) + Math.abs(shown[i + 1] - hidden[i + 1]) + Math.abs(shown[i + 2] - hidden[i + 2]);
      if (d > 30) changed++;
      if (shown[i] + shown[i + 1] + shown[i + 2] - hidden[i] - hidden[i + 1] - hidden[i + 2] > 60) brighter++;
    }
    return { diff: changed / (w * h), lit: brighter / (w * h) };
  }, v);
  return { ...stats, shot: await page.locator('canvas#view').screenshot() };
}

async function freezeCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__fly.game;
    g.running = false;
    g.chase.update = () => undefined;
  });
}

test.describe('hand-built landmarks', () => {
  test('[R-LANDMARKS] every hand-built landmark is in the scene with no console errors', async ({ page }) => {
    const errors = await boot(page);
    const names = await page.evaluate(() => window.__fly.game.world.root.children.map((c) => c.name).filter((n) => n.startsWith('landmark:')));
    const heroes = names.filter((n) => n !== 'landmark:skyline-modern' && n !== 'landmark:bay-bridge-east-span');
    expect(heroes.length).toBeGreaterThanOrEqual(22);
    for (const id of ['golden-gate-bridge', 'bay-bridge', 'transamerica-pyramid', 'salesforce-tower', 'coit-tower', 'sutro-tower', 'alcatraz', 'city-hall', 'ferry-building']) {
      expect(names).toContain(`landmark:${id}`);
    }
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test('[R-LANDMARKS] flying into a Golden Gate tower bounces the drone off the leg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const t = g.world.toLocal(37.814009, -122.477901);
      const leg = { x: t.x - 13.6, z: t.z };
      window.__fly.teleport({ x: leg.x - 140, y: 150, z: leg.z }, -Math.PI / 2);
      g.input.held.add('KeyW');
      g.input.held.add('KeyR');
      let inside = 0;
      let closest = Infinity;
      let impactAt = null as number | null;
      const off = g.bus.on('player:crash', () => (impactAt ??= g.flight.pos.x - leg.x));
      for (let i = 0; i < 150; i++) {
        window.__fly.step(1 / 30);
        const p = g.flight.pos;
        closest = Math.min(closest, Math.abs(p.x - leg.x));
        if (Math.abs(p.x - leg.x) < 3.5 && Math.abs(p.z - leg.z) < 4.5 && p.y < 160) inside++;
      }
      g.input.held.clear();
      off();
      return { inside, closest, impactAt };
    });
    expect(r.inside).toBe(0);
    expect(r.closest).toBeLessThan(12);
    expect(r.impactAt).not.toBeNull();
    expect(r.impactAt!).toBeLessThan(-4.5);
  });

  test('[R-LANDMARKS] the drone flies freely under the Golden Gate deck', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const mid = g.world.toLocal(37.8197535, -122.478572);
      window.__fly.teleport({ x: mid.x - 160, y: 35, z: mid.z }, -Math.PI / 2);
      g.input.held.add('KeyW');
      let hits = 0;
      const collide = g.env.collide;
      g.env.collide = (p, rad) => {
        const hit = collide(p, rad);
        if (hit) hits++;
        return hit;
      };
      window.__fly.step(11, 1 / 30);
      g.env.collide = collide;
      g.input.held.clear();
      return { hits, dx: g.flight.pos.x - mid.x, y: g.flight.pos.y, dz: Math.abs(g.flight.pos.z - mid.z) };
    });
    expect(r.hits).toBe(0);
    expect(r.dx).toBeGreaterThan(120);
    expect(r.y).toBeGreaterThan(30);
    expect(r.y).toBeLessThan(40);
    expect(r.dz).toBeLessThan(5);
  });

  test('[R-LANDMARKS] eight or more landmarks render on screen by day', async ({ page }, info) => {
    test.setTimeout(300_000);
    await boot(page, DAY);
    await freezeCamera(page);
    for (const v of DAY_VIEWS) {
      const r = await compare(page, v);
      await info.attach(`day-${v.id}.png`, { body: r.shot, contentType: 'image/png' });
      expect(r.diff, v.id).toBeGreaterThan(0.004);
    }
  });

  test('[R-LANDMARK-NIGHT] landmarks light up at night', async ({ page }, info) => {
    test.setTimeout(300_000);
    await boot(page, NIGHT);
    await freezeCamera(page);
    const night = await page.evaluate(() => window.__fly.game.sky.night);
    expect(night).toBeGreaterThan(0.9);
    for (const v of NIGHT_VIEWS) {
      const r = await compare(page, v);
      await info.attach(`night-${v.id}.png`, { body: r.shot, contentType: 'image/png' });
      expect(r.lit, v.id).toBeGreaterThan(0.002);
    }
  });
});

test.describe('modern skyline', () => {
  test('[R-SKYLINE] Salesforce Tower blocks the drone below 320 m and 181 Fremont tops 240 m', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const g = window.__fly.game;
      const sf = g.world.toLocal(37.789775, -122.39693);
      const out: { y: number; reached: number }[] = [];
      for (const y of [120, 250, 315]) {
        window.__fly.teleport({ x: sf.x - 160, y, z: sf.z }, -Math.PI / 2);
        g.input.held.add('KeyW');
        g.input.held.add('KeyR');
        let reached = Infinity;
        for (let i = 0; i < 240; i++) {
          window.__fly.step(1 / 30);
          reached = Math.min(reached, Math.hypot(g.flight.pos.x - sf.x, g.flight.pos.z - sf.z));
        }
        g.input.held.clear();
        out.push({ y, reached });
      }
      const fremont = g.world.toLocal(37.789788, -122.395356);
      const spire = g.world.collide({ x: fremont.x, y: 241, z: fremont.z }, 1.2);
      const above = g.world.collide({ x: fremont.x, y: 260, z: fremont.z }, 1.2);
      return { out, spire, above };
    });
    for (const o of r.out) expect(o.reached, `y=${o.y}`).toBeGreaterThan(15);
    expect(r.spire).toBe(true);
    expect(r.above).toBe(false);
  });
});
