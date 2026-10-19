import * as THREE from 'three';
import { nightFactor, sunPosition } from '../core/sun';
import { ORIGIN } from '../core/geo';
import { cityUniforms } from './city';
import { applyKarl, envUniforms, karlState, KARL_GLSL, patchFogChunks, type KarlState } from './karl';
import { directionFrom, moonIllumination, moonPosition, siderealTime } from './moon';

type Key = [number, string, string, string, string, string];

const PALETTE: Key[] = [
  [-90, '#04070e', '#141a26', '#000000', '#1f2330', '#555866'],
  [-16, '#05080f', '#161c29', '#000000', '#22262f', '#565967'],
  [-9, '#0b1428', '#24304a', '#1a0e18', '#2a2d3d', '#3a4052'],
  [-4, '#1d2c50', '#55597a', '#6a3436', '#5d5a72', '#626576'],
  [0, '#3b5785', '#c78c78', '#ff6a2c', '#f0a080', '#c9a6a0'],
  [4, '#4d72a7', '#e8b896', '#ff8f40', '#ffd0a6', '#e6d3c8'],
  [10, '#5788c0', '#d8dedb', '#ffb870', '#fff1e0', '#edf0f0'],
  [25, '#4d87c8', '#cddfeb', '#000000', '#ffffff', '#f2f4f5'],
  [90, '#3c79c2', '#c3d9ea', '#000000', '#ffffff', '#f4f6f7'],
];

const WHITE = new THREE.Color('#ffffff');
const raw = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
const KEYS = PALETTE.map(([e, ...c]) => ({ e, c: c.map(raw) }));

export interface SkyColors {
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  cloud: THREE.Color;
  karl: THREE.Color;
}

