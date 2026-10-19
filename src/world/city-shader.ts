import * as THREE from 'three';

export const CITY_VERTEX: [string, string][] = [
  ['#include <common>', '#include <common>\nattribute float aInfo;\nvarying vec3 vWorldPos;\nvarying vec3 vInfo;'],
  [
    '#include <project_vertex>',
    `#include <project_vertex>
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vInfo = vec3(mod(aInfo, 1024.0) * 0.5, mod(floor(aInfo / 1024.0), 4.0), floor(aInfo / 4096.0));`,
  ],
];

export const CITY_FRAGMENT: [string, string][] = [
  [
    '#include <common>',
    `#include <common>
    varying vec3 vWorldPos;
    varying vec3 vInfo;
    uniform float uNight;
    float cHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`,
  ],
  [
    '#include <color_fragment>',
    `#include <color_fragment>
    vec3 fn = normalize((vec4(cross(dFdx(vViewPosition), dFdy(vViewPosition)), 0.0) * viewMatrix).xyz);
    float roof = step(0.6, abs(fn.y));
    float s = vInfo.z / 15.0;
    float cls = vInfo.y;
    float rel = vWorldPos.y - vInfo.x;
    vec2 tg = normalize(vec2(-fn.z, fn.x) + 1e-5);
    float wu = dot(vWorldPos.xz, tg);
    float floorH = cls < 0.5 ? mix(3.0, 3.5, s) : cls < 1.5 ? mix(3.2, 3.8, s) : mix(3.6, 4.3, s);
    float bayW = cls > 1.5 ? mix(1.5, 3.0, fract(s * 7.3)) : mix(2.4, 3.4, fract(s * 5.1));
    float shop = (cls > 0.5 || s > 0.55) ? 1.0 : 0.0;
    float base = shop * 4.6;
    float fy = fract((rel - base) / floorH);
    float fu = fract(wu / bayW);
    float h0 = cls > 2.5 ? mix(0.08, 0.2, s) : cls > 1.5 ? 0.22 : 0.3;
    float h1 = cls > 2.5 ? 0.94 : 0.82;
    float ww = cls > 2.5 ? mix(0.03, 0.1, s) : mix(0.14, 0.24, fract(s * 3.1));
    float pat = step(h0, fy) * step(fy, h1) * step(ww, fu) * step(fu, 1.0 - ww);
    float avgWin = (h1 - h0) * (1.0 - 2.0 * ww);
    float aa = max(fwidth(rel / floorH), fwidth(wu / bayW));
    float wfade = smoothstep(0.22, 0.55, aa);
    float wall = (1.0 - roof) * step(base + 0.6, rel);
    float win = mix(pat, avgWin, wfade) * wall;
    float band = (1.0 - roof) * shop * step(0.3, rel) * step(rel, base);
    float glassB = band * step(rel, 3.5);
    float sign = band * step(3.5, rel) * step(rel, 4.3);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fr = pow(1.0 - abs(dot(fn, V)), 3.0);
    vec3 skyRef = vec3(0.55, 0.62, 0.7);
    #ifdef USE_FOG
    skyRef = fogColor;
    #endif
    vec3 glass = mix(vec3(0.08, 0.11, 0.15), skyRef * 0.95, 0.22 + 0.6 * fr);
    if (cls > 2.5) glass = mix(glass, vec3(0.32, 0.42, 0.5), 0.25 * s);
    vec3 facade = diffuseColor.rgb * (0.94 + 0.12 * fract(s * 11.7)) * (1.0 - 0.45 * uNight);
    facade *= 1.0 - 0.07 * step(fy, 0.05) * step(1.5, cls) * (1.0 - wfade) * wall;
    vec3 col = mix(facade, glass, win * 0.85);
    col = mix(col, glass * 0.9, glassB * 0.9);
    vec3 awning = mix(vec3(0.55, 0.18, 0.14), vec3(0.16, 0.3, 0.26), step(0.5, fract(s * 13.1)));
    col = mix(col, mix(awning, vec3(0.2), step(0.75, fract(s * 5.7))), sign * 0.8);
    float rs = fract(s * 9.1);
    vec3 roofCol = rs < 0.35 ? vec3(0.56, 0.55, 0.53) : rs < 0.65 ? vec3(0.84, 0.84, 0.82) : rs < 0.85 ? vec3(0.36, 0.36, 0.37) : diffuseColor.rgb * 0.8;
    vec2 cell = floor(vWorldPos.xz / 7.0);
    vec2 cf = fract(vWorldPos.xz / 7.0);
    float unit = step(0.72, cHash(cell + vInfo.z)) * step(0.2, cf.x) * step(cf.x, 0.75) * step(0.25, cf.y) * step(cf.y, 0.8) * step(0.5, cls);
    float rfade = 1.0 - smoothstep(0.3, 1.2, fwidth(vWorldPos.x / 7.0));
    roofCol = mix(roofCol, roofCol * 0.62 + 0.05, unit * rfade);
    col = mix(col, roofCol, roof);
    diffuseColor.rgb = col;`,
  ],
  [
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    if (uNight > 0.01) {
      vec2 wid = vec2(floor((rel - base) / floorH) * 131.0 + vInfo.z * 7.0, floor(wu / bayW) * 17.0 + vInfo.z);
      float litFrac = mix(0.22, 0.68, fract(s * 3.7));
      float r = cHash(wid);
      float lit = step(1.0 - litFrac, r);
      vec3 warm = vec3(1.0, 0.74, 0.44);
      vec3 cool = vec3(0.86, 0.92, 1.0);
      vec3 wc = mix(warm, cool, step(0.82 - cls * 0.18, cHash(wid + 3.1))) * mix(0.55, 1.0, cHash(wid + 7.7));
      vec3 avgC = mix(warm, cool, cls * 0.12 + 0.12) * 0.24 * step(0.15, fract(s * 2.9));
      vec3 e = mix(pat * lit * wc, avgWin * litFrac * avgC, wfade) * wall;
      e += glassB * vec3(1.0, 0.8, 0.55) * 0.9 + sign * mix(vec3(1.0, 0.45, 0.3), vec3(0.4, 0.8, 1.0), step(0.5, fract(s * 13.1))) * 0.6;
      totalEmissiveRadiance += e * uNight * 0.75;
    }`,
  ],
];

export function patch(src: string, edits: [string, string][]): string {
  for (const [from, to] of edits) {
    if (!src.includes(from)) throw new Error(`shader anchor missing: ${from}`);
    src = src.replace(from, to);
  }
  return src;
}

export function createCityMaterial(night: { value: number }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = patch(shader.vertexShader, CITY_VERTEX);
    shader.fragmentShader = patch(shader.fragmentShader, CITY_FRAGMENT);
  };
  return mat;
}
