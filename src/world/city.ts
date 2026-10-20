import * as THREE from 'three';
import type { CityData } from './city-data';
import { LOD_SIZES, type ChunkGeometry } from './city-mesh';
import { createCityMaterial } from './city-shader';

export const cityUniforms = { uNight: { value: 0 } };
const LOD_PIXELS = 2;

export class CityRenderer {
  readonly group = new THREE.Group();
  readonly material = createCityMaterial(cityUniforms.uNight);
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
    geo.setAttribute('aInfo', new THREE.BufferAttribute(c.info, 1));
    geo.setIndex(new THREE.BufferAttribute(c.index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    const sphere = geo.boundingSphere!;
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const d = Math.max(0, cam.position.distanceTo(sphere.center) - sphere.radius);
      const min = (d * 2 * Math.tan((cam.fov * Math.PI) / 360) * LOD_PIXELS) / renderer.domElement.height;
      let l = 0;
      while (l + 1 < LOD_SIZES.length && LOD_SIZES[l + 1] <= min) l++;
      geo.setDrawRange(0, c.lod[l]);
    };
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
