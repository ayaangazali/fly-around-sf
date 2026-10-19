import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import { Net } from '../net/session';
import { NetView } from '../net/view';
import { NetHud } from '../net/hud';
import { normalizeCode } from '../net/protocol';
import { rayToGround } from '../net/math';

declare module '../game' {
  interface Game {
    net: Net;
  }
}

let view: NetView;
let hud: NetHud;
let failed = false;
const dir = new THREE.Vector3();
const up = new THREE.Vector3();

export function pingAhead(game: Game): void {
  const cam = game.camera;
  cam.getWorldDirection(dir);
  const origin = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  game.net.ping(rayToGround(origin, { x: dir.x, y: dir.y, z: dir.z }, (x, z) => game.world.groundAt(x, z)));
}

export const system: GameSystem = {
  id: 'net',
  order: 90,
  init(game) {
    const net = new Net(game, new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'p2p');
    game.net = net;
    view = new NetView(game, net);
    hud = new NetHud(game, net);
    const wake = () => {
      if (net.room || net.voice.ctx) net.voice.audio();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('pagehide', () => {
      net.leave();
      net.sync.stop();
    });
    const code = normalizeCode(game.opts.room);
    if (code) void net.join(code);
  },
  update(dt, game) {
    if (failed) return;
    try {
      const net = game.net;
      if (game.input.consume('ping') && !game.panels.openId) {
        net.voice.audio();
        pingAhead(game);
      }
      if (game.input.consume('chat') && !game.panels.openId) hud.openChat();
      if (net.voice.on && net.voice.mode === 'ptt') net.voice.setTalking(!game.panels.openId && (game.input.held.has('KeyT') || hud.touchTalk));
      const cam = game.camera;
      cam.getWorldDirection(dir);
      up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      net.update(dt, { pos: cam.position, forward: dir, up });
      if (net.match && net.match.phase !== 'done') game.activities.nearby = null;
      view.update();
      hud.update();
    } catch (e) {
      failed = true;
      console.warn('multiplayer paused after an error', e);
    }
  },
};
