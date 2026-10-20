import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface DroneModel {
  root: THREE.Group;
  body: THREE.Group;
  rotors: THREE.Object3D[];
  lights: THREE.Mesh[];
}

export function createDroneModel(color = '#f2f2ee', accent = '#ff6a3d'): DroneModel {
  const root = new THREE.Group();
  root.name = 'drone';
  const body = new THREE.Group();
  root.add(body);
  const shell = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, emissive: accent, emissiveIntensity: 0.25 });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 6, 12), shell);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.55);
  body.add(hull);
  const dark: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.2, 12, 8).translate(0, -0.2, -0.55)];
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.3), accentMat);
  stripe.position.set(0, 0.24, 0.1);
  body.add(stripe);

  const rotors: THREE.Object3D[] = [];
  const discs: THREE.BufferGeometry[] = [];
  const leds: THREE.BufferGeometry[][] = [[], []];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    dark.push(new THREE.BoxGeometry(0.1, 0.08, 1.25).rotateY(Math.atan2(sx, sz)).translate(sx * 0.45, 0.05, sz * 0.45));
    dark.push(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12).translate(sx * 0.9, 0.12, sz * 0.9));
    const blade = new THREE.BoxGeometry(0.95, 0.015, 0.09);
    const rotor = new THREE.Mesh(mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2)]), shell);
    rotor.position.set(sx * 0.9, 0.24, sz * 0.9);
    body.add(rotor);
    rotors.push(rotor);
    discs.push(new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2).translate(sx * 0.9, 0.24, sz * 0.9));
    leds[sz < 0 ? 1 : 0].push(new THREE.SphereGeometry(0.06, 8, 6).translate(sx * 0.9, 0.02, sz * 0.9));
  }
  body.add(new THREE.Mesh(mergeGeometries(dark), darkMat));
  body.add(new THREE.Mesh(mergeGeometries(discs), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })));
  const lights = leds.map((g, i) => new THREE.Mesh(mergeGeometries(g), new THREE.MeshBasicMaterial({ color: i ? '#7dffb0' : '#ff4d4d' })));
  body.add(...lights);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  root.scale.setScalar(1.6);
  return { root, body, rotors, lights };
}

export function animateDrone(m: DroneModel, t: number, throttle: number, pitch: number, roll: number): void {
  const spin = 40 + throttle * 30;
  m.rotors.forEach((r, i) => (r.rotation.y = t * spin * (i % 2 ? 1 : -1)));
  m.body.rotation.set(pitch, 0, roll);
  m.body.position.y = Math.sin(t * 2.1) * 0.06;
  const blink = Math.floor(t * 1.5) % 2 === 0;
  m.lights.forEach((l, i) => (l.visible = i === 0 || blink));
}
