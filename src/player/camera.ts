import * as THREE from 'three';
import { FLIGHT, forwardVector, type FlightEnv, type FlightState, type Vec3 } from './flight';

export type ViewMode = 'chase' | 'fpv' | 'orbit';

type Solid = Pick<FlightEnv, 'groundAt' | 'collide'>;

export class ChaseCamera {
  mode: ViewMode = 'chase';
  distance = 15;
  height = 5;
  orbitYaw = 0;
  shake = 0;
  private off = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private init = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  cycle(): ViewMode {
    this.mode = this.mode === 'chase' ? 'fpv' : this.mode === 'fpv' ? 'orbit' : 'chase';
    return this.mode;
  }

  update(s: FlightState, dt: number, env: Solid, reducedMotion = false): void {
    const f = forwardVector(s.yaw);
    const p = s.pos;
    const off = new THREE.Vector3();
    const aim = new THREE.Vector3();
    if (this.mode === 'fpv') {
      off.set(f.x * 1.4, -0.2, f.z * 1.4);
      aim.set(f.x * 50, -6, f.z * 50);
    } else if (this.mode === 'orbit') {
      this.orbitYaw += dt * 0.25;
      const o = forwardVector(s.yaw + this.orbitYaw);
      off.set(-o.x * this.distance * 1.6, this.height * 1.8, -o.z * this.distance * 1.6);
    } else {
      const back = this.distance + Math.min(s.speed, FLIGHT.boost) * 0.06;
      off.set(-f.x * back, this.height + s.vel.y * 0.15, -f.z * back);
      aim.set(f.x * 10, 1, f.z * 10);
    }
    if (!this.init || this.mode === 'fpv') {
      this.off.copy(off);
      this.aim.copy(aim);
      this.init = true;
    } else {
      const k = 1 - Math.exp(-(reducedMotion ? 12 : 5) * dt);
      this.off.lerp(off, k);
      this.aim.lerp(aim, Math.min(1, k * 1.6));
    }
    if (this.mode !== 'fpv') this.off.multiplyScalar(clearance(p, this.off, env));
    this.camera.position.set(p.x + this.off.x, p.y + this.off.y, p.z + this.off.z);
    this.camera.lookAt(p.x + this.aim.x, p.y + this.aim.y, p.z + this.aim.z);
    if (this.shake > 0.01) {
      if (!reducedMotion) this.camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake));
      this.shake *= Math.exp(-dt * 1.2);
    }
    const fov = (this.mode === 'fpv' ? 78 : 60) + (reducedMotion ? 0 : 32 * (1 - Math.exp(-s.speed / 180)));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  snap(): void {
    this.init = false;
  }
}

export function clearance(p: Vec3, off: Vec3, env: Solid): number {
  const len = Math.hypot(off.x, off.y, off.z);
  const steps = Math.ceil(len / 1.5);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const q = { x: p.x + off.x * t, y: p.y + off.y * t, z: p.z + off.z * t };
    if (q.y < env.groundAt(q.x, q.z) + 0.5 || env.collide(q, 0.6)) return Math.max(0, t - 1.5 / len);
  }
  return 1;
}
