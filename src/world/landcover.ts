import * as THREE from 'three';
import { Cover, type Area } from './env-data';

export interface Grid {
  w: number;
  h: number;
  cell: number;
  minX: number;
  minZ: number;
}

export class Landcover implements Grid {
  readonly cls: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly cell: number,
    readonly minX: number,
    readonly minZ: number,
  ) {
    this.cls = new Uint8Array(w * h);
  }

  static rasterize(areas: Area[], grid: Grid): Landcover {
    const lc = new Landcover(grid.w, grid.h, grid.cell, grid.minX, grid.minZ);
    const xs: number[] = [];
    for (const area of areas) {
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const r of area.rings) for (const z of r.zs) [minZ, maxZ] = [Math.min(minZ, z), Math.max(maxZ, z)];
      const j0 = Math.max(0, Math.ceil((minZ - lc.minZ) / lc.cell - 0.5));
      const j1 = Math.min(lc.h - 1, Math.floor((maxZ - lc.minZ) / lc.cell - 0.5));
      for (let j = j0; j <= j1; j++) {
        const z = lc.minZ + (j + 0.5) * lc.cell;
        xs.length = 0;
        for (const r of area.rings) {
          const n = r.xs.length;
          for (let i = 0, k = n - 1; i < n; k = i++) {
            const zi = r.zs[i];
            const zk = r.zs[k];
            if (zi > z !== zk > z) xs.push(r.xs[i] + ((r.xs[k] - r.xs[i]) * (z - zi)) / (zk - zi));
          }
        }
        xs.sort((a, b) => a - b);
        for (let p = 0; p + 1 < xs.length; p += 2) {
          const i0 = Math.max(0, Math.ceil((xs[p] - lc.minX) / lc.cell - 0.5));
          const i1 = Math.min(lc.w - 1, Math.floor((xs[p + 1] - lc.minX) / lc.cell - 0.5));
          if (i1 >= i0) lc.cls.fill(area.cls, j * lc.w + i0, j * lc.w + i1 + 1);
        }
      }
    }
    return lc;
  }

  index(x: number, z: number): number {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }

  at(x: number, z: number): number {
    const k = this.index(x, z);
    return k < 0 ? 0 : this.cls[k];
  }

  rgba(): Uint8Array {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.cls.length; i++) {
      const c = this.cls[i];
      const o = i * 4;
      if (c === Cover.Grass) out[o] = 255;
      else if (c === Cover.Wood) out[o + 1] = 255;
      else if (c === Cover.Scrub) [out[o], out[o + 1]] = [150, 105];
      else if (c === Cover.Sand) out[o + 2] = 255;
      else if (c === Cover.Lake) out[o + 3] = 255;
    }
    return out;
  }

  texture(): THREE.DataTexture {
    const t = new THREE.DataTexture(this.rgba(), this.w, this.h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }
}

export function patchGround(mat: THREE.MeshLambertMaterial, tex: THREE.Texture, grid: Grid, night: { value: number }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCover = { value: tex };
    shader.uniforms.uCoverBox = { value: new THREE.Vector4(grid.minX, grid.minZ, grid.w * grid.cell, grid.h * grid.cell) };
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;\nuniform sampler2D uCover;\nuniform vec4 uCoverBox;\nuniform float uNight;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec4 cov = texture2D(uCover, (vGround.xz - uCoverBox.xy) / uCoverBox.zw);
        vec2 gq = floor(vGround.xz / 6.0);
        float gn = fract(sin(dot(gq, vec2(12.9898, 78.233))) * 43758.5453);
        float far = smoothstep(600.0, 2500.0, length(vGround - cameraPosition));
        gn = mix(gn, 0.5, far);
        float land = smoothstep(0.3, 1.5, vGround.y);
        float yard = step(0.64, fract(sin(dot(floor(vGround.xz / 9.0), vec2(39.3, 11.7))) * 24634.63));
        vec3 urban = mix(mix(vec3(0.3, 0.29, 0.27), vec3(0.35, 0.34, 0.31), gn), mix(vec3(0.17, 0.21, 0.11), vec3(0.24, 0.23, 0.18), gn), mix(yard, 0.36, far));
        vec3 base = mix(diffuseColor.rgb, urban, land * 0.85);
        vec3 grass = mix(vec3(0.44, 0.6, 0.3), vec3(0.52, 0.66, 0.34), gn);
        vec3 wood = mix(vec3(0.22, 0.36, 0.2), vec3(0.28, 0.42, 0.24), gn);
        vec3 sand = mix(vec3(0.86, 0.8, 0.64), vec3(0.9, 0.85, 0.7), gn);
        vec3 lake = vec3(0.2, 0.36, 0.42);
        base = mix(base, grass, cov.r * (1.0 - cov.g));
        base = mix(base, wood, cov.g);
        base = mix(base, sand, cov.b);
        base = mix(base, lake, cov.a);
        diffuseColor.rgb = base;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uNight * land * (1.0 - max(cov.r, cov.g)) * (1.0 - cov.a) * vec3(0.025, 0.018, 0.01);`,
      );
  };
  mat.needsUpdate = true;
}
