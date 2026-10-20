import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SkySystem, skyColors } from '../../src/world/sky';
import { moonIllumination, moonPosition, directionFrom, horizontal, siderealTime } from '../../src/world/moon';
import { envUniforms, eveningFactor, karlDensity, karlMask, karlState, karlTop, noise, noiseTexture, patchFogChunks, solarHour, visibility, KARL_SOFT } from '../../src/world/karl';
import { CITY_FRAGMENT, CITY_VERTEX, createCityMaterial, patch } from '../../src/world/city-shader';
import { buildingInfo } from '../../src/world/city-mesh';
import { modeTarget, TIERS } from '../../src/systems/env';
import { sunPosition } from '../../src/core/sun';
import { ORIGIN, toLocal } from '../../src/core/geo';

const DEG = 180 / Math.PI;

describe('sky', () => {
  it('[R-ENV-SKY] palette blends continuously from night to noon', () => {
    const out = { zenith: new THREE.Color(), horizon: new THREE.Color(), glow: new THREE.Color(), cloud: new THREE.Color(), karl: new THREE.Color() };
    let prev = skyColors(-60, out).horizon.clone();
    for (let e = -59; e <= 80; e += 0.5) {
      const h = skyColors(e, out).horizon;
      expect(Math.abs(h.r - prev.r) + Math.abs(h.g - prev.g) + Math.abs(h.b - prev.b)).toBeLessThan(0.1);
      prev = h.clone();
    }
    expect(skyColors(-30, out).zenith.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.05);
    expect(skyColors(40, out).zenith.b).toBeGreaterThan(out.zenith.r);
    expect(skyColors(2, out).glow.r).toBeGreaterThan(0.6);
  });

  it('[R-ENV-SKY] fog reaches the screen as the sky dome horizon color at every time of day', () => {
    const scene = new THREE.Scene();
    const sky = new SkySystem(scene, 1024);
    expect(scene.fog).toBe(sky.fog);
    expect(sky.sun.castShadow).toBe(true);
    for (let h = 0; h < 24; h += 1.5) {
      sky.update(new Date(Date.UTC(2026, 9, 19, h, 7)), new THREE.Vector3(10, 20, 30));
      const shown = sky.fog.color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
      for (const c of ['r', 'g', 'b'] as const) expect(shown[c]).toBeCloseTo(sky.colors.horizon[c], 4);
      expect(sky.sky.material.uniforms.uHorizon.value).toBe(sky.colors.horizon);
      expect(sky.sun.target.position.x).toBe(10);
    }
    sky.update(new Date('2026-10-19T19:30:00Z'), new THREE.Vector3());
    expect(sky.night).toBe(0);
    expect(sky.sunDir.y).toBeGreaterThan(0.6);
    sky.update(new Date('2026-10-19T08:30:00Z'), new THREE.Vector3());
    expect(sky.night).toBe(1);
    expect(sky.sun.intensity).toBeLessThan(0.5);
    sky.fogDensity = 3;
    sky.update(new Date('2026-10-19T08:30:00Z'), new THREE.Vector3());
    expect(sky.fog.far).toBeCloseTo((9000 * 0.92) / 3);
    sky.setStars(new Float32Array([1, 0.2, 1.5, 0.6, 2, -0.3, 3, 1.2]), 2);
    expect(sky.stars.visible).toBe(true);
    expect(sky.stars.geometry.getAttribute('position').count).toBe(2);
  });

  it('[R-ENV-SKY] moon position and phase match JPL Horizons for San Francisco', () => {
    const horizons: [string, number, number, number][] = [
      ['2026-10-19T04:00Z', 202.13, 26.01, 54.4],
      ['2026-10-21T04:00Z', 179.15, 38.28, 73.2],
      ['2026-10-23T04:00Z', 147.72, 44.99, 89.1],
      ['2026-03-03T11:00Z', 239.54, 41.45, 99.99],
    ];
    for (const [t, az, alt, illum] of horizons) {
      const d = new Date(t);
      const p = moonPosition(d, ORIGIN.lat, ORIGIN.lon);
      expect(Math.abs(p.azimuth * DEG - az)).toBeLessThan(1.2);
      expect(Math.abs(p.altitude * DEG - alt)).toBeLessThan(1.2);
      expect(Math.abs(moonIllumination(d) * 100 - illum)).toBeLessThan(2);
    }
    const v = new THREE.Vector3();
    directionFrom(0, Math.PI / 2, v);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
    directionFrom(0, 0, v);
    expect(v.z).toBeCloseTo(-1);
  });

  it('[R-ENV-SKY] star coordinates agree with the sun model at local noon', () => {
    const d = new Date('2026-06-21T20:00:00Z');
    const lst = siderealTime(d, ORIGIN.lon);
    const sun = sunPosition(d, ORIGIN.lat, ORIGIN.lon);
    const h = horizontal((90 * Math.PI) / 180, (23.44 * Math.PI) / 180, lst, ORIGIN.lat);
    expect(Math.abs(h.altitude - sun.altitude) * DEG).toBeLessThan(1.5);
    expect(Math.abs(h.azimuth - sun.azimuth) * DEG).toBeLessThan(3);
  });
});

