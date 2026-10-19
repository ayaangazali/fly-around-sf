import { describe, expect, it } from 'vitest';
import { stickAxes } from '../../src/ui/touch';
import { Input } from '../../src/core/input';

describe('touch sticks', () => {
  it('[R-TOUCH] stick axes have a dead zone, scale smoothly and clamp to the rim', () => {
    expect(stickAxes(5, 0, 60)).toEqual({ x: 0, y: 0 });
    const half = stickAxes(0, -30, 60);
    expect(half.x).toBeCloseTo(0);
    expect(half.y).toBeLessThan(-0.4);
    expect(half.y).toBeGreaterThan(-0.5);
    const rim = stickAxes(60, 0, 60);
    expect(rim.x).toBeCloseTo(1);
    const diag = stickAxes(100, 100, 60);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
  });

  it('[R-TOUCH] touch axes merge into flight input', () => {
    const input = new Input({ addEventListener: () => undefined });
    input.touch = { forward: 1, turn: -0.5, lift: 0.25, strafe: 0, boost: true };
    expect(input.flight()).toEqual({ forward: 1, strafe: 0, lift: 0.25, yaw: -0.5, boost: true });
  });
});
