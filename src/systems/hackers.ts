import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import type { HackInstance } from '../activities/kinds/hack';
import type { Vec3 } from '../player/flight';

// 16x16 side-view frames: h hair, s skin, e eye, t top, d sleeve, k hands, p pants, l laptop, g screen.
const FRAMES = [
  ['................', '....hhhh........', '...hhhhhh.......', '...hhhssss......', '...hhssses......', '....hssss.......', '.....ss.........', '...tttttt.......', '..tttttttt...g..', '..ttttttdd...g..', '..tttttt.ddd.g..', '..tttttt...kkg..', '..pppppppplllll.', '..pppppppppp....', '................', '................'],
  ['................', '................', '....hhhh........', '...hhhhhh.......', '...hhhssss......', '...hhssses......', '....hssss.......', '...tttttt.......', '..tttttttt...g..', '..tttttttdd..g..', '..tttttt..dd.g..', '..tttttt..kk.g..', '..pppppppplllll.', '..pppppppppp....', '................', '................'],
  ['................', '....hhhh........', '...hhhhhh.......', '...hhhssss......', '...hhsssse......', '....hssss.......', '.....ss.........', '...tttttt.......', '..ttttttttd..g..', '..tttttttdd..g..', '..tttttt.dd..g..', '..tttttt..kk.g..', '..pppppppplllll.', '..pppppppppp....', '................', '................'],
];

const LOOKS = [
  { h: '#2b1d14', s: '#e0ac69', t: '#6e7681', d: '#4d545c', p: '#2d333b', g: '#7ee787' },
  { h: '#111111', s: '#8d5524', t: '#ff7b39', d: '#c95b26', p: '#1f2a44', g: '#79c0ff' },
  { h: '#c8a165', s: '#f1c27d', t: '#30363d', d: '#9ec1e6', p: '#4a5568', g: '#ffa657' },
  { h: '#c93c3c', s: '#c68642', t: '#2ea043', d: '#1f7a31', p: '#30363d', g: '#d2a8ff' },
  { h: '#4a3728', s: '#ffdbac', t: '#8957e5', d: '#6e40c9', p: '#24292f', g: '#7ee787' },
];

const SIZE = 2.6;
const SHOW = 900;

function atlas(): THREE.SpriteMaterial[][] {
  const px = 16;
  const canvas = document.createElement('canvas');
  canvas.width = px * FRAMES.length;
  canvas.height = px * LOOKS.length;
  const ctx = canvas.getContext('2d')!;
  LOOKS.forEach((look, li) =>
    FRAMES.forEach((rows, fi) =>
      rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '.') return;
          ctx.fillStyle = c === 'e' ? '#101418' : c === 'k' ? look.s : c === 'l' ? '#9aa4b2' : look[c as keyof typeof look];
          ctx.fillRect(fi * px + x, li * px + y, 1, 1);
        }),
      ),
    ),
  );
  const base = new THREE.CanvasTexture(canvas);
  base.magFilter = THREE.NearestFilter;
  base.minFilter = THREE.NearestFilter;
  base.colorSpace = THREE.SRGBColorSpace;
  return LOOKS.map((_, li) =>
    FRAMES.map((_, fi) => {
      const map = base.clone();
      map.repeat.set(1 / FRAMES.length, 1 / LOOKS.length);
      map.offset.set(fi / FRAMES.length, 1 - (li + 1) / LOOKS.length);
      return new THREE.SpriteMaterial({ map, alphaTest: 0.5, fog: true });
    }),
  );
}

function softDot(color: string): THREE.SpriteMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
}

function hashLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 34px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8, 18, 12, 0.72)';
  ctx.beginPath();
  ctx.roundRect(28, 6, 200, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#aff5b4';
  ctx.fillText(text, 128, 33);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false, transparent: true }));
  s.scale.set(8, 2, 1);
  return s;
}

interface Hacker {
  sprite: THREE.Sprite;
  look: number;
  phase: number;
  glow: THREE.Sprite;
}

interface Orb {
  group: THREE.Group;
  core: THREE.Mesh;
  gone: number;
}

export function rooftopSpots(center: Vec3, count: number, groundAt: (x: number, z: number) => number): Vec3[] {
  const spots: Vec3[] = [];
  for (let i = 0; spots.length < count && i < count * 4; i++) {
    const a = i * 2.39996;
    const r = 3 + i * 2.2;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = groundAt(x, z);
    if (Math.abs(y - center.y) < 1.5) spots.push({ x, y, z });
  }
  return spots.length ? spots : [center];
}

