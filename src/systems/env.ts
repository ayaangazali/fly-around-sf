import * as THREE from 'three';
import type { Game, GameSystem, Quality } from '../game';
import { sunPosition } from '../core/sun';
import { ORIGIN } from '../core/geo';
import { parseGreen, parseStars, parseStreets, parseTrees, type Polyline } from '../world/env-data';
import { Landcover, patchGround } from '../world/landcover';
import { buildRoads, createRoadMaterial, resample, roadMesh, ROAD } from '../world/streets';
import { buildTreeTiles, createTreeMaterial, plantTrees, setTreeLod, type Density, type TreeTile } from '../world/trees';
import { createWaterMaterial, waterTexture, type WaterUniforms } from '../world/water';
import { envUniforms, KARL_GLSL, patchFogChunks, solarHour, visibility } from '../world/karl';
import './env.css';

export type TimeMode = 'real' | 'golden' | 'noon' | 'night';

export interface EnvTier {
  trees: Density;
  treeDist: number;
  treeLod: number;
  roadDist: number;
  lampDist: number;
  cell: number;
  roadStep: number;
  karlSteps: number;
  waterDetail: number;
  treeShadows: boolean;
}

export const TIERS: Record<Quality, EnvTier> = {
  low: { trees: { street: 0.3, wood: 0.18, grass: 0.012, scrub: 0.03 }, treeDist: 1400, treeLod: 350, roadDist: 2600, lampDist: 3500, cell: 16, roadStep: 16, karlSteps: 3, waterDetail: 0, treeShadows: false },
  medium: { trees: { street: 0.65, wood: 0.45, grass: 0.035, scrub: 0.09 }, treeDist: 2600, treeLod: 550, roadDist: 4500, lampDist: 7000, cell: 8, roadStep: 10, karlSteps: 5, waterDetail: 1, treeShadows: false },
  high: { trees: { street: 1, wood: 0.75, grass: 0.06, scrub: 0.15 }, treeDist: 4000, treeLod: 800, roadDist: 7000, lampDist: 12000, cell: 8, roadStep: 8, karlSteps: 6, waterDetail: 1, treeShadows: true },
};

const DAY = 86400000;
const TREE_TILE = 1500;

export function modeTarget(mode: TimeMode, ref: Date): Date | null {
  if (mode === 'real') return null;
  const dayStart = ref.getTime() - solarHour(ref, ORIGIN.lon) * 3600000;
  const alt = (t: number) => sunPosition(new Date(t), ORIGIN.lat, ORIGIN.lon).altitude * (180 / Math.PI);
  if (mode === 'night') return new Date(dayStart + 22 * 3600000);
  let best = dayStart + DAY / 2;
  for (let t = dayStart + 9 * 3600000; t < dayStart + 15 * 3600000; t += 120000) if (alt(t) > alt(best)) best = t;
  if (mode === 'noon') return new Date(best);
  for (let t = best; t < best + DAY / 2; t += 60000) if (alt(t) < 6) return new Date(t);
  return new Date(best);
}

const LAMP_VERT = /* glsl */ `
#define KARL_STEPS 3
attribute float aSeed;
uniform float uNight, uPx, uScale, uFar, uFogNear, uFogFar;
varying vec3 vColor;
varying float vAlpha;
${KARL_GLSL}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = clamp(uScale * 7.0 / max(dist, 1.0), 1.7 * uPx, 30.0 * uPx);
  vColor = aSeed < 0.68 ? vec3(1.0, 0.82, 0.58) : aSeed < 0.9 ? vec3(1.0, 0.64, 0.3) : vec3(0.88, 0.93, 1.0);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar * 1.15, dist);
  vAlpha = smoothstep(0.08, 0.6, uNight) * (1.0 - smoothstep(uFar * 0.7, uFar, dist)) * fog * exp(-karlDepth(cameraPosition, position) * 0.8);
}`;

const LAMP_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (exp(-r * r * 9.0) * 1.2 + exp(-r * r * 2.5) * 0.25) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

export interface EnvStats {
  calls: number;
  triangles: number;
  roadTiles: number;
  roadMeters: number;
  trees: number;
  lamps: number;
  visibleTreeTiles: number;
  visibleRoadTiles: number;
}

class Env {
  readonly group = new THREE.Group();
  readonly tier: EnvTier;
  roads: THREE.Mesh[] = [];
  trees: TreeTile[] = [];
  lamps!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  cover!: Landcover;
  roadMeters = 0;
  treeCount = 0;
  readonly time = { value: 0 };
  readonly nightRef = { value: 0 };
  readonly water: WaterUniforms;
  private pinned: { key: string; at: number | null } | null = null;

