import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import { guide, questWaypoint, type Marker, type MarkerStyle, type QuestInstance } from '../activities/quest-common';
import { chapters, type QuestParams } from '../activities/kinds/quest';
import { QuestDialogue, QuestTracker } from '../ui/quest-dialogue';

const QUEST_KINDS = new Set(['quest', 'riddle', 'scavenger', 'daily']);

function haloTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function fadeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createLinearGradient(0, 0, 0, 128);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = r;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

class MarkerLayer {
  readonly group = new THREE.Group();
  private pools: Record<MarkerStyle, THREE.Object3D[]> = { beacon: [], token: [], shard: [] };
  private halo = haloTexture();
  private fade = fadeTexture();

  constructor() {
    this.group.name = 'quest-markers';
  }

  private glow(color: string, size: number): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.halo, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.scale.setScalar(size);
    return s;
  }

  private make(style: MarkerStyle): THREE.Object3D {
    const o = new THREE.Group();
    if (style === 'beacon') {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 360, 20, 1, true).translate(0, 180, 0),
        new THREE.MeshBasicMaterial({ color: '#d9771f', alphaMap: this.fade, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      );
      const ring = new THREE.Mesh(new THREE.RingGeometry(9, 11, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      ring.name = 'ring';
      o.add(pillar, ring, this.glow('#ffc15e', 26));
    } else if (style === 'token') {
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 2.4, 0.45, 32).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#ffd35a', emissive: '#ffae00', emissiveIntensity: 0.85, metalness: 0.7, roughness: 0.28 }),
      );
      coin.name = 'spin';
      o.add(coin, this.glow('#ffcc55', 16));
    } else {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(2, 0).scale(1, 1.7, 1), new THREE.MeshBasicMaterial({ color: '#8ff6ff', fog: false }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(shard.geometry), new THREE.LineBasicMaterial({ color: '#ffffff', fog: false }));
      shard.add(edge);
      shard.name = 'spin';
      o.add(shard, this.glow('#58e8ff', 18));
    }
    this.group.add(o);
    return o;
  }

  sync(markers: Marker[], time: number): void {
    const used: Record<MarkerStyle, number> = { beacon: 0, token: 0, shard: 0 };
    for (const m of markers) {
      const pool = this.pools[m.style];
      const o = pool[used[m.style]] ?? (pool[used[m.style]] = this.make(m.style));
      const i = used[m.style]++;
      o.visible = true;
      const phase = time * 2 + i * 1.7;
      o.position.set(m.p.x, m.p.y + (m.style === 'beacon' ? -20 : Math.sin(phase) * 0.8), m.p.z);
      const spin = o.getObjectByName('spin');
      if (spin) spin.rotation.y = time * 2.2 + i;
      const ring = o.getObjectByName('ring');
      if (ring) ring.scale.setScalar(1 + ((time * 0.6) % 1) * 0.8);
    }
    for (const style of Object.keys(this.pools) as MarkerStyle[]) this.pools[style].forEach((o, i) => (o.visible = i < used[style]));
  }
}

export function nextChapterWaypoint(game: Game, id: string): void {
  if (game.activities.defs.get(id)?.kind !== 'quest') return;
  const next = chapters(game.activities.list()).find((c) => !game.save.isDone(c.id));
  if (!next) {
    game.toast('👑 The Lost Commit is restored. San Francisco remembers.', 'reward');
    return;
  }
  const n = (next.params as unknown as QuestParams).chapter;
  const label = `Chapter ${n}: ${next.title}`;
  guide(game, game.activities.position(next), label);
  game.toast(`Next: Chapter ${n}, ${next.title}.${game.waypoint?.label === label ? ' Waypoint set.' : ''}`, 'info');
}

export function arrived(game: Game, id: string): void {
  const w = questWaypoint(game);
  const def = game.activities.defs.get(id);
  if (!w || !def || def.kind === 'quest') return;
  const p = game.activities.position(def);
  if (Math.hypot(p.x - w.x, p.z - w.z) < 60) game.waypoint = null;
}

export function questMarkers(game: Game, inst: QuestInstance | null): Marker[] {
  const markers = inst?.markers?.() ?? [];
  const w = questWaypoint(game);
  if (w && !markers.some((m) => m.style === 'beacon' && Math.hypot(m.p.x - w.x, m.p.z - w.z) < 1)) markers.push({ p: w, style: 'beacon' });
  return markers;
}

let tracker: QuestTracker | null = null;
let layer: MarkerLayer | null = null;

export const system: GameSystem = {
  id: 'quests',
  order: 40,
  init(game) {
    new QuestDialogue(game);
    tracker = new QuestTracker(game);
    layer = new MarkerLayer();
    game.scene.add(layer.group);
    game.bus.on('activity:complete', ({ id }) => nextChapterWaypoint(game, id));
    game.bus.on('activity:start', ({ id }) => arrived(game, id));
  },
  update(_dt, game) {
    const a = game.activities.active;
    const inst = a && QUEST_KINDS.has(a.def.kind) ? (a.inst as QuestInstance) : null;
    tracker?.update(inst ? (a?.def.id ?? null) : null, inst);
    layer?.sync(questMarkers(game, inst), game.simTime);
  },
};
