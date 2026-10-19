import * as THREE from 'three';
import { Bus } from './core/bus';
import { SaveStore } from './core/save';
import { Input, type Action } from './core/input';
import { toLocal } from './core/geo';
import { Terrain } from './world/terrain';
import { CityData } from './world/city-data';
import { CityRenderer } from './world/city';
import { SkySystem } from './world/sky';
import { World, type Landmark } from './world/world';
import { createFlight, stepFlight, type FlightState, type Vec3, type FlightEnv } from './player/flight';
import { createDroneModel, animateDrone, type DroneModel } from './player/drone-model';
import { ChaseCamera } from './player/camera';
import { ActivityRunner } from './activities/runner';
import type { ActivityDef, ActivityKind } from './activities/types';
import { Hud } from './ui/hud';
import { PanelHost, type Panel } from './ui/panel-host';

export type Quality = 'low' | 'medium' | 'high';

export interface GameOptions {
  test: boolean;
  time: Date | null;
  spawn: { lat: number; lon: number; yaw: number } | null;
  quality: Quality;
  room: string | null;
  cityRadius: number;
  base: string;
}

export interface GameSystem {
  id: string;
  order?: number;
  init?(game: Game): void | Promise<void>;
  update?(dt: number, game: Game): void;
}

export const SPAWN = { lat: 37.8066, lon: -122.4318, yaw: 1.22, alt: 24 };

const QUALITY = {
  low: { pixelRatio: 1, shadow: 0, stride: 3, far: 6000 },
  medium: { pixelRatio: 1.5, shadow: 1024, stride: 2, far: 10000 },
  high: { pixelRatio: 2, shadow: 2048, stride: 1, far: 14000 },
} as const;

export function parseOptions(search: string, base = './'): GameOptions {
  const q = new URLSearchParams(search);
  const spawn = q.get('spawn')?.split(',').map(Number);
  const t = q.get('time');
  const quality = q.get('quality');
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820;
  return {
    test: q.has('test'),
    time: t && !Number.isNaN(Date.parse(t)) ? new Date(t) : q.has('test') ? new Date('2026-10-19T19:30:00Z') : null,
    spawn: spawn && spawn.length >= 2 && spawn.every(Number.isFinite) ? { lat: spawn[0], lon: spawn[1], yaw: spawn[2] ?? 0 } : null,
    quality: quality === 'low' || quality === 'medium' || quality === 'high' ? quality : q.has('test') ? 'low' : touch ? 'medium' : 'high',
    room: q.get('room'),
    cityRadius: Number(q.get('cityRadius')) || 0,
    base,
  };
}

