import './flight-fx.css';
import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import type { GameAudio } from '../audio/game-audio';
import { FLIGHT, MACH, type FlightEnv } from '../player/flight';
import { burst, tone } from '../audio/synth';
import { el } from '../ui/panel-host';

declare module '../core/bus' {
  interface GameEvents {
    warp: { x: number; z: number; label: string };
  }
}

export const WARP = { jump: 0.5, end: 1.4, fov: 55 };

export function safeAltitude(env: FlightEnv, x: number, z: number): number {
  let y = Math.max(env.groundAt(x, z), FLIGHT.waterLevel) + 30;
  while (y < FLIGHT.ceiling && env.collide({ x, y, z }, FLIGHT.radius + 10)) y += 5;
  return Math.min(y, FLIGHT.ceiling);
}

function vaporCone(): THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> {
  const alpha = new Uint8Array(4 * 16);
  for (let i = 0; i < 16; i++) alpha[i * 4 + 1] = Math.round(255 * Math.sin((Math.PI * i) / 15) ** 2);
  const map = new THREE.DataTexture(alpha, 1, 16);
  map.needsUpdate = true;
  const geo = new THREE.ConeGeometry(2.6, 5, 32, 1, true);
  geo.translate(0, -2.5, 0);
  const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#f4f8ff', transparent: true, opacity: 0, alphaMap: map, depthWrite: false, side: THREE.DoubleSide }));
  cone.name = 'vapor-cone';
  return cone;
}

const UP = new THREE.Vector3(0, 1, 0);

export const system: GameSystem & { booms: number } = {
  id: 'flight-fx',
  order: 30,
  booms: 0,
  init(game) {
    const cone = vaporCone();
    game.scene.add(cone);
    const overlay = el('div', 'ffx-warp');
    const label = el('span', 'ffx-warp-label');
    overlay.append(label);
    const boom = el('div', 'ffx-boom');
    const badge = el('div', 'ffx-mach');
    badge.hidden = true;
    game.hud.root.append(overlay, boom, badge);
    const replay = (node: HTMLElement) => {
      node.classList.remove('on');
      void node.offsetWidth;
      node.classList.add('on');
    };

    let warp: { x: number; z: number; t: number; jumped: boolean } | null = null;
    game.bus.on('warp', ({ x, z, label: name }) => {
      warp = { x, z, t: 0, jumped: false };
      game.panels.close();
      label.textContent = `Warp to ${name}`;
      replay(overlay);
    });

    let last = 0;
    let flare = 0;
    let shown = '';
    const dir = new THREE.Vector3();
    this.update = (dt: number, g: Game) => {
      const f = g.flight;
      if (warp) {
        warp.t += dt;
        if (!warp.jumped && warp.t >= WARP.jump) {
          warp.jumped = true;
          const yaw = Math.atan2(-(warp.x - f.pos.x), -(warp.z - f.pos.z));
          g.teleport({ x: warp.x, y: safeAltitude(g.env, warp.x, warp.z), z: warp.z }, yaw);
        }
        g.chase.kick = WARP.fov * (warp.jumped ? Math.max(0, (WARP.end - warp.t) / (WARP.end - WARP.jump)) : warp.t / WARP.jump);
        if (warp.t >= WARP.end) {
          warp = null;
          g.chase.kick = 0;
          overlay.classList.remove('on');
        }
      }

      const speed = f.speed;
      if (last < MACH && speed >= MACH) {
        this.booms++;
        flare = 1;
        g.chase.shake = Math.max(g.chase.shake, 0.6);
        replay(boom);
        const graph = (g.systems.find((s) => s.id === 'audio') as { audio?: GameAudio | null } | undefined)?.audio?.graph;
        if (graph?.ctx.state === 'running') {
          const t = graph.ctx.currentTime + 0.01;
          burst(graph.kit, graph.buses.sfx, t, 'lowpass', 600, 40, 1.4, 0.9);
          tone(graph.kit, graph.buses.sfx, t, 70, 0.5, 0.7, 'sine', 0.5);
          tone(graph.kit, graph.buses.sfx, t + 0.14, 62, 0.6, 0.6, 'sine', 0.5);
        }
      }
      last = speed;
      flare = Math.max(0, flare - dt * 1.2);

      const opacity = Math.max(flare * 0.7, 0.45 * Math.exp(-(((speed - MACH) / 30) ** 2)), speed >= MACH ? 0.12 : 0);
      cone.visible = opacity > 0.01 && speed > 1;
      if (cone.visible) {
        dir.set(f.vel.x, f.vel.y, f.vel.z).divideScalar(speed);
        cone.quaternion.setFromUnitVectors(UP, dir);
        cone.position.set(f.pos.x + dir.x * 1.4, f.pos.y + dir.y * 1.4, f.pos.z + dir.z * 1.4);
        cone.material.opacity = opacity;
      }

      const text = speed >= MACH * 0.98 ? `MACH ${(speed / MACH).toFixed(2)}` : f.boostHeld > 0 ? 'BOOST · hold for supersonic' : '';
      if (text !== shown) {
        shown = text;
        badge.textContent = text;
        badge.hidden = !text;
        badge.classList.toggle('super', speed >= MACH * 0.98);
      }
    };
  },
};
