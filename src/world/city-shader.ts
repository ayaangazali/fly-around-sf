import * as THREE from 'three';

export const CITY_VERTEX: [string, string][] = [
  ['#include <common>', '#include <common>\nattribute float aInfo;\nvarying vec3 vWorldPos;\nflat varying vec3 vInfo;\nflat varying vec2 vAnchor;\nflat varying float vTop;\nflat varying float vGlass;'],
  [
    '#include <project_vertex>',
    `#include <project_vertex>
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vAnchor = vWorldPos.xz;
    vTop = vWorldPos.y;
    float i9 = floor(aInfo * (1.0 / 512.0));
    float i11 = floor(aInfo * (1.0 / 2048.0));
    float i12 = floor(aInfo * (1.0 / 4096.0));
    vInfo = vec3(aInfo - i9 * 512.0, i9 - floor(i9 * 0.25) * 4.0, i12);
    vGlass = i11 - i12 * 2.0;`,
  ],
];

export const CITY_FRAGMENT: [string, string][] = [
  [
    '#include <common>',
    `#include <common>
    varying vec3 vWorldPos;
    flat varying vec3 vInfo;
    flat varying vec2 vAnchor;
    flat varying float vTop;
    flat varying float vGlass;
    uniform float uNight;
    float cHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float cBand(float x, float a, float b, float w) { return smoothstep(a - w * 0.5, a + w * 0.5, x) - smoothstep(b - w * 0.5, b + w * 0.5, x); }`,
  ],
  [
    '#include <color_fragment>',
    `#include <color_fragment>
    vec3 fn = normalize((vec4(cross(dFdx(vViewPosition), dFdy(vViewPosition)), 0.0) * viewMatrix).xyz);
    float roof = step(0.6, abs(fn.y));
    float s = vInfo.z / 15.0;
    float cls = vInfo.y;
    float gl = vGlass;
    float rel = vWorldPos.y - vInfo.x;
    float low = 1.0 - step(1.5, cls);
    vec2 tg = normalize(vec2(-fn.z, fn.x) + 1e-5);
    float wu = dot(vWorldPos.xz - vAnchor, tg);
    float floorH = gl > 0.5 ? mix(3.8, 4.2, s) : cls < 0.5 ? mix(3.0, 3.5, s) : cls < 1.5 ? mix(3.2, 3.7, s) : mix(3.6, 4.1, s);
    float bayW = gl > 0.5 ? mix(1.4, 1.9, fract(s * 7.3)) : cls > 1.5 ? mix(1.6, 2.6, fract(s * 7.3)) : mix(2.3, 3.2, fract(s * 5.1));
    float shop = (cls > 0.5 || s > 0.86) ? 1.0 : 0.0;
    float base = shop > 0.5 ? 4.6 : 2.8;
    float fy = fract((rel - base) / floorH);
    float fu = fract(wu / bayW);
    float h0 = gl > 0.5 ? 0.12 : cls > 1.5 ? 0.24 : 0.28;
    float h1 = gl > 0.5 ? 0.97 : 0.84;
    float ww = gl > 0.5 ? 0.03 : cls > 1.5 ? mix(0.14, 0.2, s) : mix(0.2, 0.28, fract(s * 3.1));
    vec2 fw = max(vec2(fwidth(rel / floorH), fwidth(wu / bayW)), 1e-4);
    float pat = cBand(fy, h0, h1, fw.x) * cBand(fu, ww, 1.0 - ww, fw.y);
    float avgWin = (h1 - h0) * (1.0 - 2.0 * ww);
    float aa = max(fw.x, fw.y);
    float wfade = smoothstep(0.22, 0.55, aa);
    float near = 1.0 - wfade;
    float parapet = low * (1.0 - gl) * (1.0 - step(1.1, vTop - vWorldPos.y));
    float side = 1.0 - roof;
    float wall = side * step(base + 0.6, rel) * (1.0 - parapet);
    float win = mix(pat, avgWin, wfade) * wall;
    float trim = max(cBand(fy, h0 - 0.08, h1 + 0.05, fw.x) * cBand(fu, ww - 0.07, 1.0 - ww + 0.07, fw.y) - pat, 0.0) * near * wall * (1.0 - gl);
    float band = side * shop * step(0.3, rel) * step(rel, base);
    float glassB = band * step(rel, 3.5);
    float sign = band * step(3.5, rel) * step(rel, 4.3);
    float garage = side * (1.0 - shop) * step(0.2, rel) * step(rel, 2.5) * cBand(fu, 0.16, 0.84, fw.y) * step(0.4, cHash(vec2(floor(wu / bayW), vInfo.z))) * near;
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fr = pow(1.0 - abs(dot(fn, V)), 3.0);
    vec3 skyRef = vec3(0.55, 0.62, 0.7);
    #ifdef USE_FOG
    skyRef = fogColor;
    #endif
    vec3 tint = diffuseColor.rgb;
    vec3 glassC = gl > 0.5 ? tint * 0.38 : vec3(0.035, 0.045, 0.06);
    vec3 refl = skyRef * (gl > 0.5 ? mix(vec3(1.0), tint * 1.5, 0.4) * (0.28 + 0.5 * fr) * win : vec3(0.1 + 0.55 * fr) * (win + glassB));
    vec3 facade = tint * (gl > 0.5 ? 0.6 : 0.94 + 0.12 * fract(s * 11.7)) * (1.0 - 0.45 * uNight);
    facade *= 0.86 + 0.14 * smoothstep(0.0, 5.0, rel);
    facade *= 1.0 - 0.08 * step(fy, 0.05) * step(1.5, cls) * near * wall;
    float lum = dot(facade, vec3(0.2126, 0.7152, 0.0722));
    vec3 trimC = mix(vec3(0.82, 0.8, 0.75) * (1.0 - 0.45 * uNight), facade * 0.62, smoothstep(0.45, 0.65, lum));
    if (cls > 0.5) trimC = facade * 0.8;
    vec3 col = mix(facade, trimC, trim * 0.85);
    col = mix(col, cls < 0.5 ? trimC : facade * 0.76, parapet * side * step(0.2, rel) * 0.9);
    col = mix(col, glassC, win * (gl > 0.5 ? 1.0 : 0.88));
    col = mix(col, glassC * 0.9, glassB * 0.9);
    col = mix(col, mix(vec3(0.16, 0.15, 0.14), facade * 0.55, step(0.5, fract(s * 4.3))), garage * 0.9);
    vec3 awning = mix(vec3(0.5, 0.12, 0.08), vec3(0.08, 0.24, 0.18), step(0.5, fract(s * 13.1)));
    col = mix(col, mix(awning, vec3(0.05), step(0.75, fract(s * 5.7))), sign * 0.85);
    float rs = fract(s * 9.1);
    float west = smoothstep(-2400.0, -3400.0, vWorldPos.x);
    vec3 roofCol = rs < 0.25 ? vec3(0.085, 0.082, 0.078) : rs < 0.47 ? vec3(0.15, 0.142, 0.13) : rs < 0.62 ? vec3(0.13, 0.105, 0.085) : rs < 0.9 || cls > 0.5 ? vec3(0.42, 0.42, 0.4) : vec3(0.3, 0.1, 0.045);
    if (cls < 0.5 && fract(s * 5.3) < 0.22 * west) roofCol = vec3(0.26, 0.1, 0.055);
    vec2 cell = floor(vWorldPos.xz / 7.0);
    vec2 cf = fract(vWorldPos.xz / 7.0);
    float unit = step(0.72, cHash(cell + vInfo.z)) * step(0.2, cf.x) * step(cf.x, 0.75) * step(0.25, cf.y) * step(cf.y, 0.8) * step(0.5, cls);
    float rfade = 1.0 - smoothstep(0.3, 1.2, fwidth(vWorldPos.x / 7.0));
    roofCol = mix(roofCol, vec3(0.32, 0.32, 0.31), unit * rfade);
    roofCol *= 1.0 - 0.45 * uNight;
    col = mix(col, roofCol, roof);
    refl *= side;
    diffuseColor.rgb = col;`,
  ],
  [
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    totalEmissiveRadiance += refl * (1.0 - 0.8 * uNight);
    if (uNight > 0.01) {
      vec2 wid = vec2(floor((rel - base) / floorH) * 131.0 + vInfo.z * 7.0, floor(wu / bayW) * 17.0 + vInfo.z);
      float office = max(gl, step(1.5, cls));
      float litFrac = mix(mix(0.25, 0.6, fract(s * 3.7)), mix(0.35, 0.75, fract(s * 3.7)), office);
      float fl = cHash(vec2(floor((rel - base) / floorH) * 7.1 + vInfo.z, floor(wu / (bayW * 5.0)) * 3.3));
      float floorMul = mix(smoothstep(0.25, 0.75, fl) * 2.0, 1.0, smoothstep(0.35, 0.8, fw.x));
      float lit = step(1.0 - litFrac * floorMul, cHash(wid));
      float k = cHash(wid + 3.1);
      vec3 warm = vec3(1.0, 0.52, 0.2);
      vec3 soft = vec3(1.0, 0.76, 0.48);
      vec3 cool = vec3(0.72, 0.86, 1.0);
      vec3 wc = k < 0.45 ? warm : k < 0.78 ? soft : k < 0.94 ? cool : vec3(0.42, 0.55, 1.0);
      if (office > 0.5) wc = k < 0.62 ? cool : soft;
      wc *= mix(0.55, 1.0, cHash(wid + 7.7));
      vec3 avgC = mix(mix(warm, soft, 0.5) * 0.7, mix(cool, soft, 0.4) * 0.38, office);
      vec3 e = mix(pat * lit * wc, avgWin * litFrac * floorMul * avgC, wfade) * wall;
      e += glassB * vec3(1.0, 0.72, 0.4) * 0.7 * step(0.35, cHash(wid.yy + 5.3)) + sign * mix(vec3(1.0, 0.32, 0.22), vec3(0.3, 0.8, 1.0), step(0.5, fract(s * 13.1))) * 0.7;
      float street = exp(-max(rel, 0.0) / 4.0) * side;
      e += tint * (0.018 + 0.07 * street * vec3(1.0, 0.72, 0.42)) * (1.0 - win);
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
