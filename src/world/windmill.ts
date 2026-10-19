import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Game } from '../game';
import { Site, paint, type LandmarkSource } from './landmark-kit';

export interface WindmillSpec {
  height: number;
  sailSpan: number;
  baseRadius: number;
  body: string;
  facing: number;
}

export function buildWindmill(game: Game, id: string, at: LandmarkSource, spec: WindmillSpec, extras?: (site: Site) => void): Site {
  const site = new Site(game, id, at, spec.facing);
  const body = paint(spec.body, true);
  const trim = paint('#f2efe6');
  const cap = paint('#4a3b30', true);
  const sail = paint('#f4f1ea', false, true);
  const frame = paint('#6b4b33');
  const tower = spec.height * 0.78;
  site.cyl(paint('#9c9488', true), spec.baseRadius + 1.5, spec.baseRadius + 1.2, 4, 0, -1, 0, 8);
  site.cyl(body, spec.baseRadius, spec.baseRadius * 0.62, tower - 3, 0, 3, 0, 8);
  site.cyl(trim, spec.baseRadius * 0.95, spec.baseRadius * 0.95, 0.5, 0, tower * 0.42, 0, 8);
  site.cyl(frame, spec.baseRadius + 2.4, spec.baseRadius + 2.4, 0.4, 0, tower * 0.42 - 0.4, 0, 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = spec.baseRadius * 0.82;
    site.box(paint('#2e2a26'), 1, 1.6, 0.2, Math.sin(a) * r, tower * 0.62, Math.cos(a) * r, a);
  }
  site.lathe(cap, [[0, 0], [spec.baseRadius * 0.7, 0], [spec.baseRadius * 0.66, 2], [spec.baseRadius * 0.45, 4.4], [0, 5.6]], 0, tower, 0, 8);
  site.solidCyl(0, -1, 0, spec.baseRadius + 0.5, tower + 6);

  const hub = new THREE.Group();
  hub.position.set(0, tower + 2.4, spec.baseRadius * 0.75 + 0.8);
  const arm = spec.sailSpan / 2;
  const parts: THREE.BufferGeometry[] = [];
  const lattice: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const rot = new THREE.Matrix4().makeRotationZ((k * Math.PI) / 2);
    parts.push(new THREE.BoxGeometry(0.5, arm, 0.4).translate(0, arm / 2, 0).applyMatrix4(rot));
    lattice.push(new THREE.BoxGeometry(arm * 0.13, arm * 0.78, 0.08).translate(arm * 0.08, arm * 0.58, -0.25).applyMatrix4(rot));
  }
  parts.push(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 8).rotateX(Math.PI / 2));
  const sails = new THREE.Mesh(mergeGeometries(lattice), sail);
  const spars = new THREE.Mesh(mergeGeometries(parts), frame);
  hub.add(spars, sails);
  sails.castShadow = spars.castShadow = true;
  spars.onBeforeRender = () => {
    hub.rotation.z = -(performance.now() / 1000) * 0.35;
  };
  site.group.add(hub);
  extras?.(site);
  site.finish();
  return site;
}
