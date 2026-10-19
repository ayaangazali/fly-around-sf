import * as THREE from 'three';
import type { PropType } from '../../activities/minigame';

const mats = new Map<string, THREE.Material>();

function std(color: string, rough = 0.7, metal = 0): THREE.Material {
  const key = `s${color}${rough}${metal}`;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}

function glow(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

let haloTex: THREE.Texture | null = null;

function halo(color: string, size: number): THREE.Sprite {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.setScalar(size);
  s.userData.halo = true;
  return s;
}

function cableCar(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(box(2.5, 1.1, 8.4), std('#7d1d2c'), 0, 0.95, 0),
    mesh(box(2.4, 1.2, 5.2), std('#efe3c4'), 0, 2.05, 0),
    mesh(box(2.42, 0.55, 5.0), std('#26313b', 0.3, 0.4), 0, 2.15, 0),
    mesh(box(2.7, 0.2, 8.8), std('#4b4f54'), 0, 2.8, 0),
    mesh(box(2.5, 0.12, 8.4), std('#c9a85b', 0.4, 0.6), 0, 1.5, 0),
  );
  for (const z of [-3.6, 3.6]) for (const x of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3), std('#c9a85b', 0.3, 0.8), x, 2.1, z));
  return g;
}

function streetcar(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(box(2.7, 1.3, 14), std('#e8742c'), 0, 1.1, 0),
    mesh(box(2.65, 1.1, 13.6), std('#f1e6cc'), 0, 2.3, 0),
    mesh(box(2.67, 0.6, 12.6), std('#24303a', 0.3, 0.4), 0, 2.35, 0),
    mesh(new THREE.CylinderGeometry(1.35, 1.35, 13.4, 16, 1, false, 0, Math.PI), std('#e8742c'), 0, 2.85, 0).rotateX(Math.PI / 2).rotateZ(Math.PI / 2),
    mesh(box(0.08, 1.6, 0.08), std('#222'), 0, 4.2, 3),
  );
  return g;
}

function ferry(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Shape();
  hull.moveTo(-5, 18);
  hull.quadraticCurveTo(0, 24, 5, 18);
  hull.lineTo(5, -18);
  hull.lineTo(-5, -18);
  hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 3, bevelEnabled: false });
  hg.rotateX(Math.PI / 2);
  hg.translate(0, 3, 0);
  const h = mesh(hg, std('#f4f4f2', 0.5));
  h.rotation.y = Math.PI;
  g.add(
    h,
    mesh(box(10.1, 0.6, 36), std('#1d3d6e'), 0, 0.9, 0),
    mesh(box(8.6, 2.6, 24), std('#f4f4f2', 0.5), 0, 4.3, 2),
    mesh(box(8.7, 1, 23.6), std('#2b3c4d', 0.2, 0.5), 0, 4.6, 2),
    mesh(box(6.6, 2.2, 12), std('#f4f4f2', 0.5), 0, 6.7, 4),
    mesh(box(6.7, 0.8, 11.6), std('#2b3c4d', 0.2, 0.5), 0, 6.9, 4),
    mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.5), std('#1d3d6e'), 0, 8.8, 7),
  );
  return g;
}

function jet(): THREE.Group {
  const g = new THREE.Group();
  const navy = std('#0b2a5b', 0.35, 0.3);
  const gold = std('#f2c230', 0.4, 0.2);
  const body = mesh(new THREE.CylinderGeometry(0.9, 0.7, 13, 14), navy);
  body.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.ConeGeometry(0.9, 4, 14), navy, 0, 0, -8.5);
  nose.rotation.x = -Math.PI / 2;
  const canopy = mesh(new THREE.SphereGeometry(0.7, 12, 8), std('#9fb8d0', 0.1, 0.6), 0, 0.75, -4.5);
  canopy.scale.set(0.9, 0.7, 2.4);
  const wing = new THREE.Shape();
  wing.moveTo(0, -2);
  wing.lineTo(6.2, 1.8);
  wing.lineTo(6.2, 3.2);
  wing.lineTo(0, 3.6);
  wing.closePath();
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.18, bevelEnabled: false });
  wg.rotateX(Math.PI / 2);
  const wl = mesh(wg, navy);
  const wr = mesh(wg.clone().scale(-1, 1, 1), navy);
  const tipL = mesh(box(0.3, 0.2, 1.4), gold, 6.2, 0, 2.5);
  const tipR = mesh(box(0.3, 0.2, 1.4), gold, -6.2, 0, 2.5);
  const stripe = mesh(box(1.9, 0.05, 9), gold, 0, 0.92, 0);
  for (const s of [-1, 1]) {
    const fin = mesh(box(0.15, 2.6, 2.4), navy, s * 1.3, 1.5, 5.4);
    fin.rotation.z = s * 0.35;
    g.add(fin);
  }
  g.add(body, nose, canopy, wl, wr, tipL, tipR, stripe, halo('#ffd27a', 6).translateZ(7.2));
  return g;
}

