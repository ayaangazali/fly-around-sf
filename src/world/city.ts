import * as THREE from 'three';
import type { CityData } from './city-data';
import type { ChunkGeometry } from './city-mesh';

export const cityUniforms = { uNight: { value: 0 } };

export function createCityMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = cityUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nuniform float uNight;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 fn = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
        float roof = step(0.6, abs(fn.y));
        vec2 tg = normalize(vec2(-fn.z, fn.x) + 1e-5);
        float wu = dot(vWorldPos.xz, tg);
        float fy = fract(vWorldPos.y / 3.6);
        float fu = fract(wu / 2.8);
        float win = (1.0 - roof) * step(0.32, fy) * step(fy, 0.82) * step(0.16, fu) * step(fu, 0.84);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45 + vec3(0.06, 0.09, 0.13), win * 0.7);
        diffuseColor.rgb *= mix(0.94, 1.06, roof);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float wid = floor(vWorldPos.y / 3.6) * 131.0 + floor(wu / 2.8) * 17.0;
        float lit = step(0.52, fract(sin(wid) * 43758.5453));
        totalEmissiveRadiance += win * lit * uNight * vec3(1.0, 0.78, 0.46) * 0.95;`,
      );
  };
  return mat;
}

export class CityRenderer {
  readonly group = new THREE.Group();
  readonly material = createCityMaterial();
  chunks = 0;
  done = false;
  private worker?: Worker;

  constructor() {
    this.group.name = 'city';
  }

  build(data: CityData, focusX: number, focusZ: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./city-worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onerror = (e) => reject(new Error(`city worker: ${e.message}`));
      worker.onmessage = (e: MessageEvent<ChunkGeometry | { done: true; chunks: number }>) => {
        if ('done' in e.data) {
          this.done = true;
          worker.terminate();
          resolve();
          return;
        }
        this.add(e.data);
      };
      worker.postMessage({
        height: data.height,
        ground: data.ground,
        start: data.start,
        len: data.len,
        xs: data.xs,
        zs: data.zs,
        cx: data.cx,
        cz: data.cz,
        hidden: data.hidden,
        focusX,
        focusZ,
      });
    });
  }

  private add(c: ChunkGeometry): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c.color, 3, true));
    geo.setIndex(new THREE.BufferAttribute(c.index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = `chunk:${c.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.chunks++;
  }

  dispose(): void {
    this.worker?.terminate();
  }
}
