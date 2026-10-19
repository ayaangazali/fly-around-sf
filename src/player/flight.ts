export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FlightInput {
  forward: number;
  strafe: number;
  lift: number;
  yaw: number;
  boost: boolean;
}

export interface FlightState {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  battery: number;
  speed: number;
}

export interface FlightEnv {
  groundAt(x: number, z: number): number;
  collide(p: Vec3, r: number): boolean;
  wind?: { x: number; z: number };
  batteryDrain?: number;
}

export interface FlightResult {
  impact: number;
  splashed: boolean;
  grounded: boolean;
}

export const FLIGHT = {
  radius: 1.2,
  cruise: 30,
  boost: 62,
  climb: 14,
  yawRate: 1.9,
  response: 2.6,
  verticalResponse: 4,
  ceiling: 900,
  waterLevel: 0,
  crashSpeed: 14,
  lowBatterySpeed: 0.55,
};

export function createFlight(x: number, y: number, z: number, yaw = 0): FlightState {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, roll: 0, battery: 1, speed: 0 };
}

export function forwardVector(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function stepFlight(s: FlightState, input: FlightInput, dt: number, env: FlightEnv): FlightResult {
  s.yaw -= clamp(input.yaw, -1, 1) * FLIGHT.yawRate * dt;
  const f = forwardVector(s.yaw);
  const rx = -f.z;
  const rz = f.x;
  const fwd = clamp(input.forward, -1, 1);
  const str = clamp(input.strafe, -1, 1);
  const mag = Math.min(1, Math.hypot(fwd, str));
  const norm = mag > 0 ? mag / Math.hypot(fwd, str) : 0;
  const power = s.battery > 0.05 ? 1 : FLIGHT.lowBatterySpeed;
  const top = (input.boost ? FLIGHT.boost : FLIGHT.cruise) * power;
  const wind = env.wind ?? { x: 0, z: 0 };
  const tx = (f.x * fwd + rx * str) * norm * top + wind.x;
  const tz = (f.z * fwd + rz * str) * norm * top + wind.z;
  const ty = clamp(input.lift, -1, 1) * FLIGHT.climb * power;
  const k = 1 - Math.exp(-FLIGHT.response * dt);
  const kv = 1 - Math.exp(-FLIGHT.verticalResponse * dt);
  const ax = (tx - s.vel.x) * k;
  const az = (tz - s.vel.z) * k;
  s.vel.x += ax;
  s.vel.z += az;
  s.vel.y += (ty - s.vel.y) * kv;

  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  s.pos.z += s.vel.z * dt;

  let impact = 0;
  let splashed = false;
  let grounded = false;
  const ground = env.groundAt(s.pos.x, s.pos.z);
  const floor = Math.max(ground, FLIGHT.waterLevel) + FLIGHT.radius;
  if (s.pos.y < floor) {
    if (ground < FLIGHT.waterLevel && s.vel.y < -6) splashed = true;
    impact = Math.max(impact, -s.vel.y);
    s.pos.y = floor;
    s.vel.y = Math.max(0, s.vel.y);
    grounded = true;
  }
  if (s.pos.y > FLIGHT.ceiling) {
    s.pos.y = FLIGHT.ceiling;
    s.vel.y = Math.min(0, s.vel.y);
  }
  const pre = { ...s.pos };
  if (env.collide(s.pos, FLIGHT.radius)) {
    const dx = s.pos.x - pre.x;
    const dy = s.pos.y - pre.y;
    const dz = s.pos.z - pre.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;
      const into = -(s.vel.x * nx + s.vel.y * ny + s.vel.z * nz);
      if (into > 0) {
        impact = Math.max(impact, into);
        s.vel.x += nx * into * 1.35;
        s.vel.y += ny * into * 1.35;
        s.vel.z += nz * into * 1.35;
        if (ny > 0.7) grounded = true;
      }
    }
  }

  s.speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  const localFwd = s.vel.x * f.x + s.vel.z * f.z;
  const localRight = s.vel.x * rx + s.vel.z * rz;
  s.pitch += (clamp(-localFwd / FLIGHT.boost, -1, 1) * 0.45 - s.pitch) * Math.min(1, dt * 6);
  s.roll += (clamp(-localRight / FLIGHT.cruise, -1, 1) * 0.5 - s.roll) * Math.min(1, dt * 6);
  const drain = env.batteryDrain ?? 1 / 1800;
  s.battery = clamp(s.battery - drain * dt * (input.boost ? 2.5 : mag > 0 ? 1 : 0.3), 0, 1);
  return { impact: impact >= FLIGHT.crashSpeed ? impact : 0, splashed, grounded };
}
