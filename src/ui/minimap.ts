import type { Game } from '../game';
import { el } from './panel-host';
import { baseMap, type BaseMap } from './map-base';
import { headingDeg } from './map-view';
import { settingsOf } from './settings-model';
import { guideTarget } from './waypoint';
import { kindColor, mappable } from './map-style';

const SIZE = 148;
const RANGE = 700;

export function installMinimap(game: Game): { update(): void } {
  const wrap = el('button', 'minimap');
  wrap.setAttribute('aria-label', 'Open the map');
  wrap.hidden = true;
  const canvas = el('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = SIZE * dpr;
  const north = el('span', 'minimap-n', 'N');
  wrap.append(canvas, north);
  wrap.addEventListener('click', () => game.panels.open('map'));
  game.hud.root.append(wrap);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let base: BaseMap | null = null;
  let pending = false;
  let lastDraw = 0;

  return {
    update() {
      const on = settingsOf(game).minimap && game.loaded;
      if (!on) {
        wrap.hidden = true;
        return;
      }
      if (!base) {
        if (!pending) {
          pending = true;
          setTimeout(() => (base = baseMap(game)), 800);
        }
        return;
      }
      wrap.hidden = false;
      const now = performance.now();
      if (now - lastDraw < 33) return;
      lastDraw = now;
      const p = game.flight.pos;
      const h = (headingDeg(game.flight.yaw) * Math.PI) / 180;
      const R = (SIZE * dpr) / 2;
      const scale = R / RANGE;
      const { extent, mpp } = base;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#09182a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(R, R);
      ctx.rotate(-h);
      ctx.scale(scale, scale);
      const r = RANGE * 1.45;
      ctx.drawImage(base.canvas, (p.x - r - extent.minX) / mpp, (p.z - r - extent.minZ) / mpp, (2 * r) / mpp, (2 * r) / mpp, -r, -r, 2 * r, 2 * r);
      const dot = (x: number, z: number, color: string, size: number) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x - p.x, z - p.z, size / scale, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const d of game.activities.list()) {
        if (!mappable(game, d) || game.save.isDone(d.id) || game.activities.locked(d)) continue;
        const q = game.activities.position(d);
        if (Math.abs(q.x - p.x) > r || Math.abs(q.z - p.z) > r) continue;
        dot(q.x, q.z, 'rgba(0,0,0,0.55)', 4.5 * dpr);
        dot(q.x, q.z, kindColor(d.kind), 3.2 * dpr);
      }
      const t = guideTarget(game);
      if (t) {
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        const k = Math.min(1, (RANGE * 0.92) / Math.max(1, Math.hypot(dx, dz)));
        dot(p.x + dx * k, p.z + dz * k, '#ffffff', 6 * dpr);
        dot(p.x + dx * k, p.z + dz * k, '#ff6a3d', 4.5 * dpr);
      }
      ctx.restore();
      ctx.translate(R, R);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, -9 * dpr);
      ctx.lineTo(6.5 * dpr, 7 * dpr);
      ctx.lineTo(0, 3.5 * dpr);
      ctx.lineTo(-6.5 * dpr, 7 * dpr);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      const nr = wrap.clientWidth / 2 - 11;
      north.style.transform = `translate(${-Math.sin(h) * nr}px, ${-Math.cos(h) * nr}px)`;
    },
  };
}
