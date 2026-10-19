import { ShaderChunk, ShaderLib, UniformsLib } from 'three';
import { toLocal } from '../core/geo';

const OCEAN_BEACH = toLocal(37.7594, -122.5107);
const GATE = toLocal(37.8199, -122.4783);
const ALCATRAZ = toLocal(37.8267, -122.423);
const DIR = (() => {
  const dx = ALCATRAZ.x - GATE.x;
  const dz = ALCATRAZ.z - GATE.z;
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();

export const KARL_SOFT = 70;

export interface KarlState {
  coverage: number;
  strength: number;
  top: number;
  front: number;
  reach: number;
  extinction: number;
  time: number;
}

export function solarHour(date: Date, lon: number): number {
  return (((date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + lon / 15) % 24) + 24) % 24;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function eveningFactor(hour: number): number {
  return hour >= 12 ? smooth(15.5, 20, hour) : 1 - smooth(7, 11, hour);
}

export function karlState(date: Date, fogDensity: number, lon: number): KarlState {
  const thick = Math.max(0, Math.min(1, (fogDensity - 1) / 2));
  const evening = eveningFactor(solarHour(date, lon));
  const coverage = Math.min(1, evening * 0.55 * (1 + thick) + thick * 0.7);
  return {
    coverage,
    strength: smooth(0, 0.12, coverage),
    top: 140 + coverage * 90 + thick * 50,
    front: OCEAN_BEACH.x - 500 + coverage * 11000,
    reach: Math.pow(coverage, 0.7) * 13000,
    extinction: 0.0065 + thick * 0.0055,
    time: (date.getTime() / 1000) % 86400,
  };
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function edge(x: number, z: number, k: KarlState): number {
  return noise(x * 0.0007 + k.time * 0.004, z * 0.0007 + k.time * 0.0013) * 0.65 + noise(x * 0.0021 - k.time * 0.006, z * 0.0021) * 0.35 - 0.5;
}

export function karlMask(x: number, z: number, k: KarlState): number {
  const n = edge(x, z, k);
  const ocean = smooth(k.front + 800, k.front - 800, x + n * 1400);
  const dx = x - GATE.x;
  const dz = z - GATE.z;
  const along = dx * DIR.x + dz * DIR.z;
  const side = Math.abs(-dx * DIR.z + dz * DIR.x);
  const w = 1100 + Math.max(along, 0) * 0.3;
  const tongue = smooth(-3000, -1500, along) * smooth(k.reach, k.reach - 2000, along + n * 1500) * smooth(w, w * 0.4, side + n * 500);
  return Math.max(ocean, tongue);
}

export function karlTop(x: number, z: number, k: KarlState): number {
  const qx = x + k.time * 0.9;
  const qz = z + k.time * 0.3;
  return k.top + (noise(qx * 0.0016, qz * 0.0016) - 0.5) * 110 + (noise(qx * 0.0065 + 7, qz * 0.0065 + 7) - 0.5) * 45;
}

export function karlDensity(x: number, y: number, z: number, k: KarlState): number {
  if (k.strength <= 0) return 0;
  return k.strength * k.extinction * karlMask(x, z, k) * Math.min(1, Math.max(0, (karlTop(x, z, k) - y) / KARL_SOFT));
}

export function visibility(x: number, y: number, z: number, k: KarlState, fogFar: number): number {
  const d = karlDensity(x, y, z, k);
  return Math.min(fogFar, d > 0 ? 3 / d : Infinity);
}

export const envUniforms = {
  envKarlA: new Float32Array(4),
  envKarlB: new Float32Array(4),
  envKarlC: new Float32Array(4),
  envFogGlow: new Float32Array(4),
  envSun: new Float32Array([0, 1, 0, 0]),
};

export function applyKarl(k: KarlState, color: { r: number; g: number; b: number }): void {
  envUniforms.envKarlA.set([k.strength, k.top, k.time, k.front]);
  envUniforms.envKarlB.set([k.reach, GATE.x, GATE.z, k.extinction]);
  envUniforms.envKarlC.set([color.r, color.g, color.b, 0]);
}

export const KARL_GLSL = /* glsl */ `
uniform vec4 envKarlA;
uniform vec4 envKarlB;
uniform vec4 envKarlC;
uniform vec4 envFogGlow;
uniform vec4 envSun;
float envHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float envNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(envHash(i), envHash(i + vec2(1.0, 0.0)), u.x), mix(envHash(i + vec2(0.0, 1.0)), envHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float karlMask(vec2 p) {
  float t = envKarlA.z;
  float n = envNoise(p * 0.0007 + vec2(t * 0.004, t * 0.0013)) * 0.65 + envNoise(p * 0.0021 - vec2(t * 0.006, 0.0)) * 0.35 - 0.5;
  float ocean = smoothstep(envKarlA.w + 800.0, envKarlA.w - 800.0, p.x + n * 1400.0);
  vec2 d = p - envKarlB.yz;
  vec2 dir = vec2(${DIR.x.toFixed(6)}, ${DIR.z.toFixed(6)});
  float along = dot(d, dir);
  float side = abs(dot(d, vec2(-dir.y, dir.x)));
  float w = 1100.0 + max(along, 0.0) * 0.3;
  float tongue = smoothstep(-3000.0, -1500.0, along) * smoothstep(envKarlB.x, envKarlB.x - 2000.0, along + n * 1500.0) * smoothstep(w, w * 0.4, side + n * 500.0);
  return max(ocean, tongue);
}
float karlTop(vec2 p) {
  vec2 q = p + envKarlA.z * vec2(0.9, 0.3);
  return envKarlA.y + (envNoise(q * 0.0016) - 0.5) * 110.0 + (envNoise(q * 0.0065 + 7.0) - 0.5) * 45.0;
}
float karlG(float y, float top) {
  float a = top - ${KARL_SOFT.toFixed(1)};
  if (y <= a) return y;
  if (y >= top) return a + ${(KARL_SOFT / 2).toFixed(1)};
  float e = y - a;
  return a + e - e * e / ${(KARL_SOFT * 2).toFixed(1)};
}
float karlDepth(vec3 a, vec3 b) {
  if (envKarlA.x < 0.001) return 0.0;
  vec3 d = b - a;
  float seg = length(d) / float(KARL_STEPS);
  float total = 0.0;
  for (int i = 0; i < KARL_STEPS; i++) {
    vec3 p0 = a + d * (float(i) / float(KARL_STEPS));
    vec3 p1 = a + d * (float(i + 1) / float(KARL_STEPS));
    vec2 mid = (p0.xz + p1.xz) * 0.5;
    float m = karlMask(mid);
    if (m < 0.002) continue;
    float top = karlTop(mid);
    float dy = p1.y - p0.y;
    float vert = abs(dy) < 0.5 ? clamp((top - (p0.y + p1.y) * 0.5) / ${KARL_SOFT.toFixed(1)}, 0.0, 1.0) : (karlG(p1.y, top) - karlG(p0.y, top)) / dy;
    total += m * vert * seg;
  }
  return total * envKarlA.x * envKarlB.w;
}
float fogSunward(vec3 ray) {
  return pow(max(dot(normalize(ray.xz + 1e-4), normalize(envSun.xz + 1e-4)), 0.0), envFogGlow.w);
}
vec3 karlColor(vec3 cam, vec3 frag) {
  float t = cam.y > envKarlA.y - 40.0 ? clamp((cam.y - envKarlA.y + 40.0) / max(cam.y - frag.y, 1.0), 0.0, 1.0) : 0.0;
  vec2 e = mix(cam.xz, frag.xz, t);
  float h = karlTop(e);
  float sx = karlTop(e + vec2(25.0, 0.0)) - h;
  float sz = karlTop(e + vec2(0.0, 25.0)) - h;
  vec3 n = normalize(vec3(-sx, 25.0, -sz));
  float sun = max(dot(n, normalize(envSun.xyz + vec3(0.0, 0.35, 0.0))), 0.0);
  float shade = mix(0.72, 1.08, clamp((h - envKarlA.y) / 90.0 + 0.5, 0.0, 1.0)) * (0.8 + 0.3 * sun);
  return envKarlC.rgb * mix(1.0, shade, t > 0.0 ? 1.0 : 0.35);
}
`;

const ORIGINAL = {
  fog_pars_vertex: ShaderChunk.fog_pars_vertex,
  fog_vertex: ShaderChunk.fog_vertex,
  fog_pars_fragment: ShaderChunk.fog_pars_fragment,
  fog_fragment: ShaderChunk.fog_fragment,
};

export function patchFogChunks(steps: number): void {
  ShaderChunk.fog_pars_vertex = `${ORIGINAL.fog_pars_vertex}\n#ifdef USE_FOG\nvarying vec3 vFogWorld;\n#endif`;
  ShaderChunk.fog_vertex = `${ORIGINAL.fog_vertex}
#ifdef USE_FOG
vec4 fogW = vec4(position, 1.0);
#ifdef USE_BATCHING
fogW = batchingMatrix * fogW;
#endif
#ifdef USE_INSTANCING
fogW = instanceMatrix * fogW;
#endif
vFogWorld = (modelMatrix * fogW).xyz;
#endif`;
  ShaderChunk.fog_pars_fragment = `${ORIGINAL.fog_pars_fragment}
#ifdef USE_FOG
#ifndef KARL_STEPS
#define KARL_STEPS ${steps}
#endif
varying vec3 vFogWorld;
${KARL_GLSL}
#endif`;
  ShaderChunk.fog_fragment = `#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
#endif
vec3 fogRay = vFogWorld - cameraPosition;
float fogSun = fogSunward(fogRay);
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + envFogGlow.rgb * fogSun, fogFactor);
float karlK = 1.0 - exp(-karlDepth(cameraPosition, vFogWorld));
if (karlK > 0.002) gl_FragColor.rgb = mix(gl_FragColor.rgb, karlColor(cameraPosition, vFogWorld) + envFogGlow.rgb * fogSun * 0.25, karlK);
#endif`;
  const add = (u: Record<string, { value: unknown }>) => {
    for (const [k, v] of Object.entries(envUniforms)) u[k] = { value: v };
  };
  for (const lib of Object.values(ShaderLib)) add(lib.uniforms as Record<string, { value: unknown }>);
  add(UniformsLib.fog as unknown as Record<string, { value: unknown }>);
}
