import * as THREE from 'three';
import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import { el } from './panel-host';
import { avoidBoxes, bearingDeg, edgePoint, formatDistance, headingDeg, relativeDeg, type Box } from './map-view';

const userWaypoints = new WeakSet<object>();
const ARRIVE = 30;
const WIDGETS = '.minimap, .hud-stats, .onboard, .stick, .touch-buttons';

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
  return next ? { ...next, label: a!.def.title } : null;
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
  let boxes: Box[] = [];
  let foot: Box = { left: 0, top: 0, right: 0, bottom: 0 };
  let measured = -Infinity;
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
      const now = performance.now();
      if (now - measured > 500) {
        measured = now;
        boxes = [...game.ui.querySelectorAll(WIDGETS)].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0);
        const half = Math.max(18, label.offsetWidth / 2) + 6;
        foot = { left: half, right: half, top: 20, bottom: label.offsetTop + label.offsetHeight + 6 };
      }
      const e = edgePoint(dx, dy, W / 2 - Math.max(90, foot.left + 12), H / 2 - 70);
      const at = avoidBoxes(W / 2 + e.x, H / 2 + e.y, boxes, foot, W, H);
      marker.style.transform = `translate(${at.x}px, ${at.y}px)`;
      arrow.style.transform = `rotate(${e.angle}rad)`;
    },
  };
}