function sailboat(): THREE.Group {
  const g = new THREE.Group();
  const sail = new THREE.Shape();
  sail.moveTo(0, 0);
  sail.lineTo(0, 11);
  sail.lineTo(4.5, 0.5);
  sail.closePath();
  const s = mesh(new THREE.ShapeGeometry(sail), new THREE.MeshStandardMaterial({ color: '#fbfaf5', side: THREE.DoubleSide }), 0, 1.6, 0.5);
  s.rotation.y = Math.PI / 2;
  g.add(mesh(box(2.4, 1.2, 9), std('#f2f2ee'), 0, 0.6, 0), mesh(new THREE.CylinderGeometry(0.08, 0.08, 12), std('#9a9a9a', 0.3, 0.7), 0, 7, 0), s);
  return g;
}

const BIRDS: Record<string, [string, string, string, number]> = {
  seagull: ['#f2f2ee', '#9aa3ab', '#222', 1.4],
  pelican: ['#8a7a68', '#6b5d4f', '#3a332c', 2.2],
  falcon: ['#5b6670', '#3d464f', '#f0e6d2', 1.1],
  parrot: ['#3fae4a', '#2f8a39', '#d6262b', 0.7],
  raven: ['#16181b', '#0f1113', '#2b2f35', 1.2],
};

function bird(type: string): THREE.Group {
  const [body, wingC, tip, span] = BIRDS[type];
  const g = new THREE.Group();
  const scale = 2.2;
  const b = mesh(new THREE.SphereGeometry(0.22, 12, 8), std(body), 0, 0, 0);
  b.scale.set(1, 0.85, 2.6);
  const head = mesh(new THREE.SphereGeometry(0.16, 10, 8), std(type === 'parrot' ? tip : body), 0, 0.12, -0.55);
  const beak = mesh(new THREE.ConeGeometry(0.05, type === 'pelican' ? 0.6 : 0.18, 6), std(type === 'pelican' ? '#e0a93c' : '#e8b23a'), 0, 0.08, type === 'pelican' ? -0.95 : -0.75);
  beak.rotation.x = -Math.PI / 2;
  const tail = mesh(box(0.3, 0.04, 0.4), std(wingC), 0, 0, 0.6);
  g.add(b, head, beak, tail);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const w = mesh(box(span / 2, 0.04, 0.38), std(wingC), (s * span) / 4, 0, 0);
    const t = mesh(box(span / 6, 0.045, 0.3), std(tip), (s * span) / 2.2, 0, 0.04);
    pivot.add(w, t);
    pivot.userData.side = s;
    wings.push(pivot);
    g.add(pivot);
  }
  g.userData.wings = wings;
  g.scale.setScalar(scale);
  const outer = new THREE.Group();
  outer.add(g, halo('#ffffff', 3.5));
  outer.userData.wings = wings;
  return outer;
}

function collectible(core: THREE.Object3D, color: string): THREE.Group {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(core);
  spin.userData.spin = true;
  g.add(spin, halo(color, 7));
  return g;
}

function fortuneCookie(): THREE.Group {
  const c = mesh(new THREE.TorusGeometry(0.9, 0.42, 10, 24, Math.PI * 1.15), std('#d9a24a', 0.55));
  c.scale.set(1, 1, 0.55);
  c.rotation.z = Math.PI * 0.92;
  const slip = mesh(box(1.6, 0.25, 0.02), std('#ffffff'), 0.2, -0.2, 0);
  const g = new THREE.Group();
  g.add(c, slip);
  g.scale.setScalar(1.8);
  return collectible(g, '#ffcf73');
}

