import * as THREE from 'three';
import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import { el } from './panel-host';
import { bearingDeg, edgePoint, formatDistance, headingDeg, relativeDeg } from './map-view';

const userWaypoints = new WeakSet<object>();
const ARRIVE = 30;

export function setWaypoint(game: Game, p: Vec3, label: string): void {
  const wp = { x: p.x, y: p.y, z: p.z, label };
  userWaypoints.add(wp);
  game.waypoint = wp;
  game.toast(`Waypoint set: ${label}`);
}

export function guideTarget(game: Game): (Vec3 & { label: string }) | null {
  if (game.waypoint) return game.waypoint;
  const a = game.activities.active;
  const next = a?.inst.targets?.()[0];
  return next ? { ...next, label: 'Next' } : null;
}

export function installWaypoint(game: Game): { update(): void } {
  const marker = el('div', 'wp');
  marker.hidden = true;
  const ring = el('div', 'wp-ring');
  const label = el('div', 'wp-label');
  const name = el('b');
  const dist = el('span');
  label.append(name, dist);
  const arrow = el('div', 'wp-arrow');
  marker.append(arrow, ring, label);
  const compassPip = el('i', 'wp-compass');
  compassPip.hidden = true;
  game.hud.root.append(marker);
  game.hud.root.querySelector('.hud-compass')?.append(compassPip);
  const v = new THREE.Vector3();
  return {
    update() {
      const t = guideTarget(game);
      const p = game.flight.pos;
      if (!t || !game.loaded) {
        marker.hidden = true;
        compassPip.hidden = true;
        return;
      }
      const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      if (game.waypoint && userWaypoints.has(game.waypoint) && d < ARRIVE) {
        game.toast(`Arrived: ${game.waypoint.label}`, 'reward');
        game.waypoint = null;
        return;
      }
      marker.hidden = false;
      compassPip.hidden = false;
      name.textContent = t.label;
      dist.textContent = formatDistance(Math.hypot(t.x - p.x, t.z - p.z), game.save.data.settings.units === 'imperial');
      const rel = relativeDeg(bearingDeg(p.x, p.z, t.x, t.z), headingDeg(game.flight.yaw));
      const half = (compassPip.parentElement?.clientWidth ?? 300) / 2 - 12;
      const px = (rel * 28) / 15;
      compassPip.style.left = `calc(50% + ${Math.max(-half, Math.min(half, px))}px)`;
      compassPip.classList.toggle('edge', Math.abs(px) > half);
      const W = window.innerWidth;
      const H = window.innerHeight;
      v.set(t.x, t.y, t.z).project(game.camera);
      const behind = v.z > 1;
      const inside = !behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.86;
      marker.classList.toggle('off', !inside);
      if (inside) {
        marker.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px)`;
        return;
      }
      let dx = v.x * W;
      let dy = -v.y * H;
      if (behind) {
        dx = -dx;
        dy = -dy;
      }
      if (Math.hypot(dx, dy) < 1) dy = 1;
      const e = edgePoint(dx, dy, W / 2 - 56, H / 2 - 70);
      marker.style.transform = `translate(${W / 2 + e.x}px, ${H / 2 + e.y}px)`;
      arrow.style.transform = `rotate(${e.angle}rad)`;
    },
  };
}