describe('Karl the Fog', () => {
  const ob = toLocal(37.76, -122.505);
  const downtown = toLocal(37.792, -122.4);
  const bay = toLocal(37.822, -122.44);

  it('[R-ENV-FOG] rolls in during the evening and burns off by late morning', () => {
    expect(eveningFactor(13)).toBe(0);
    expect(eveningFactor(21)).toBe(1);
    expect(eveningFactor(3)).toBe(1);
    expect(eveningFactor(12)).toBe(0);
    expect(eveningFactor(18)).toBeGreaterThan(0.3);
    expect(solarHour(new Date('2026-10-19T20:10:00Z'), ORIGIN.lon)).toBeCloseTo(12, 0);
    const noon = karlState(new Date('2026-10-19T20:10:00Z'), 1, ORIGIN.lon);
    const eve = karlState(new Date('2026-10-20T04:30:00Z'), 1, ORIGIN.lon);
    expect(noon.strength).toBe(0);
    expect(karlDensity(ob.x, 20, ob.z, noon)).toBe(0);
    expect(eve.coverage).toBeGreaterThan(0.4);
    expect(karlMask(ob.x, ob.z, eve)).toBeGreaterThan(0.9);
    expect(karlMask(downtown.x, downtown.z, eve)).toBeLessThan(0.1);
    expect(karlMask(bay.x, bay.z, eve)).toBeGreaterThan(0.5);
    expect(karlDensity(ob.x, 20, ob.z, eve)).toBeGreaterThan(0);
    expect(karlDensity(ob.x, eve.top + 200, ob.z, eve)).toBe(0);
    expect(Math.abs(karlTop(ob.x, ob.z, eve) - eve.top)).toBeLessThan(80);
    expect(KARL_SOFT).toBeGreaterThan(0);
  });

  it('[R-ENV-FOG] fogDensity 3 thickens Karl and cuts visibility at Ocean Beach', () => {
    const t = new Date('2026-10-20T01:00:00Z');
    const normal = karlState(t, 1, ORIGIN.lon);
    const thick = karlState(t, 3, ORIGIN.lon);
    expect(thick.coverage).toBeGreaterThan(normal.coverage);
    expect(thick.top).toBeGreaterThan(normal.top);
    expect(thick.extinction).toBeGreaterThan(normal.extinction);
    const vNormal = visibility(ob.x, 30, ob.z, normal, 8000);
    const vThick = visibility(ob.x, 30, ob.z, thick, 8000 / 3);
    expect(vThick).toBeLessThan(vNormal);
    expect(vThick).toBeLessThan(400);
    expect(visibility(ob.x, 30, ob.z, karlState(new Date('2026-10-19T20:00:00Z'), 1, ORIGIN.lon), 8000)).toBe(8000);
    expect(karlMask(downtown.x, downtown.z, karlState(new Date('2026-10-20T06:00:00Z'), 3, ORIGIN.lon))).toBeGreaterThan(0.9);
    const lattice = noiseTexture.image.data as Uint8Array;
    expect(noise(3, 5)).toBe(lattice[5 * 256 + 3] / 255);
    expect(noise(3 - 512, 5 + 256)).toBe(noise(3, 5));
    expect(noise(3.5, 5)).toBeCloseTo((lattice[5 * 256 + 3] + lattice[5 * 256 + 4]) / 510);
  });

  it('[R-ENV-FOG] patches every built-in fog shader with shared Karl uniforms', () => {
    patchFogChunks(4);
    expect(THREE.ShaderChunk.fog_fragment).toContain('karlDepth');
    expect(THREE.ShaderChunk.fog_pars_fragment).toContain('#define KARL_STEPS 4');
    expect(THREE.ShaderChunk.fog_vertex).toContain('vFogWorld');
    const cloned = THREE.UniformsUtils.clone(THREE.ShaderLib.lambert.uniforms);
    expect(cloned.envKarlA.value).toBe(envUniforms.envKarlA);
    const merged = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    expect(merged.envSun.value).toBe(envUniforms.envSun);
    patchFogChunks(6);
    expect(THREE.ShaderChunk.fog_pars_fragment.match(/vFogWorld;/g)).toHaveLength(1);
  });
});

