import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { nightFactor, sunPosition } from '../core/sun';
import { ORIGIN } from '../core/geo';
import { cityUniforms } from './city';

const DAY_FOG = new THREE.Color('#cfdbe3');
const DUSK_FOG = new THREE.Color('#e9c7ae');
const NIGHT_FOG = new THREE.Color('#121a26');

export class SkySystem {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  readonly hemi = new THREE.HemisphereLight('#dfefff', '#8a8468', 1.1);
  readonly fog: THREE.Fog;
  night = 0;
  sunDir = new THREE.Vector3();
  fogDensity = 1;

  constructor(scene: THREE.Scene, shadowSize: number) {
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    this.fog = new THREE.Fog(DAY_FOG.clone(), 900, 9000);
    scene.fog = this.fog;
    scene.background = this.fog.color;
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

  update(date: Date, focus: THREE.Vector3): void {
    const { altitude, azimuth } = sunPosition(date, ORIGIN.lat, ORIGIN.lon);
    this.sunDir.set(Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude), -Math.cos(azimuth) * Math.cos(altitude));
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.night = nightFactor(altitude);
    cityUniforms.uNight.value = this.night;
    const elev = altitude * (180 / Math.PI);
    const dusk = Math.max(0, 1 - Math.abs(elev - 2) / 12);
    this.fog.color.copy(DAY_FOG).lerp(DUSK_FOG, dusk * 0.8).lerp(NIGHT_FOG, this.night);
    this.fog.near = 700 / this.fogDensity;
    this.fog.far = 8500 / this.fogDensity;
    const lightDir = altitude > 0 ? this.sunDir : this.sunDir.clone().setY(Math.max(0.2, -this.sunDir.y));
    this.sun.position.copy(focus).addScaledVector(lightDir, 1000);
    this.sun.target.position.copy(focus);
    this.sun.intensity = 2.6 * Math.max(0, Math.min(1, elev / 8)) + 0.25 * this.night;
    this.sun.color.set(this.night > 0.5 ? '#9fb4ff' : dusk > 0.4 ? '#ffc890' : '#fff4e0');
    this.hemi.intensity = 0.35 + 0.85 * (1 - this.night);
    this.sky.visible = this.night < 0.98;
  }
}