  constructor(readonly game: Game) {
    this.tier = TIERS[game.opts.quality];
    this.group.name = 'env';
    this.water = {
      uTime: this.time,
      uNight: { value: 0 },
      uHorizon: { value: game.sky.colors.horizon },
      uZenith: { value: game.sky.colors.zenith },
      uGlintDir: { value: new THREE.Vector3(0, 1, 0) },
      uGlint: { value: new THREE.Color() },
      uGlow: { value: game.sky.colors.glow },
      uDetail: { value: this.tier.waterDetail },
    };
  }

  async load(): Promise<void> {
    const g = this.game;
    const get = async (name: string) => {
      const res = await fetch(`${g.opts.base}data/${name}`);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      return res.arrayBuffer();
    };
    const [streets, green, trees, stars] = await Promise.all(['streets.bin', 'green.bin', 'trees.bin', 'stars.bin'].map(get));
    patchFogChunks(this.tier.karlSteps);
    g.sky.viewFar = g.camera.far;
    g.sky.setStars(parseStars(stars), g.renderer.getPixelRatio());
    const t = g.world.terrain;
    const cell = this.tier.cell;
    const span = { w: Math.ceil((t.w * t.cell) / cell), h: Math.ceil((t.h * t.cell) / cell) };
    this.cover = Landcover.rasterize(parseGreen(green), { ...span, cell, minX: t.minX, minZ: t.minZ });
    const terrain = g.world.root.getObjectByName('terrain') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | undefined;
    if (terrain) patchGround(terrain.material, this.cover.texture(), this.cover, this.nightRef);
    const water = g.world.root.getObjectByName('water') as THREE.Mesh | undefined;
    if (water) water.material = createWaterMaterial(this.water, waterTexture(t), t);

    const stride = ({ low: 3, medium: 2, high: 1 } as const)[g.opts.quality];
    const height = (x: number, z: number) => t.meshHeightAt(x, z, stride);
    const lines = parseStreets(streets);
    const built = buildRoads(lines, height, { step: this.tier.roadStep, tile: 2000, piece: 400 });
    const roadMat = createRoadMaterial(this.nightRef);
    const roadGroup = new THREE.Group();
    roadGroup.name = 'env:roads';
    for (const tile of built.tiles) roadGroup.add(roadMesh(tile, roadMat));
    this.roads = roadGroup.children as THREE.Mesh[];
    this.roadMeters = built.meters;
    this.lamps = this.makeLamps(built.lamps);

    const blocked = this.roadMask(lines);
    const city = g.world.city;
    const plants = plantTrees(parseTrees(trees), this.cover, this.densities(), (x, z) => {
      if (t.heightAt(x, z) < 0.8 || blocked[this.cover.index(x, z)]) return true;
      for (const b of city.near(x, z, 2)) if (!city.hidden[b] && city.contains(b, x, z)) return true;
      return false;
    });
    this.treeCount = plants.length;
    const treeMat = createTreeMaterial(this.time);
    this.trees = buildTreeTiles(plants, (x, z) => height(x, z), g.date().getMonth(), TREE_TILE, treeMat, this.tier.treeShadows && g.renderer.shadowMap.enabled);
    const treeGroup = new THREE.Group();
    treeGroup.name = 'env:trees';
    for (const tile of this.trees) treeGroup.add(...tile.meshes);

    this.group.add(roadGroup, treeGroup, this.lamps);
    g.world.root.add(this.group);
    g.sky.sky.onBeforeRender = () => this.frame();
    document.querySelector('#loading .loading-card')?.insertAdjacentHTML(
      'beforeend',
      '<p class="loading-credit">Streets, parks and street trees from DataSF. Land cover © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>. Stars from the Yale Bright Star Catalog.</p>',
    );
    this.applyTime();
    this.frame();
  }

  densities(): Density {
    const k = (this.tier.cell * this.tier.cell) / 100;
    const d = this.tier.trees;
    return { street: d.street, wood: Math.min(1, d.wood * k), grass: Math.min(1, d.grass * k), scrub: Math.min(1, d.scrub * k) };
  }

