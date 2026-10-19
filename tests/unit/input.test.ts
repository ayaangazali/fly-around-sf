import { describe, expect, it } from 'vitest';
import { Input } from '../../src/core/input';

const key = (target: EventTarget, type: 'keydown' | 'keyup', code: string, from?: object) => {
  const e = Object.assign(new Event(type, { cancelable: true }), { code });
  if (from) Object.defineProperty(e, 'target', { value: from });
  target.dispatchEvent(e);
  return e;
};

describe('input', () => {
  it('[R-INPUT] maps WASD, arrows, space/shift, Q/E and R to flight axes', () => {
    const t = new EventTarget();
    const input = new Input(t as unknown as Window);
    key(t, 'keydown', 'KeyW');
    key(t, 'keydown', 'KeyD');
    key(t, 'keydown', 'Space');
    key(t, 'keydown', 'KeyE');
    key(t, 'keydown', 'KeyR');
    expect(input.flight()).toEqual({ forward: 1, strafe: 1, lift: 1, yaw: 1, boost: true });
    key(t, 'keyup', 'KeyW');
    key(t, 'keydown', 'ArrowDown');
    key(t, 'keydown', 'ShiftLeft');
    key(t, 'keyup', 'Space');
    expect(input.flight().forward).toBe(-1);
    expect(input.flight().lift).toBe(-1);
    t.dispatchEvent(new Event('blur'));
    expect(input.flight()).toEqual({ forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false });
  });

  it('[R-INPUT] actions fire once per press and ignore typing in text fields', () => {
    const t = new EventTarget();
    const input = new Input(t as unknown as Window);
    key(t, 'keydown', 'KeyF');
    key(t, 'keydown', 'KeyF');
    expect(input.consume('interact')).toBe(true);
    expect(input.consume('interact')).toBe(false);
    key(t, 'keyup', 'KeyF');
    key(t, 'keydown', 'KeyM', { tagName: 'INPUT' });
    expect(input.consume('map')).toBe(false);
    input.press('photo');
    input.clearPressed();
    expect(input.consume('photo')).toBe(false);
    expect(key(t, 'keydown', 'Space').defaultPrevented).toBe(true);
  });

  it('[R-INPUT] merges touch axes, clamps, and can be disabled', () => {
    const t = new EventTarget();
    const input = new Input(t as unknown as Window);
    input.touch = { forward: 0.5, turn: -1, lift: 0.3, strafe: 0, boost: false };
    key(t, 'keydown', 'KeyW');
    expect(input.flight().forward).toBe(1);
    expect(input.flight().yaw).toBe(-1);
    expect(input.flight().lift).toBeCloseTo(0.3);
    input.enabled = false;
    expect(input.flight().forward).toBe(0);
  });
});
