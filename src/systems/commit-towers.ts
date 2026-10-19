import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import snapshot from '../content/github-snapshot.json';
import { loadCards, type CardDef } from '../content/types';
import { cityUniforms } from '../world/city';

export interface TowerStat {
  card: string;
  orgs: string[];
  publicRepos: number;
  stars: number;
  commits30d: number;
  topRepo: string;
  topStars: number;
}

export interface Tower extends TowerStat {
  name: string;
  x: number;
  z: number;
  height: number;
  width: number;
  tier: number;
}

export const TIERS = [
  { min: 0, color: '#58a6ff', label: 'quiet' },
  { min: 50, color: '#3fb950', label: 'steady' },
  { min: 500, color: '#f2cc60', label: 'busy' },
  { min: 3000, color: '#ff7b72', label: 'blazing' },
];

export const towerHeight = (commits: number) => 40 + 46 * Math.log10(1 + commits);
export const towerWidth = (stars: number) => 8 + 3.2 * Math.log10(1 + stars);
export const towerTier = (commits: number) => TIERS.reduce((tier, t, i) => (commits >= t.min ? i : tier), 0);
export const fireflyCount = (commits: number) => Math.round(16 * Math.log10(1 + commits));

export function layoutTowers(stats: TowerStat[], cards: CardDef[], toLocal: (lat: number, lon: number) => { x: number; z: number }): Tower[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const towers: Tower[] = [];
  for (const s of stats) {
    const at = byId.get(s.card)?.at;
    if (!at) continue;
    const { x, z } = toLocal(at.lat, at.lon);
    towers.push({ ...s, name: byId.get(s.card)!.name, x, z, height: towerHeight(s.commits30d), width: towerWidth(s.stars), tier: towerTier(s.commits30d) });
  }
  const sites = new Map<string, Tower[]>();
  for (const t of towers) {
    const key = `${Math.round(t.x / 10)},${Math.round(t.z / 10)}`;
    sites.set(key, [...(sites.get(key) ?? []), t]);
  }
  for (const group of sites.values()) {
    const step = Math.max(...group.map((g) => g.width)) + 6;
    group.forEach((t, i) => (t.x += (i - (group.length - 1) / 2) * step));
  }
  return towers;
}

const LABEL_RANGE = 3200;
export const FLOAT = 28;

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

function label(t: Tower): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 632, 192, 28);
  ctx.fill();
  ctx.fillStyle = TIERS[t.tier].color;
  ctx.fillRect(4, 30, 10, 140);
  ctx.fillStyle = '#f6f3ec';
  ctx.font = '700 58px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(t.name, 40, 76);
  ctx.font = '500 34px ui-monospace, Menlo, monospace';
  ctx.fillStyle = TIERS[t.tier].color;
  ctx.fillText(`${t.commits30d.toLocaleString('en-US')} commits / ${snapshot.sinceDays} days`, 40, 128);
  ctx.fillStyle = 'rgba(246, 243, 236, 0.7)';
  ctx.fillText(`${t.publicRepos} public repos · ${compact(t.stars)} stars`, 40, 172);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  s.scale.set(64, 20, 1);
  s.name = `tower-label-${t.card}`;
  return s;
}

