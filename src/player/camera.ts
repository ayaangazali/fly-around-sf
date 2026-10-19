import * as THREE from 'three';
import { forwardVector, type FlightState } from './flight';

export type ViewMode = 'chase' | 'fpv' | 'orbit';

export class ChaseCamera {
  mode: ViewMode = 'chase';
  distance = 15;
  height = 5;
  orbitYaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private init = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  cycle(): ViewMode {
    this.mode = this.mode === 'chase' ? 'fpv' : this.mode === 'fpv' ? 'orbit' : 'chase';
    return this.mode;
  }

  update(s: FlightState, dt: number, groundAt: (x: number, z: number) => number, reducedMotion = false): void {
    const f = forwardVector(s.yaw);
    const p = s.pos;
    const desired = new THREE.Vector3();
    const target = new THREE.Vector3();
    if (this.mode === 'fpv') {
      desired.set(p.x + f.x * 1.4, p.y - 0.2, p.z + f.z * 1.4);
      target.set(p.x + f.x * 50, p.y - 6, p.z + f.z * 50);
    } else if (this.mode === 'orbit') {
      this.orbitYaw += dt * 0.25;
      const o = forwardVector(s.yaw + this.orbitYaw);
      desired.set(p.x - o.x * this.distance * 1.6, p.y + this.height * 1.8, p.z - o.z * this.distance * 1.6);
      target.set(p.x, p.y, p.z);
    } else {
      const back = this.distance + s.speed * 0.12;
      desired.set(p.x - f.x * back, p.y + this.height + s.vel.y * 0.15, p.z - f.z * back);
      target.set(p.x + f.x * 10, p.y + 1, p.z + f.z * 10);
    }
    desired.y = Math.max(desired.y, groundAt(desired.x, desired.z) + 2);
    if (!this.init || this.mode === 'fpv') {
      this.pos.copy(desired);
      this.look.copy(target);
      this.init = true;
    } else {
      const k = 1 - Math.exp(-(reducedMotion ? 12 : 5) * dt);
      this.pos.lerp(desired, k);
      this.look.lerp(target, Math.min(1, k * 1.6));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    const fov = (this.mode === 'fpv' ? 78 : 60) + (reducedMotion ? 0 : Math.min(14, s.speed * 0.22));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  snap(): void {
    this.init = false;
  }
}
