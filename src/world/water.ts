import * as THREE from 'three';
import type { Terrain } from './terrain';

export interface WaterUniforms {
  uTime: { value: number };
  uNight: { value: number };
  uHorizon: { value: THREE.Color };
  uZenith: { value: THREE.Color };
  uGlintDir: { value: THREE.Vector3 };
  uGlint: { value: THREE.Color };
  uDetail: { value: number };
}

export function waterTexture(t: Terrain): THREE.DataTexture {
  const { w, h, grid } = t;
  const data = new Uint8Array(w * h * 4);
  const land = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const y = grid[i] / 10;
    data[i * 4] = Math.round(Math.min(255, Math.max(0, -y * 4)));
    land[i] = y > 1 ? 1 : 0;
  }
  const blur = (src: Float32Array, r: number) => {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      let s = 0;
      for (let i = -r; i < w + r; i++) {
        if (i + r < w) s += src[j * w + Math.min(w - 1, i + r)];
        if (i - r - 1 >= 0) s -= src[j * w + i - r - 1];
        if (i >= 0 && i < w) tmp[j * w + i] = s / (2 * r + 1);
      }
    }
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let j = -r; j < h + r; j++) {
        if (j + r < h) s += tmp[Math.min(h - 1, j + r) * w + i];
        if (j - r - 1 >= 0) s -= tmp[(j - r - 1) * w + i];
        if (j >= 0 && j < h) out[j * w + i] = s / (2 * r + 1);
      }
    }
    return out;
  };
  const glow = blur(blur(land, 14), 14);
  for (let i = 0; i < w * h; i++) data[i * 4 + 1] = Math.round(Math.min(1, glow[i] * 1.6) * 255);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const WATER_GLSL = /* glsl */ `
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
}
vec2 wGrad(vec2 p) {
  float e = 0.08;
  return vec2(wNoise(p + vec2(e, 0.0)) - wNoise(p - vec2(e, 0.0)), wNoise(p + vec2(0.0, e)) - wNoise(p - vec2(0.0, e))) / (2.0 * e);
}
vec3 waterNormal(vec2 p, float t, float detail, float dist) {
  vec2 g = vec2(0.0);
  g += vec2(0.55, 0.3) * cos(dot(p, vec2(0.021, 0.013)) + t * 0.9) * 0.35;
  g += vec2(-0.2, 0.6) * cos(dot(p, vec2(-0.011, 0.034)) + t * 1.2) * 0.25;
  g += wGrad(p * 0.045 + vec2(t * 0.05, t * 0.03)) * 0.22;
  float near = 1.0 - smoothstep(150.0, 900.0, dist);
  g += wGrad(p * 0.16 - vec2(t * 0.11, -t * 0.07)) * 0.12 * near * detail;
  g += wGrad(p * 0.55 + vec2(t * 0.23, t * 0.17)) * 0.06 * (1.0 - smoothstep(40.0, 260.0, dist)) * detail;
  return normalize(vec3(-g.x * 0.35, 1.0, -g.y * 0.35));
}
`;

export function createWaterMaterial(u: WaterUniforms, depth: THREE.Texture, t: Terrain): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const box = new THREE.Vector4(t.minX, t.minZ, t.w * t.cell, t.h * t.cell);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, { uDepth: { value: depth }, uBox: { value: box } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWater;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWater;
        uniform float uTime, uNight, uDetail;
        uniform vec3 uHorizon, uZenith, uGlintDir, uGlint;
        uniform sampler2D uDepth;
        uniform vec4 uBox;
        ${WATER_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wuv = (vWater.xz - uBox.xy) / uBox.zw;
        float inBox = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
        vec4 wt = texture2D(uDepth, clamp(wuv, 0.0, 1.0));
        float depthM = mix(60.0, wt.r * 64.0, inBox);
        float cityGlow = wt.g * inBox;
        float wDist = length(vWater - cameraPosition);
        vec3 wN = waterNormal(vWater.xz, uTime, uDetail, wDist);
        vec3 shallow = vec3(0.3, 0.52, 0.52);
        vec3 deep = vec3(0.09, 0.24, 0.33);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.5, 22.0, depthM));
        float foam = (1.0 - smoothstep(0.15, 1.4, depthM)) * smoothstep(0.45, 0.8, wNoise(vWater.xz * 0.12 + vec2(uTime * 0.2, 0.0)) + 0.35 * sin(uTime * 1.4 + depthM * 4.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.94), foam * inBox * (1.0 - smoothstep(300.0, 1500.0, wDist)));`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace(
        '#include <fog_fragment>',
        `vec3 wV = normalize(cameraPosition - vWater);
        vec3 wR = reflect(-wV, wN);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(wN, wV), 0.0), 5.0);
        vec3 skyR = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, wR.y));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, skyR, clamp(fres * 0.9, 0.0, 0.85));
        float gl = max(dot(wR, uGlintDir), 0.0);
        gl_FragColor.rgb += uGlint * (pow(gl, 600.0) * 4.0 + pow(gl, 60.0) * 0.25) * step(0.0, uGlintDir.y);
        float streak = smoothstep(0.55, 0.95, wNoise(vec2(vWater.x * 0.08, vWater.z * 0.08) + wN.xz * 6.0 + uTime * 0.05));
        gl_FragColor.rgb += uNight * cityGlow * (0.25 + fres) * streak * mix(vec3(1.0, 0.62, 0.3), vec3(0.75, 0.85, 1.0), wNoise(vWater.xz * 0.01)) * 0.55;
        #include <fog_fragment>`,
      );
  };
  return mat;
}