export class Game {
  readonly bus = new Bus();
  readonly save = new SaveStore();
  readonly input: Input;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly activities: ActivityRunner;
  readonly hud: Hud;
  readonly panels: PanelHost;
  readonly cityRenderer = new CityRenderer();
  readonly drone: DroneModel;
  readonly chase: ChaseCamera;
  readonly systems: GameSystem[] = [];
  sky!: SkySystem;
  world!: World;
  flight: FlightState;
  env: FlightEnv;
  waypoint: (Vec3 & { label: string }) | null = null;
  simTime = 0;
  clockOffset = 0;
  timeScale = 1;
  timePin: number | null = null;
  autoSim: boolean;
  running = false;
  loaded = false;
  private acc = 0;
  private last = 0;
  private throttle = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly ui: HTMLElement,
    readonly opts: GameOptions,
  ) {
    const q = QUALITY[opts.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: opts.test });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, q.far);
    this.input = new Input(window);
    this.autoSim = !opts.test;
    const s = opts.spawn ?? SPAWN;
    const { x, z } = toLocal(s.lat, s.lon);
    this.flight = createFlight(x, 40, z, s.yaw);
    this.env = { groundAt: () => 0, collide: () => false };
    this.drone = createDroneModel();
    this.scene.add(this.drone.root);
    this.chase = new ChaseCamera(this.camera);
    this.activities = new ActivityRunner(this);
    this.hud = new Hud(this);
    this.panels = new PanelHost(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  clock(): Date {
    const base = this.opts.time ? this.opts.time.getTime() : Date.now();
    return new Date(base + this.clockOffset + (this.opts.time ? this.simTime * 1000 * this.timeScale : 0));
  }

  date(): Date {
    return this.timePin === null ? this.clock() : new Date(this.timePin);
  }

  async load(onProgress: (frac: number, label: string) => void): Promise<void> {
    const fetchBin = async (name: string, from: number, to: number) => {
      const res = await fetch(`${this.opts.base}data/${name}`);
      if (!res.ok || !res.body) throw new Error(`${name}: HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        if (total) onProgress(from + ((to - from) * got) / total, `Downloading ${name}`);
      }
      const out = new Uint8Array(got);
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.length;
      }
      return out.buffer;
    };
    onProgress(0, 'Downloading terrain');
    const terrain = Terrain.parse(await fetchBin('terrain.bin', 0, 0.15));
    const cityBuf = await fetchBin('city.bin', 0.15, 0.6);
    onProgress(0.6, 'Reading 172,000 buildings');
    const city = new CityData(cityBuf, (x, z) => Math.max(0, terrain.heightAt(x, z)));
    this.world = new World(terrain, city);
    this.env = { groundAt: (x, z) => (this.world.isWater(x, z) ? -1 : this.world.surfaceAt(x, z)), collide: (p, r) => this.world.collide(p, r) };

    const landmarks = Object.values(import.meta.glob<Landmark>('./world/landmarks/*.ts', { eager: true, import: 'landmark' }));
    city.applyExclusions(landmarks.flatMap((l) => l.exclusions ?? []));

    this.sky = new SkySystem(this.scene, QUALITY[this.opts.quality].shadow);
    this.scene.add(this.world.root);
    this.world.root.add(terrain.buildMesh(QUALITY[this.opts.quality].stride));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: '#3f7891' }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.name = 'water';
    water.receiveShadow = true;
    this.world.root.add(water);
    this.world.root.add(this.cityRenderer.group);
    for (const l of landmarks) l.build(this);

    const kinds = Object.values(import.meta.glob<ActivityKind>('./activities/kinds/*.ts', { eager: true, import: 'kind' }));
    const defs = (await Promise.all(Object.values(import.meta.glob<ActivityDef[]>('./content/activities/**/*.json', { import: 'default' })).map((f) => f()))).flat();
    const errors = this.activities.register(kinds, defs);
    if (errors.length) console.warn(`content errors:\n${errors.join('\n')}`);

    const s = this.opts.spawn ?? SPAWN;
    const saved = this.save.data.pos;
    if (saved && !this.opts.spawn && !this.opts.test) this.teleport({ x: saved[0], y: saved[1], z: saved[2] }, saved[3]);
    else {
      const p = this.world.point({ lat: s.lat, lon: s.lon, alt: SPAWN.alt });
      this.teleport(p, s.yaw);
    }

    if (this.opts.cityRadius > 0) {
      const { x, z } = this.flight.pos;
      for (let b = 0; b < city.count; b++) if (Math.hypot(city.cx[b] - x, city.cz[b] - z) > this.opts.cityRadius) city.hidden[b] = 1;
    }
    onProgress(0.65, 'Raising the skyline');
    const cityDone = this.cityRenderer.build(city, this.flight.pos.x, this.flight.pos.z);
    const systems = Object.values(import.meta.glob<GameSystem>('./systems/*.ts', { eager: true, import: 'system' }));
    systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const sys of systems) {
      try {
        await sys.init?.(this);
        this.systems.push(sys);
      } catch (e) {
        console.error(`system ${sys.id} failed to init`, e);
      }
    }
    this.panels.register(Object.values(import.meta.glob<Panel>('./ui/panels/*.ts', { eager: true, import: 'panel' })));
    this.save.data.stats.sessions++;
    this.save.persist();
    await cityDone;
    onProgress(1, 'Ready');
    this.loaded = true;
  }

  teleport(p: Vec3, yaw?: number): void {
    this.flight.pos = { ...p };
    this.flight.vel = { x: 0, y: 0, z: 0 };
    if (yaw !== undefined) this.flight.yaw = yaw;
    this.chase.snap();
  }

  toast(text: string, kind: 'info' | 'reward' | 'warn' = 'info'): void {
    this.bus.emit('toast', { text, kind });
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  handleActions(): void {
    const map: [Action, () => void][] = [
      ['view', () => this.toast(`Camera: ${this.chase.cycle()}`)],
      ['menu', () => (this.panels.openId ? this.panels.close() : this.panels.open('menu'))],
      ['interact', () => this.interact()],
      ['cycle', () => this.activities.cycleNearby()],
    ];
    for (const [action, fn] of map) if (this.input.consume(action)) fn();
    for (const p of this.panels.list()) if (p.action && this.input.consume(p.action)) this.panels.toggle(p.id);
  }

  interact(): void {
    this.bus.emit('interact', {});
    const near = this.activities.nearby;
    if (!this.activities.active && near && this.activities.start(near.id)) this.toast(`${near.title}: go!`);
  }

  step(dt: number): void {
    if (!this.loaded) return;
    this.simTime += dt;
    this.handleActions();
    const input = this.panels.openId ? { forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false } : this.input.flight();
    const res = stepFlight(this.flight, input, dt, this.env);
    this.throttle = Math.abs(input.forward) + Math.abs(input.lift) + Math.abs(input.strafe);
    const st = this.save.data.stats;
    st.flightTime += dt;
    st.distance += Math.hypot(this.flight.vel.x, this.flight.vel.z) * dt;
    if (res.impact) {
      st.crashes++;
      this.bus.emit('player:crash', { speed: res.impact });
    }
    if (res.splashed) this.bus.emit('player:splash', {});
    this.activities.update(dt);
    for (const s of this.systems) s.update?.(dt, this);
    this.input.clearPressed();
  }

  render(dt: number): void {
    const focus = new THREE.Vector3(this.flight.pos.x, this.flight.pos.y, this.flight.pos.z);
    this.sky?.update(this.date(), focus);
    this.drone.root.position.copy(focus);
    this.drone.root.rotation.y = this.flight.yaw;
    animateDrone(this.drone, performance.now() / 1000, this.throttle, this.flight.pitch, this.flight.roll);
    this.drone.root.visible = this.chase.mode !== 'fpv';
    if (this.world) this.chase.update(this.flight, dt, (x, z) => this.world.groundAt(x, z), !!this.save.data.settings.reducedMotion);
    this.renderer.render(this.scene, this.camera);
    this.hud.update();
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.autoSim) {
        this.acc += dt;
        while (this.acc >= 1 / 60) {
          this.step(1 / 60);
          this.acc -= 1 / 60;
        }
      }
      this.render(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    window.setInterval(() => {
      if (!this.loaded || this.opts.test) return;
      const p = this.flight.pos;
      this.save.data.pos = [p.x, p.y, p.z, this.flight.yaw];
      this.save.persist();
    }, 5000);
  }
}
