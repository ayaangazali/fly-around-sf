import * as THREE from 'three';
import type { GameSystem } from '../game';
import { currentStop, trailParams } from '../activities/kinds/trail';

const COLOR = '#ffd166';
let ring: THREE.Mesh;
let pad: THREE.Mesh;
let time = 0;

export const system: GameSystem = {
  id: 'trail',
  order: 35,
  init(game) {
    ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 12, 72), new THREE.MeshBasicMaterial({ color: COLOR, toneMapped: false, fog: false }));
    pad = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLOR, toneMapped: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    ring.name = 'trail-ring';
    pad.name = 'trail-pad';
    ring.visible = pad.visible = false;
    game.scene.add(ring, pad);
  },
  update(dt, game) {
    time += dt;
    const stop = currentStop(game);
    const p = stop && trailParams(stop);
    ring.visible = p?.land === 'ring';
    pad.visible = !!p && p.land !== 'ring';
    if (!stop || !p) return;
    const t = game.activities.position(stop);
    const mesh = ring.visible ? ring : pad;
    mesh.position.set(t.x, t.y + (ring.visible ? 0 : 0.4), t.z);
    mesh.scale.setScalar(p.radius * (1 + 0.04 * Math.sin(time * 4)));
    if (!ring.visible) return;
    const h = ((p.heading ?? 0) * Math.PI) / 180;
    if (p.heading === undefined) ring.rotation.set(Math.PI / 2, 0, 0);
    else ring.rotation.set(0, Math.atan2(Math.sin(h), -Math.cos(h)), 0);
  },
};