export function skyColors(elevDeg: number, out: SkyColors): SkyColors {
  let i = 1;
  while (i < KEYS.length - 1 && KEYS[i].e < elevDeg) i++;
  const a = KEYS[i - 1];
  const b = KEYS[i];
  const t = Math.min(1, Math.max(0, (elevDeg - a.e) / (b.e - a.e)));
  const names = ['zenith', 'horizon', 'glow', 'cloud', 'karl'] as const;
  names.forEach((n, k) => out[n].copy(a.c[k]).lerp(b.c[k], t));
  return out;
}

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const DOME_FRAG = /* glsl */ `
#define KARL_STEPS 4
uniform vec3 uZenith, uHorizon, uGlow, uCloud, uSunDir, uSunCol;
uniform float uNight, uCover, uTime;
varying vec3 vDir;
${KARL_GLSL}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * envNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
  col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.08, d.y));
  vec2 sh = normalize(uSunDir.xz + 1e-4);
  float sunward = max(dot(normalize(d.xz + 1e-4), sh), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.45, up);
  col += uGlow * pow(sunward, 3.0) * low * 0.9;
  float cs = max(dot(d, uSunDir), 0.0);
  float vis = smoothstep(-0.06, 0.02, uSunDir.y);
  col += uSunCol * (pow(cs, 900.0) * 6.0 + pow(cs, 90.0) * 0.35 + pow(cs, 8.0) * 0.08) * vis;
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.0035, uTime * 0.0012);
    float f = fbm(cp);
    float k = smoothstep(1.0 - uCover, 1.0 - uCover + 0.32, f) * smoothstep(0.0, 0.18, d.y);
    float lit = 0.62 + 0.38 * pow(max(dot(d, uSunDir), 0.0), 3.0) + (f - 0.5) * 0.5;
    vec3 cc = uCloud * lit;
    cc = mix(cc, mix(uHorizon, uCloud, 0.5) * 0.75, (1.0 - smoothstep(0.55, 0.85, f)) * 0.5);
    col = mix(col, cc, k * 0.92);
  }
  float kk = 1.0 - exp(-karlDepth(cameraPosition, cameraPosition + d * 1500.0));
  if (kk > 0.002) col = mix(col, karlColor(cameraPosition, cameraPosition + d * 1500.0) + envFogGlow.rgb * fogSunward(d) * 0.25, kk);
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VERT = /* glsl */ `
#define KARL_STEPS 3
attribute vec4 aStar;
uniform float uLst, uLat, uNight, uPx, uTime, uCover;
varying vec3 vColor;
varying float vAlpha;
${KARL_GLSL}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * envNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
void main() {
  float H = uLst - aStar.x;
  float dec = aStar.y;
  vec3 d = vec3(-cos(dec) * sin(H), sin(dec) * sin(uLat) + cos(dec) * cos(H) * cos(uLat), -(sin(dec) * cos(uLat) - cos(dec) * cos(H) * sin(uLat)));
  vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + d * 1000.0, 1.0);
  gl_Position = p.xyww;
  float flux = pow(10.0, -0.4 * (aStar.z - 1.0));
  gl_PointSize = clamp(1.4 + 2.2 * sqrt(flux), 1.4, 5.0) * uPx;
  float bv = clamp(aStar.w, -0.3, 1.8);
  vColor = bv < 0.4 ? mix(vec3(0.7, 0.8, 1.0), vec3(1.0), (bv + 0.3) / 0.7) : mix(vec3(1.0), vec3(1.0, 0.72, 0.45), (bv - 0.4) / 1.4);
  float cloud = 0.0;
  if (d.y > 0.0) cloud = smoothstep(1.0 - uCover, 1.0 - uCover + 0.32, fbm(d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.0035, uTime * 0.0012)));
  float twinkle = 0.8 + 0.2 * sin(uTime * (2.0 + fract(aStar.x * 91.0) * 3.0) + aStar.y * 50.0);
  float ext = smoothstep(0.0, 0.25, d.y);
  vAlpha = smoothstep(0.35, 0.95, uNight) * min(1.0, 0.25 + flux) * ext * (1.0 - cloud) * twinkle * exp(-karlDepth(cameraPosition, cameraPosition + d * 3000.0));
}`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c)) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

const MOON_VERT = /* glsl */ `
#define KARL_STEPS 3
uniform vec3 uMoonDir, uMoonR, uMoonU;
uniform float uMoonSize;
varying vec2 vUv;
varying float vFog;
${KARL_GLSL}
void main() {
  vUv = position.xy;
  vec3 w = cameraPosition + uMoonDir * 1000.0 + (uMoonR * position.x + uMoonU * position.y) * uMoonSize;
  vec4 p = projectionMatrix * viewMatrix * vec4(w, 1.0);
  gl_Position = p.xyww;
  vFog = exp(-karlDepth(cameraPosition, cameraPosition + uMoonDir * 3000.0));
}`;

const MOON_FRAG = /* glsl */ `
uniform vec3 uSunLocal, uSkyTint;
uniform float uNight, uIllum;
varying vec2 vUv;
varying float vFog;
float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1, 0)), u.x), mix(mHash(i + vec2(0, 1)), mHash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 uv = vUv * 3.0;
  float r2 = dot(uv, uv);
  vec3 col = vec3(0.0);
  float halo = exp(-max(r2 - 1.0, 0.0) * 1.2) * 0.22 * uIllum * uNight;
  if (r2 < 1.0) {
    vec3 n = vec3(uv, sqrt(1.0 - r2));
    float lit = smoothstep(-0.04, 0.12, dot(n, uSunLocal));
    float mare = smoothstep(0.5, 0.72, mNoise(uv * 2.3 + 3.0) * 0.6 + mNoise(uv * 5.0 + 9.0) * 0.4);
    float albedo = (1.0 - mare * 0.32) * (0.82 + 0.18 * n.z);
    col = vec3(1.0, 0.97, 0.9) * albedo * (lit + 0.05 * uNight) * mix(0.55, 1.15, uNight);
    float edge = smoothstep(1.0, 0.94, r2);
    col *= edge;
    col = mix(col, col * uSkyTint, 1.0 - uNight);
  }
  col += vec3(0.8, 0.85, 1.0) * halo;
  gl_FragColor = vec4(col * vFog, 1.0);
}`;

export class SkySystem {
  readonly sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  readonly hemi = new THREE.HemisphereLight('#dfefff', '#8a8468', 1.1);
  readonly fog: THREE.Fog;
  readonly colors: SkyColors = { zenith: new THREE.Color(), horizon: new THREE.Color(), glow: new THREE.Color(), cloud: new THREE.Color(), karl: new THREE.Color() };
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly moon: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  night = 0;
  elevation = 0;
  sunDir = new THREE.Vector3();
  moonDir = new THREE.Vector3();
  moonIllumination = 0;
  fogDensity = 1;
  cloudCover = 0.38;
  viewFar = 9000;
  karl: KarlState;
  private sunCol = new THREE.Color();

  constructor(scene: THREE.Scene, shadowSize: number) {
    patchFogChunks(6);
    const u = { uZenith: { value: this.colors.zenith }, uHorizon: { value: this.colors.horizon }, uGlow: { value: this.colors.glow }, uCloud: { value: this.colors.cloud }, uSunDir: { value: this.sunDir }, uSunCol: { value: this.sunCol }, uNight: { value: 0 }, uCover: { value: this.cloudCover }, uTime: { value: 0 } };
    const env = Object.fromEntries(Object.entries(envUniforms).map(([k, v]) => [k, { value: v }]));
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({ uniforms: { ...u, ...env }, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false }));
    this.sky.name = 'sky';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -2;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.ShaderMaterial({
        uniforms: { uLst: { value: 0 }, uLat: { value: (ORIGIN.lat * Math.PI) / 180 }, uNight: u.uNight, uPx: { value: 1 }, uTime: u.uTime, uCover: u.uCover, ...env },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.stars.name = 'stars';
    this.stars.frustumCulled = false;
    this.stars.visible = false;
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uMoonDir: { value: this.moonDir }, uMoonR: { value: new THREE.Vector3() }, uMoonU: { value: new THREE.Vector3() }, uMoonSize: { value: 1000 * Math.tan((1.7 * Math.PI) / 180) }, uSunLocal: { value: new THREE.Vector3() }, uSkyTint: { value: this.colors.horizon }, uNight: u.uNight, uIllum: { value: 0 }, ...env },
        vertexShader: MOON_VERT,
        fragmentShader: MOON_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.moon.name = 'moon';
    this.moon.frustumCulled = false;
    this.moon.renderOrder = -1;
    scene.add(this.sky, this.stars, this.moon, this.sun, this.sun.target, this.hemi);
    this.fog = new THREE.Fog(this.colors.horizon.clone(), 900, 9000);
    scene.fog = this.fog;
    scene.background = this.fog.color;
    this.karl = karlState(new Date(0), 1, ORIGIN.lon);
    if (shadowSize > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -160;
      c.right = c.top = 160;
      c.near = 1;
      c.far = 2400;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.6;
    }
  }

  setStars(data: Float32Array, pixelRatio: number): void {
    const g = this.stars.geometry;
    const n = data.length / 4;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aStar', new THREE.BufferAttribute(data, 4));
    this.stars.material.uniforms.uPx.value = pixelRatio;
    this.stars.visible = true;
  }

  update(date: Date, focus: THREE.Vector3): void {
    const { altitude, azimuth } = sunPosition(date, ORIGIN.lat, ORIGIN.lon);
    directionFrom(altitude, azimuth, this.sunDir);
    this.night = nightFactor(altitude);
    cityUniforms.uNight.value = this.night;
    const elev = altitude * (180 / Math.PI);
    this.elevation = elev;
    skyColors(elev, this.colors);
    const dusk = Math.max(0, 1 - Math.abs(elev - 3) / 9);
    this.sunCol.setRGB(1, 0.92 - dusk * 0.25, 0.8 - dusk * 0.45);
    const mu = this.sky.material.uniforms;
    mu.uNight.value = this.night;
    mu.uCover.value = this.cloudCover;
    mu.uTime.value = (date.getTime() / 1000) % 86400;
    this.sky.position.copy(focus);

    const mp = moonPosition(date, ORIGIN.lat, ORIGIN.lon);
    directionFrom(mp.altitude, mp.azimuth, this.moonDir);
    this.moonIllumination = moonIllumination(date);
    const mm = this.moon.material.uniforms;
    const r = (mm.uMoonR.value as THREE.Vector3).crossVectors(this.moonDir, THREE.Object3D.DEFAULT_UP).normalize();
    const up = (mm.uMoonU.value as THREE.Vector3).crossVectors(r, this.moonDir).normalize();
    (mm.uSunLocal.value as THREE.Vector3).set(this.sunDir.dot(r), this.sunDir.dot(up), -this.sunDir.dot(this.moonDir));
    mm.uIllum.value = this.moonIllumination;
    this.moon.visible = mp.altitude > -0.03;
    this.stars.material.uniforms.uLst.value = siderealTime(date, ORIGIN.lon);

    this.fog.color.copy(this.colors.horizon);
    this.fog.near = 900 / this.fogDensity;
    this.fog.far = (this.viewFar * 0.92) / this.fogDensity;
    envUniforms.envSun.set([this.sunDir.x, this.sunDir.y, this.sunDir.z, 0]);
    const g = this.colors.glow;
    envUniforms.envFogGlow.set([g.r * 0.55, g.g * 0.55, g.b * 0.55, 3]);
    this.karl = karlState(date, this.fogDensity, ORIGIN.lon);
    applyKarl(this.karl, this.colors.karl);

    const moonUp = this.night > 0.5 && mp.altitude > 0;
    const lightDir = altitude > 0 ? this.sunDir : moonUp ? this.moonDir : this.sunDir.clone().setY(Math.max(0.2, -this.sunDir.y));
    this.sun.position.copy(focus).addScaledVector(lightDir, 1000);
    this.sun.target.position.copy(focus);
    this.sun.intensity = 2.6 * Math.max(0, Math.min(1, elev / 8)) + this.night * (0.12 + (moonUp ? 0.3 * this.moonIllumination : 0));
    if (this.night > 0.5) this.sun.color.set('#9fb4ff');
    else this.sun.color.setRGB(1, 0.95 - dusk * 0.3, 0.88 - dusk * 0.48);
    this.hemi.color.copy(this.colors.zenith).lerp(WHITE, 0.55);
    this.hemi.groundColor.set(this.night > 0.5 ? '#3a3328' : '#8a8468');
    this.hemi.intensity = 0.2 + 1.0 * (1 - this.night);
  }
}