describe('time of day', () => {
  const alt = (d: Date) => sunPosition(d, ORIGIN.lat, ORIGIN.lon).altitude * DEG;

  it('[R-ENV-TIME] noon, golden and night targets land on the right sun angles', () => {
    for (const ref of [new Date('2026-10-19T19:30:00Z'), new Date('2026-06-21T03:00:00Z'), new Date('2026-12-21T12:00:00Z')]) {
      expect(modeTarget('real', ref)).toBeNull();
      const noon = modeTarget('noon', ref)!;
      expect(alt(noon)).toBeGreaterThanOrEqual(alt(new Date(noon.getTime() - 1800000)));
      expect(alt(noon)).toBeGreaterThanOrEqual(alt(new Date(noon.getTime() + 1800000)));
      const golden = modeTarget('golden', ref)!;
      expect(alt(golden)).toBeGreaterThan(5);
      expect(alt(golden)).toBeLessThan(6.1);
      expect(alt(new Date(golden.getTime() + 600000))).toBeLessThan(alt(golden));
      expect(alt(modeTarget('night', ref)!)).toBeLessThan(-18);
      expect(Math.abs(noon.getTime() - ref.getTime())).toBeLessThan(86400000);
    }
  });
});

describe('quality tiers', () => {
  it('[R-ENV-PERF] tiers scale tree density, draw distance and fog work', () => {
    const order = ['low', 'medium', 'high'] as const;
    for (let i = 1; i < 3; i++) {
      const a = TIERS[order[i - 1]];
      const b = TIERS[order[i]];
      expect(b.trees.street).toBeGreaterThan(a.trees.street);
      expect(b.trees.wood).toBeGreaterThan(a.trees.wood);
      expect(b.treeDist).toBeGreaterThan(a.treeDist);
      expect(b.roadDist).toBeGreaterThan(a.roadDist);
      expect(b.lampDist).toBeGreaterThan(a.lampDist);
      expect(b.karlSteps).toBeGreaterThanOrEqual(a.karlSteps);
      expect(b.roadStep).toBeLessThanOrEqual(a.roadStep);
    }
  });
});

describe('city shader', () => {
  it('[R-ENV-CITY] every shader anchor exists in the three.js lambert shader', () => {
    const vs = patch(THREE.ShaderLib.lambert.vertexShader, CITY_VERTEX);
    const fs = patch(THREE.ShaderLib.lambert.fragmentShader, CITY_FRAGMENT);
    expect(vs).toContain('aInfo');
    expect(fs).toContain('wfade');
    expect(fs).toContain('litFrac');
    expect(() => patch('void main() {}', CITY_VERTEX)).toThrow(/anchor/);
    const night = { value: 1 };
    const mat = createCityMaterial(night);
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.uniforms.uNight).toBe(night);
  });

  it('[R-ENV-CITY] packs ground height, size class, glass and a seed into one attribute', () => {
    const decode = (v: number) => ({ ground: v % 512, cls: Math.floor(v / 512) % 4, glass: Math.floor(v / 2048) % 2, seed: Math.floor(v / 4096) });
    expect(decode(buildingInfo(5, 8, 123.4))).toMatchObject({ ground: 123, cls: 0, glass: 0 });
    expect(decode(buildingInfo(5, 8, 123.4, true)).glass).toBe(1);
    expect(decode(buildingInfo(5, 20, 0)).cls).toBe(1);
    expect(decode(buildingInfo(5, 60, 0)).cls).toBe(2);
    expect(decode(buildingInfo(5, 200, -4)).cls).toBe(3);
    expect(decode(buildingInfo(5, 200, -4)).ground).toBe(0);
    expect(decode(buildingInfo(5, 200, 900)).ground).toBe(511);
    const seeds = new Set(Array.from({ length: 64 }, (_, b) => decode(buildingInfo(b, 10, 0)).seed));
    expect(seeds.size).toBeGreaterThan(8);
  });
});
