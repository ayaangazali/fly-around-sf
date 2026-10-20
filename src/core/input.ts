import type { FlightInput } from '../player/flight';

export type Action = 'interact' | 'photo' | 'map' | 'journal' | 'dex' | 'view' | 'menu' | 'chat' | 'ping' | 'help' | 'talk' | 'quests' | 'ask' | 'cycle';

export const KEYMAP: Record<string, Action> = {
  KeyF: 'interact',
  KeyP: 'photo',
  KeyM: 'map',
  KeyJ: 'journal',
  KeyK: 'dex',
  KeyV: 'view',
  Escape: 'menu',
  Enter: 'chat',
  KeyG: 'ping',
  KeyH: 'help',
  KeyT: 'talk',
  KeyL: 'quests',
  Slash: 'ask',
  KeyC: 'cycle',
};

const GAMEPAD_ACTIONS: [number, Action][] = [
  [15, 'cycle'],
  [0, 'interact'],
  [2, 'photo'],
  [3, 'map'],
  [9, 'menu'],
  [8, 'journal'],
  [4, 'ping'],
];

const NO_PAD = { forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false };

export interface TouchAxes {
  forward: number;
  turn: number;
  lift: number;
  strafe: number;
  boost: boolean;
}

export class Input {
  readonly held = new Set<string>();
  private pressed = new Set<Action>();
  private padPrev = new Set<number>();
  private pad = NO_PAD;
  touch: TouchAxes = { forward: 0, turn: 0, lift: 0, strafe: 0, boost: false };
  enabled = true;

  constructor(target: Pick<Window, 'addEventListener'> = window) {
    target.addEventListener('keydown', (e: KeyboardEvent) => {
      if (isTyping(e.target) || forPage(e)) return;
      if (!this.held.has(e.code)) {
        const action = KEYMAP[e.code];
        if (action) this.pressed.add(action);
      }
      this.held.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    target.addEventListener('keyup', (e: KeyboardEvent) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  press(action: Action): void {
    this.pressed.add(action);
  }

  consume(action: Action): boolean {
    return this.pressed.delete(action);
  }

  clearPressed(): void {
    this.pressed.clear();
  }

  private key(...codes: string[]): number {
    return codes.some((c) => this.held.has(c)) ? 1 : 0;
  }

  flight(): FlightInput {
    if (!this.enabled) return { forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false };
    const pad = this.pad;
    const t = this.touch;
    return {
      forward: clampSum(this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown'), pad.forward, t.forward),
      strafe: clampSum(this.key('KeyE') - this.key('KeyQ'), pad.strafe, t.strafe),
      lift: clampSum(this.key('Space') - this.key('ShiftLeft', 'ShiftRight'), pad.lift, t.lift),
      yaw: clampSum(this.key('KeyD', 'ArrowRight') - this.key('KeyA', 'ArrowLeft'), pad.yaw, t.turn),
      boost: this.key('KeyR') === 1 || pad.boost || t.boost,
    };
  }

  poll(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const p = Array.from(pads).find((g) => g && g.connected);
    if (!p) {
      this.pad = NO_PAD;
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const now = new Set<number>();
    p.buttons.forEach((b, i) => b.pressed && now.add(i));
    for (const [i, action] of GAMEPAD_ACTIONS) if (now.has(i) && !this.padPrev.has(i)) this.pressed.add(action);
    this.padPrev = now;
    this.pad = {
      forward: -dz(p.axes[1] ?? 0),
      strafe: dz(p.axes[0] ?? 0),
      yaw: dz(p.axes[2] ?? 0),
      lift: (p.buttons[7]?.value ?? 0) - (p.buttons[6]?.value ?? 0),
      boost: !!p.buttons[1]?.pressed || !!p.buttons[10]?.pressed,
    };
  }
}

function clampSum(...v: number[]): number {
  return Math.max(-1, Math.min(1, v.reduce((a, b) => a + b, 0)));
}

function forPage(e: KeyboardEvent): boolean {
  const el = e.target as Element;
  if (e.code === 'Enter') return !!el.matches?.('button, a[href], select, [role]');
  return (e.code === 'Space' || e.code.startsWith('Arrow')) && !!el.closest?.('[aria-modal="true"]');
}

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