const towerShader = {
  vertex: `
    varying vec2 vUv;
    varying float vY;
    varying float vH;
    varying float vDist;
    varying vec3 vColor;
    void main() {
      vUv = uv;
      vY = position.y;
      vH = length(instanceMatrix[1].xyz);
      vColor = instanceColor;
      vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: `
    uniform float uTime;
    uniform float uNight;
    varying vec2 vUv;
    varying float vY;
    varying float vH;
    varying float vDist;
    varying vec3 vColor;
    void main() {
      float edge = smoothstep(0.86, 1.0, abs(vUv.x * 2.0 - 1.0));
      float y = vY * vH;
      float near = 1.0 - smoothstep(400.0, 1400.0, vDist);
      float scan = fract(y / 9.0 - uTime * 0.5);
      float rung = smoothstep(0.0, 0.06, scan) * (1.0 - smoothstep(0.06, 0.25, scan)) * near;
      float floors = step(0.95, fract(y / 12.0)) * near;
      float cap = smoothstep(0.92, 1.0, vY);
      float body = mix(0.2, 0.24, uNight) * (0.55 + 0.45 * (1.0 - vY));
      float a = body + edge * mix(0.5, 0.85, uNight) + rung * 0.35 + floors * 0.15 + cap * 0.3;
      a *= (1.0 - smoothstep(4500.0, 9000.0, vDist)) * smoothstep(15.0, 90.0, vDist);
      gl_FragColor = vec4(vColor * (0.8 + 0.8 * edge + 0.6 * rung + 0.5 * cap), min(a, 1.0));
    }`,
};

const fireflyShader = {
  vertex: `
    uniform float uTime;
    uniform float uScale;
    attribute vec4 aSeed;
    attribute float aTop;
    attribute vec3 aColor;
    varying float vA;
    varying vec3 vColor;
    void main() {
      float h = aTop + 35.0;
      float y = mod(aSeed.z * h + uTime * aSeed.w, h);
      vec3 p = position + vec3(aSeed.x + sin(uTime * 0.7 + aSeed.z * 20.0) * 1.6, y, aSeed.y + cos(uTime * 0.6 + aSeed.z * 17.0) * 1.6);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vA = (1.0 - y / h) * (1.0 - smoothstep(3000.0, 6000.0, -mv.z));
      vColor = aColor;
      gl_PointSize = clamp(uScale * 2.6 / -mv.z, 3.0, 30.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: `
    varying float vA;
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vColor * 1.4, smoothstep(0.5, 0.05, d) * vA);
    }`,
};

export class CommitTowers {
  readonly root = new THREE.Group();
  readonly towers: Tower[];
  readonly mesh: THREE.InstancedMesh;
  readonly fireflies: THREE.Points;
  readonly labels: THREE.Sprite[] = [];
  private uniforms = { uTime: { value: 0 }, uNight: cityUniforms.uNight, uScale: { value: 400 } };

  constructor(private game: Game) {
    this.root.name = 'commit-towers';
    this.towers = layoutTowers(snapshot.towers, loadCards(), (lat, lon) => game.world.toLocal(lat, lon));
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: towerShader.vertex, fragmentShader: towerShader.fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.towers.length);
    this.mesh.name = 'commit-tower-mesh';
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    const seeds: number[] = [];
    const base: number[] = [];
    const tops: number[] = [];
    const colors: number[] = [];
    const tether: number[] = [];
    this.towers.forEach((t, i) => {
      const roof = game.world.groundAt(t.x, t.z);
      const y = roof + FLOAT;
      m.makeScale(t.width, t.height, t.width).setPosition(t.x, y, t.z);
      tether.push(t.x, roof, t.z, t.x, y, t.z);
      this.mesh.setMatrixAt(i, m);
      color.set(TIERS[t.tier].color);
      this.mesh.setColorAt(i, color);
      const l = label(t);
      l.position.set(t.x, y + t.height + 16, t.z);
      this.labels.push(l);
      for (let k = 0; k < fireflyCount(t.commits30d); k++) {
        base.push(t.x, roof, t.z);
        seeds.push((Math.random() - 0.5) * t.width * 1.6, (Math.random() - 0.5) * t.width * 1.6, Math.random(), 6 + Math.random() * 10);
        tops.push(t.height + FLOAT);
        colors.push(color.r, color.g, color.b);
      }
    });
    this.mesh.computeBoundingSphere();
    const pts = new THREE.BufferGeometry();
    pts.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
    pts.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
    pts.setAttribute('aTop', new THREE.Float32BufferAttribute(tops, 1));
    pts.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    this.fireflies = new THREE.Points(pts, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: fireflyShader.vertex, fragmentShader: fireflyShader.fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fireflies.name = 'commit-fireflies';
    this.fireflies.frustumCulled = false;
    const lines = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tether, 3));
    const tethers = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: '#9fe6b0', transparent: true, opacity: 0.35, depthWrite: false }));
    tethers.name = 'commit-tethers';
    this.root.add(this.mesh, this.fireflies, tethers, ...this.labels);
    game.scene.add(this.root);
  }

  update(): void {
    const cam = this.game.camera;
    this.uniforms.uTime.value = performance.now() / 1000;
    this.uniforms.uScale.value = this.game.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const mat = this.mesh.material as THREE.ShaderMaterial;
    const blending = this.uniforms.uNight.value > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (mat.blending !== blending) {
      mat.blending = blending;
      mat.needsUpdate = true;
    }
    for (const l of this.labels) {
      const d = l.position.distanceTo(cam.position);
      l.visible = d < LABEL_RANGE;
      l.scale.set(120, 37.5, 1).multiplyScalar(Math.min(1.8, Math.max(0.12, d / 650)));
    }
  }
}

let towers: CommitTowers;

export const system: GameSystem = {
  id: 'commit-towers',
  order: 30,
  init(game) {
    towers = new CommitTowers(game);
  },
  update() {
    towers.update();
  },
};