  roadMask(lines: Polyline[]): Uint8Array {
    const c = this.cover;
    const mask = new Uint8Array(c.w * c.h);
    for (const l of lines) {
      const r = ROAD[l.cls]?.half ?? 5;
      const reach = Math.ceil(r / c.cell);
      for (const p of resample(l.xs, l.zs, c.cell / 2)) {
        const i0 = Math.floor((p.x - c.minX) / c.cell);
        const j0 = Math.floor((p.z - c.minZ) / c.cell);
        for (let j = j0 - reach; j <= j0 + reach; j++) for (let i = i0 - reach; i <= i0 + reach; i++) if (i >= 0 && j >= 0 && i < c.w && j < c.h) mask[j * c.w + i] = 1;
      }
    }
    return mask;
  }

  makeLamps(data: Float32Array): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const n = data.length / 4;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set(data.subarray(i * 4, i * 4 + 3), i * 3);
      seed[i] = data[i * 4 + 3];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.computeBoundingSphere();
    const env = Object.fromEntries(Object.entries(envUniforms).map(([k, v]) => [k, { value: v }]));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNight: this.nightRef, uPx: { value: 1 }, uScale: { value: 800 }, uFar: { value: this.tier.lampDist }, uFogNear: { value: 900 }, uFogFar: { value: 9000 }, ...env },
      vertexShader: LAMP_VERT,
      fragmentShader: LAMP_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'env:lamps';
    pts.frustumCulled = false;
    return pts;
  }

  applyTime(): void {
    const g = this.game;
    const mode = (g.save.data.settings.timeMode as TimeMode) ?? 'real';
    const clock = g.clock();
    const key = `${mode}:${Math.floor((clock.getTime() + (ORIGIN.lon / 15) * 3600000) / DAY)}`;
    if (this.pinned?.key !== key) this.pinned = { key, at: modeTarget(mode, clock)?.getTime() ?? null };
    g.timePin = this.pinned.at;
  }

  frame(): void {
    const g = this.game;
    const sky = g.sky;
    const now = g.date();
    this.time.value = (now.getTime() / 1000) % 3600;
    this.nightRef.value = sky.night;
    this.water.uNight.value = sky.night;
    const glint = this.water.uGlintDir.value;
    if (sky.sunDir.y > -0.02) {
      glint.copy(sky.sunDir);
      const dusk = Math.max(0, 1 - Math.abs(sky.elevation - 3) / 10);
      this.water.uGlint.value.setRGB(1, 0.9 - dusk * 0.3, 0.75 - dusk * 0.45);
    } else {
      glint.copy(sky.moonDir);
      this.water.uGlint.value.setRGB(0.3, 0.33, 0.4).multiplyScalar(sky.moonIllumination * (sky.moonDir.y > 0 ? 1 : 0));
    }
    const lu = this.lamps.material.uniforms;
    lu.uPx.value = g.renderer.getPixelRatio();
    lu.uScale.value = g.renderer.domElement.height / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
    lu.uFogNear.value = sky.fog.near;
    lu.uFogFar.value = sky.fog.far;
    this.lamps.visible = sky.night > 0.05;
    this.cull();
  }

  cull(): void {
    const p = this.game.flight.pos;
    const sky = this.game.sky;
    const fogFar = (sky.viewFar * 0.92) / sky.fogDensity;
    const far = Math.min(this.tier.roadDist, fogFar + 1000);
    for (const m of this.roads) {
      const s = m.geometry.boundingSphere!;
      m.visible = Math.hypot(s.center.x - p.x, s.center.z - p.z) - s.radius < far;
    }
    const tf = Math.min(this.tier.treeDist, fogFar);
    for (const t of this.trees) {
      const d = Math.hypot(t.cx - p.x, t.cz - p.z);
      const on = d < tf + TREE_TILE * 0.71;
      for (const m of t.meshes) m.visible = on;
      if (on) setTreeLod(t, d > this.tier.treeLod + TREE_TILE * 0.71);
    }
  }

  stats(): EnvStats {
    const info = this.game.renderer.info.render;
    return {
      calls: info.calls,
      triangles: info.triangles,
      roadTiles: this.roads.length,
      roadMeters: this.roadMeters,
      trees: this.treeCount,
      lamps: this.lamps.geometry.getAttribute('position').count,
      visibleTreeTiles: this.trees.filter((t) => t.meshes[0]?.visible).length,
      visibleRoadTiles: this.roads.filter((m) => m.visible).length,
    };
  }

  visibility(): number {
    const p = this.game.camera.position;
    return visibility(p.x, p.y, p.z, this.game.sky.karl, this.game.sky.fog.far);
  }
}

export const system: GameSystem & { env: Env | null } = {
  id: 'env',
  order: -10,
  env: null,
  async init(game) {
    const env = new Env(game);
    await env.load();
    system.env = env;
  },
  update() {
    system.env?.applyTime();
    system.env?.cull();
  },
};