class Hackers {
  readonly root = new THREE.Group();
  readonly crew: Hacker[] = [];
  private mats = atlas();
  private orbs: Orb[] = [];
  private hack: HackInstance | null = null;
  private orbGlow = softDot('rgba(126, 231, 135, 0.95)');
  private screenGlow = softDot('rgba(140, 220, 255, 0.8)');
  private orbMat = new THREE.MeshBasicMaterial({ color: '#7ee787' });
  private orbGeo = new THREE.OctahedronGeometry(1.3, 0);
  private beamMat = new THREE.MeshBasicMaterial({ color: '#7ee787', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });

  constructor(private game: Game) {
    this.root.name = 'hackers';
    game.scene.add(this.root);
    for (const def of game.activities.list().filter((d) => d.kind === 'hack')) {
      const c = game.world.point(def.at, 0);
      let seed = 0;
      for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      rooftopSpots(c, 3 + (seed % 3), (x, z) => game.world.groundAt(x, z)).forEach((p, i) => {
        const look = (seed + i) % LOOKS.length;
        const sprite = new THREE.Sprite(this.mats[look][0]);
        sprite.scale.set(SIZE, SIZE, 1);
        sprite.position.set(p.x, p.y + SIZE / 2 - 0.15, p.z);
        sprite.name = `hacker-${def.id}-${i}`;
        const glow = new THREE.Sprite(this.screenGlow);
        glow.scale.setScalar(2.2);
        glow.position.set(p.x + 0.5, p.y + 0.6, p.z);
        this.root.add(sprite, glow);
        this.crew.push({ sprite, look, phase: (seed % 97) / 13 + i * 1.7, glow });
      });
    }
  }

  update(): void {
    const t = performance.now() / 1000;
    const cam = this.game.camera.position;
    const night = this.game.sky.night;
    for (const h of this.crew) {
      const near = h.sprite.position.distanceToSquared(cam) < SHOW * SHOW;
      h.sprite.visible = near;
      h.glow.visible = near;
      if (!near) continue;
      const beat = t * 6 + h.phase;
      const frame = Math.sin(t * 0.37 + h.phase) > 0.85 ? 2 : Math.floor(beat) % 2;
      h.sprite.material = this.mats[h.look][frame];
      h.glow.scale.setScalar(1.6 + 0.6 * night + 0.25 * Math.sin(beat * 1.7));
    }
    this.syncHack(t);
  }

  private syncHack(t: number): void {
    const a = this.game.activities.active;
    const inst = a?.def.kind === 'hack' ? (a.inst as HackInstance) : null;
    if (inst !== this.hack) {
      for (const o of this.orbs) {
        this.root.remove(o.group);
        o.group.traverse((n) => {
          if (n instanceof THREE.Mesh && n.geometry !== this.orbGeo) n.geometry.dispose();
          const m = (n as THREE.Mesh).material as THREE.SpriteMaterial | undefined;
          if (m?.map !== this.orbGlow.map) m?.map?.dispose();
          m?.dispose();
        });
      }
      this.orbs = inst ? inst.commits.map((c) => this.orb(c.p, c.hash)) : [];
      this.hack = inst;
    }
    if (!inst) return;
    inst.commits.forEach((c, i) => {
      const o = this.orbs[i];
      o.core.rotation.y = t * 2 + i;
      o.core.position.y = Math.sin(t * 2.4 + i) * 0.35;
      if (c.taken) o.gone = Math.min(1, o.gone + 0.06);
      o.group.scale.setScalar(1 + o.gone * 1.8);
      o.group.visible = o.gone < 1;
      for (const child of o.group.children) {
        const m = (child as THREE.Mesh).material as THREE.Material;
        if (o.gone > 0) {
          m.transparent = true;
          m.opacity = 1 - o.gone;
        }
      }
    });
  }

  private orb(p: Vec3, hash: string): Orb {
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    group.name = `commit-${hash}`;
    const core = new THREE.Mesh(this.orbGeo, this.orbMat.clone());
    const halo = new THREE.Sprite(this.orbGlow.clone());
    halo.scale.setScalar(7);
    const label = hashLabel(hash);
    label.position.y = 3.2;
    const ground = this.game.world.groundAt(p.x, p.z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, p.y - ground, 6, 1, true), this.beamMat.clone());
    beam.position.y = -(p.y - ground) / 2;
    group.add(core, halo, label, beam);
    this.root.add(group);
    return { group, core, gone: 0 };
  }
}

let hackers: Hackers;

export const system: GameSystem = {
  id: 'hackers',
  order: 40,
  init(game) {
    hackers = new Hackers(game);
  },
  update() {
    hackers.update();
  },
};
