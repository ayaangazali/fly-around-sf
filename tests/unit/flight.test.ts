import { describe, expect, it } from 'vitest';
import { createFlight, stepFlight, FLIGHT, MACH, forwardVector, type FlightInput, type FlightEnv } from '../../src/player/flight';

const idle: FlightInput = { forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false };
const flat: FlightEnv = { groundAt: () => 10, collide: () => false };
const run = (s: ReturnType<typeof createFlight>, input: Partial<FlightInput>, seconds: number, env: FlightEnv = flat) => {
  let last = { impact: 0, splashed: false, grounded: false };
  let impact = 0;
  let splashed = false;
  for (let t = 0; t < seconds; t += 1 / 60) {
    last = stepFlight(s, { ...idle, ...input }, 1 / 60, env);
    impact = Math.max(impact, last.impact);
    splashed ||= last.splashed;
  }
  return { ...last, impact, splashed };
};

describe('flight', () => {
  it('[R-FLIGHT] flies north (-z) when facing yaw 0 and approaches cruise speed', () => {
    const s = createFlight(0, 100, 0, 0);
    run(s, { forward: 1 }, 3);
    expect(s.pos.z).toBeLessThan(-40);
    expect(Math.abs(s.pos.x)).toBeLessThan(0.01);
    expect(s.speed).toBeGreaterThan(FLIGHT.cruise * 0.95);
    expect(s.speed).toBeLessThan(FLIGHT.cruise * 1.01);
    expect(forwardVector(Math.PI / 2).x).toBeCloseTo(-1);
  });

  it('[R-FLIGHT] boost is faster than cruise, diagonals are not faster than straight', () => {
    const a = createFlight(0, 100, 0);
    run(a, { forward: 1, boost: true }, 1.5);
    expect(a.speed).toBeGreaterThan(FLIGHT.cruise * 1.8);
    const b = createFlight(0, 100, 0);
    run(b, { forward: 1, strafe: 1 }, 4);
    expect(b.speed).toBeLessThan(FLIGHT.cruise * 1.01);
  });

  it('[R-V2-SPEED] cruise passes 60 m/s, boost 150 m/s, and holding boost goes supersonic within 5 s', () => {
    const time = (input: Partial<FlightInput>, speed: number) => {
      const s = createFlight(0, 100, 0);
      for (let t = 0; t < 10; t += 1 / 60) {
        stepFlight(s, { ...idle, ...input }, 1 / 60, flat);
        if (s.speed >= speed) return t;
      }
      return Infinity;
    };
    expect(time({ forward: 1 }, 60)).toBeLessThan(2);
    expect(time({ forward: 1, boost: true }, 150)).toBeLessThan(FLIGHT.superAfter);
    expect(time({ forward: 1, boost: true }, MACH)).toBeLessThan(5);
    expect(time({ boost: true }, 1)).toBe(Infinity);
    const s = createFlight(0, 100, 0);
    run(s, { forward: 1, boost: true }, 5);
    run(s, { forward: 1 }, 4);
    expect(s.speed).toBeLessThan(FLIGHT.cruise * 1.01);
    run(s, { forward: 1, boost: true }, FLIGHT.superAfter * 0.9);
    expect(s.speed).toBeLessThan(MACH);
  });

  it('[R-V2-SPEED] supersonic flight cannot tunnel through a thin wall', () => {
    const slab: FlightEnv = {
      groundAt: () => 0,
      collide: (p, r) => {
        if (p.z > -50.5 - r && p.z < -49.5 + r) {
          p.z = p.z > -50 ? -49.5 + r : -50.5 - r;
          return true;
        }
        return false;
      },
    };
    const s = createFlight(0, 50, -32, 0);
    s.vel.z = -FLIGHT.supersonic;
    s.boostHeld = FLIGHT.superAfter;
    run(s, { forward: 1, boost: true }, 1, slab);
    expect(s.pos.z).toBeGreaterThan(-50);
  });

  it('[R-FLIGHT] turning right lowers yaw, strafing right moves +x when facing north', () => {
    const s = createFlight(0, 100, 0, 0);
    run(s, { yaw: 1 }, 1);
    expect(s.yaw).toBeCloseTo(-FLIGHT.yawRate, 1);
    const t = createFlight(0, 100, 0, 0);
    run(t, { strafe: 1 }, 2);
    expect(t.pos.x).toBeGreaterThan(20);
  });

  it('[R-FLIGHT] never goes below ground or water and reports hard landings', () => {
    const s = createFlight(0, 30, 0);
    const r = run(s, { lift: -1 }, 4);
    expect(s.pos.y).toBeCloseTo(10 + FLIGHT.radius, 5);
    expect(r.grounded).toBe(true);
    const w = createFlight(0, 30, 0);
    const res = run(w, { lift: -1 }, 4, { groundAt: () => -20, collide: () => false });
    expect(w.pos.y).toBeCloseTo(FLIGHT.waterLevel + FLIGHT.radius, 5);
    expect(res.splashed).toBe(true);
  });

  it('[R-FLIGHT] respects the ceiling', () => {
    const s = createFlight(0, FLIGHT.ceiling - 5, 0);
    run(s, { lift: 1 }, 3);
    expect(s.pos.y).toBeLessThanOrEqual(FLIGHT.ceiling);
  });

  it('[R-FLIGHT] bounces off walls and reports crash impacts above the threshold', () => {
    const wall: FlightEnv = {
      groundAt: () => 0,
      collide: (p, r) => {
        if (p.z < -50 + r) {
          p.z = -50 + r;
          return true;
        }
        return false;
      },
    };
    const s = createFlight(0, 50, 0, 0);
    const res = run(s, { forward: 1, boost: true }, 3, wall);
    expect(s.pos.z).toBeGreaterThanOrEqual(-50 + FLIGHT.radius - 1e-9);
    expect(res.impact).toBeGreaterThan(FLIGHT.crashSpeed);
    const gentle = createFlight(0, 50, -45, 0);
    expect(run(gentle, { forward: 0.1 }, 3, wall).impact).toBe(0);
  });

  it('[R-V2-HOLD] a drone with no input holds still in any wind, and wind only drifts a moving drone', () => {
    const windy: FlightEnv = { ...flat, wind: { x: 7, z: -4 } };
    const s = createFlight(0, 100, 0);
    run(s, {}, 15, windy);
    expect(Math.hypot(s.pos.x, s.pos.y - 100, s.pos.z)).toBeLessThan(0.01);
    run(s, { forward: 1 }, 2, windy);
    expect(s.pos.x).toBeGreaterThan(5);
    run(s, {}, 5, windy);
    const still = { ...s.pos };
    run(s, {}, 15, windy);
    expect(Math.hypot(s.pos.x - still.x, s.pos.z - still.z)).toBeLessThan(0.01);
  });
});
