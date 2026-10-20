import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import { toLocal } from '../core/geo';
import { addFeed, due, getFeed, grantCard, liveState, refresh } from '../live/state';
import { extrapolate, openSkyProxy, planeSpec, simulate, type Plane } from '../live/planes';
import { airliner, fin, TAILS } from '../live/models';
import { sfTime } from '../live/sf-time';

const MAX = 24;
const CLOSE = 90;

interface View {
  root: THREE.Group;
  nav: THREE.Group;
  tail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  beacon: THREE.Points;
  strobe: THREE.Points;
  landing: THREE.Points;
}

const views = new WeakMap<Game, { list: View[]; warned: Set<string> }>();

const DOT = (() => {
  const n = 16;
  const data = new Uint8Array(n * n * 4).fill(255);
  for (let i = 0; i < n * n; i++) data[i * 4 + 3] = Math.round(255 * Math.max(0, 1 - Math.hypot((i % n) - 7.5, Math.floor(i / n) - 7.5) / 8) ** 1.5);
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
})();

function points(pos: number[], color: string, size: number): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size: size * 1.6, map: DOT, sizeAttenuation: false, depthWrite: false, transparent: true }));
}

function build(game: Game): View[] {
  const body = airliner();
  const finGeo = fin();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.name = 'live-planes';
  game.scene.add(group);
  return Array.from({ length: MAX }, () => {
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.visible = false;
    const tail = new THREE.Mesh(finGeo, new THREE.MeshLambertMaterial());
    root.add(new THREE.Mesh(body, mat), tail);
    const nav = new THREE.Group();
    nav.add(points([-18.6, -0.6, 3.8], '#ff3b30', 5), points([18.6, -0.6, 3.8], '#34c759', 5), points([0, 8.6, 19.6], '#ffffff', 4));
    const beacon = points([0, 2.1, 2, 0, -2.1, 2], '#ff2a1a', 6);
    const strobe = points([-18.7, -0.6, 4.2, 18.7, -0.6, 4.2], '#ffffff', 7);
    const landing = points([-2.2, -1.2, -3.6, 2.2, -1.2, -3.6], '#fff6dc', 7);
    nav.add(beacon, strobe, landing);
    root.add(nav);
    group.add(root);
    return { root, nav, tail, beacon, strobe, landing };
  });
}

export function currentPlanes(game: Game, ms: number): Plane[] {
  const feed = getFeed(game, planeSpec);
  const live = feed?.data && feed.status !== 'fallback' && Math.abs(ms - Date.now()) < 120_000 ? extrapolate(feed.data, ms) : null;
  return live ?? simulate(ms, sfTime(new Date(ms)).hour);
}

export const system: GameSystem = {
  id: 'live-planes',
  order: 23,
  init(game) {
    void refresh(game, addFeed(game, planeSpec, openSkyProxy() !== null));
    views.set(game, { list: build(game), warned: new Set() });
  },
  update(dt, game) {
    const feed = getFeed(game, planeSpec);
    const v = views.get(game);
    if (!feed || !v) return;
    if (due(game, 'planes', 60, dt)) void refresh(game, feed);
    const s = liveState(game);
    const ms = game.date().getTime();
    const me = game.flight.pos;
    const list = currentPlanes(game, ms).map((p) => {
      const { x, z } = toLocal(p.lat, p.lon);
      return { p, x, z, d: Math.hypot(x - me.x, p.alt - me.y, z - me.z) };
    });
    list.sort((a, b) => a.d - b.d);
    s.planes = list.map((e) => e.p);
    const blink = performance.now() / 1000;
    v.list.forEach((view, i) => {
      const e = list[i];
      view.root.visible = !!e;
      if (!e) return;
      const { p, x, z, d } = e;
      const scale = p.wide ? 1.6 : 1;
      view.root.position.set(x, p.alt, z);
      view.root.rotation.set(Math.atan2(p.climb, Math.max(1, p.speed)), (-p.track * Math.PI) / 180, -p.bank);
      view.root.scale.setScalar(scale);
      view.tail.material.color.set(TAILS[p.livery % TAILS.length]);
      view.nav.visible = game.sky.night > 0.3 || d < 3000;
      view.beacon.visible = blink % 1.2 < 0.12;
      view.strobe.visible = blink % 1.4 < 0.06 || (blink % 1.4 > 0.16 && blink % 1.4 < 0.22);
      view.landing.visible = p.landing;
      if (d < CLOSE * scale && !v.warned.has(p.id) && s.online) {
        v.warned.add(p.id);
        game.chase.shake = Math.max(game.chase.shake, 0.8);
        game.flight.vel.y -= 4;
        game.toast(`Close call! ${p.label} passed ${Math.round(d)} m away`, 'warn');
        game.bus.emit('live:close-call', { id: p.id, label: p.label, distance: d });
        grantCard(game, 'plane-spotter', 'Plane Spotter');
      }
    });
  },
};
