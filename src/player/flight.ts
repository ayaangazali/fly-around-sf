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
  speed: number;
  boostHeld: number;
}

export interface FlightEnv {
  groundAt(x: number, z: number): number;
  collide(p: Vec3, r: number): boolean;
  wind?: { x: number; z: number };
  turnRate?: number;
}

export interface FlightResult {
  impact: number;
  splashed: boolean;
  grounded: boolean;
}

export const MACH = 343;

export const FLIGHT = {
  radius: 1.2,
  cruise: 64,
  boost: 160,
  supersonic: 400,
  superAfter: 1.5,
  climb: 14,
  yawRate: 1.9,
  response: 2.6,
  verticalResponse: 4,
  ceiling: 900,
  waterLevel: 0,
  crashSpeed: 14,
};

export function createFlight(x: number, y: number, z: number, yaw = 0): FlightState {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, roll: 0, speed: 0, boostHeld: 0 };
}

export function forwardVector(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function stepFlight(s: FlightState, input: FlightInput, dt: number, env: FlightEnv): FlightResult {
  s.yaw -= clamp(input.yaw, -1, 1) * FLIGHT.yawRate * (env.turnRate ?? 1) * dt;
  const f = forwardVector(s.yaw);
  const rx = -f.z;
  const rz = f.x;
  const fwd = clamp(input.forward, -1, 1);
  const str = clamp(input.strafe, -1, 1);
  const mag = Math.min(1, Math.hypot(fwd, str));
  const norm = mag > 0 ? mag / Math.hypot(fwd, str) : 0;
  s.boostHeld = input.boost && mag > 0.5 ? s.boostHeld + dt : 0;
  const top = s.boostHeld >= FLIGHT.superAfter ? FLIGHT.supersonic : input.boost ? FLIGHT.boost : FLIGHT.cruise;
  const wind = env.wind ?? { x: 0, z: 0 };
  const tx = (f.x * fwd + rx * str) * norm * top + wind.x * mag;
  const tz = (f.z * fwd + rz * str) * norm * top + wind.z * mag;
  const ty = clamp(input.lift, -1, 1) * FLIGHT.climb;
  const k = 1 - Math.exp(-FLIGHT.response * dt);
  const kv = 1 - Math.exp(-FLIGHT.verticalResponse * dt);
  s.vel.x += (tx - s.vel.x) * k;
  s.vel.z += (tz - s.vel.z) * k;
  s.vel.y += (ty - s.vel.y) * kv;

  let impact = 0;
  let splashed = false;
  let grounded = false;
  const n = Math.max(1, Math.ceil((Math.hypot(s.vel.x, s.vel.y, s.vel.z) * dt) / FLIGHT.radius));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.pos.x += s.vel.x * h;
    s.pos.y += s.vel.y * h;
    s.pos.z += s.vel.z * h;
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
    if (!env.collide(s.pos, FLIGHT.radius)) continue;
    const dx = s.pos.x - pre.x;
    const dy = s.pos.y - pre.y;
    const dz = s.pos.z - pre.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;
    const into = -(s.vel.x * nx + s.vel.y * ny + s.vel.z * nz);
    if (into <= 0) continue;
    impact = Math.max(impact, into);
    s.vel.x += nx * into * 1.35;
    s.vel.y += ny * into * 1.35;
    s.vel.z += nz * into * 1.35;
    if (ny > 0.7) grounded = true;
  }

  s.speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  const localFwd = s.vel.x * f.x + s.vel.z * f.z;
  const localRight = s.vel.x * rx + s.vel.z * rz;
  s.pitch += (clamp(-localFwd / FLIGHT.boost, -1, 1) * 0.45 - s.pitch) * Math.min(1, dt * 6);
  s.roll += (clamp(-localRight / FLIGHT.cruise, -1, 1) * 0.5 - s.roll) * Math.min(1, dt * 6);
  return { impact: impact >= FLIGHT.crashSpeed ? impact : 0, splashed, grounded };
}