function fogWisp(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#f4f7fa', transparent: true, opacity: 0.72, roughness: 1 });
  for (const [x, y, z, r] of [
    [0, 0, 0, 1.6],
    [1.5, 0.3, 0.2, 1.1],
    [-1.4, 0.1, -0.3, 1.2],
    [0.4, 0.8, -0.6, 0.9],
  ]) g.add(mesh(new THREE.SphereGeometry(r, 12, 10), m, x, y, z));
  return collectible(g, '#dfe9ff');
}

function sourdough(): THREE.Group {
  const g = new THREE.Group();
  const loaf = mesh(new THREE.SphereGeometry(1, 18, 12), std('#b8783a', 0.8));
  loaf.scale.set(1.5, 0.75, 1);
  g.add(loaf);
  for (const z of [-0.45, 0, 0.45]) {
    const cut = mesh(box(1.6, 0.06, 0.14), std('#ead2a4', 0.9), 0, 0.72, z);
    cut.rotation.y = 0.5;
    g.add(cut);
  }
  g.scale.setScalar(1.3);
  return collectible(g, '#ffd08a');
}

function coffee(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.CylinderGeometry(0.9, 0.7, 2.4, 16), std('#f5f2ea', 0.6)),
    mesh(new THREE.CylinderGeometry(0.93, 0.85, 0.8, 16), std('#7a4a2a', 0.8), 0, 0.1, 0),
    mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 16), std('#ffffff', 0.4), 0, 1.25, 0),
  );
  return collectible(g, '#ffe0b0');
}

function leaf(): THREE.Group {
  const s = new THREE.Shape();
  s.moveTo(0, -1.4);
  s.quadraticCurveTo(1.2, 0, 0, 1.4);
  s.quadraticCurveTo(-1.2, 0, 0, -1.4);
  const g = new THREE.Group();
  g.add(mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: '#d9822b', side: THREE.DoubleSide })));
  g.scale.setScalar(1.4);
  return collectible(g, '#ffb860');
}

function parcel(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(1.4, 1, 1.4), std('#c79d63', 0.9)), mesh(box(1.42, 1.02, 0.25), std('#e9dcc3', 0.9)), mesh(box(0.25, 1.02, 1.42), std('#e9dcc3', 0.9)));
  return collectible(g, '#ffd27a');
}

function pad(): THREE.Group {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#2a2f36';
  ctx.beginPath();
  ctx.arc(128, 128, 126, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2f2ee';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffc15e';
  ctx.font = 'bold 130px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 128, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.12;
  top.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.035, 8, 64), glow('#7de0a6', 0.9));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.16;
  rim.userData.glow = true;
  const g = new THREE.Group();
  g.add(top, rim);
  return g;
}

function zone(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), glow('#b48cff', 0.12));
  shell.userData.glow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 8, 64), glow('#b48cff', 0.9));
  ring.rotation.x = Math.PI / 2;
  ring.userData.glow = true;
  const ring2 = ring.clone();
  ring2.rotation.set(0, 0, 0);
  g.add(shell, ring, ring2);
  return g;
}

const BUILD: Record<PropType, () => THREE.Object3D> = {
  'cable-car': cableCar,
  streetcar,
  ferry,
  jet,
  sailboat,
  seagull: () => bird('seagull'),
  pelican: () => bird('pelican'),
  falcon: () => bird('falcon'),
  parrot: () => bird('parrot'),
  raven: () => bird('raven'),
  'fortune-cookie': fortuneCookie,
  'fog-wisp': fogWisp,
  sourdough,
  coffee,
  leaf,
  parcel,
  pad,
  zone,
};

export function buildProp(type: PropType): THREE.Object3D {
  const o = BUILD[type]();
  o.userData.type = type;
  return o;
}

const ON = new THREE.Color('#7de0a6');
const OFF = new THREE.Color('#b48cff');

export function animateProp(o: THREE.Object3D, t: number, on: boolean): void {
  const wings = o.userData.wings as THREE.Object3D[] | undefined;
  if (wings) for (const w of wings) w.rotation.z = Math.sin(t * 9 + (o.position.x % 5)) * 0.55 * w.userData.side;
  const type = o.userData.type as PropType;
  if (type === 'pad' || type === 'zone') {
    for (const c of o.children) {
      if (!c.userData.glow) continue;
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (type === 'zone') m.color.copy(on ? ON : OFF);
      else m.opacity = on ? 0.6 + 0.35 * Math.sin(t * 4) : 0.35;
    }
    if (type === 'zone') o.rotation.y = t * 0.6;
  }
  for (const c of o.children) if (c.userData.spin) c.rotation.y = t * 1.4;
}
