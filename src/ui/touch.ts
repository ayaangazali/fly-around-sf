import type { Game } from '../game';
import type { TouchAxes } from '../core/input';
import { el } from './panel-host';

export function stickAxes(dx: number, dy: number, radius: number, dead = 0.12): { x: number; y: number } {
  const len = Math.hypot(dx, dy) / radius;
  if (len <= dead) return { x: 0, y: 0 };
  const mag = Math.min(1, (len - dead) / (1 - dead));
  const k = mag / len / radius;
  return { x: dx * k, y: dy * k };
}

export function isTouchDevice(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

export function installTouch(game: Game): { update(): void } {
  if (!isTouchDevice()) return { update() {} };
  document.documentElement.classList.add('touch');
  const root = el('div', 'touch-ui');
  const axes: TouchAxes = { forward: 0, turn: 0, lift: 0, strafe: 0, boost: false };
  const held = { up: 0, down: 0, lift: 0 };
  const sync = () => {
    axes.lift = Math.max(-1, Math.min(1, held.lift + held.up - held.down));
    game.input.touch = { ...axes };
  };

  const stick = (side: 'left' | 'right', label: string, apply: (x: number, y: number) => void) => {
    const base = el('div', `stick stick-${side}`);
    base.setAttribute('role', 'application');
    base.setAttribute('aria-label', label);
    const knob = el('div', 'stick-knob');
    base.append(knob, el('span', 'stick-label', side === 'left' ? 'MOVE' : 'LIFT'));
    let id: number | null = null;
    let cx = 0;
    let cy = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const r = base.clientWidth / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx *= r / len;
        dy *= r / len;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const a = stickAxes(dx, dy, r);
      apply(a.x, a.y);
      sync();
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      base.classList.remove('active');
      knob.style.transform = '';
      apply(0, 0);
      sync();
    };
    base.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      base.setPointerCapture(e.pointerId);
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      base.classList.add('active');
      move(e);
    });
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    root.append(base);
  };
  stick('left', 'Move stick: up flies forward, sideways turns', (x, y) => {
    axes.forward = -y;
    axes.turn = x;
  });
  stick('right', 'Lift stick: up climbs, sideways slides', (x, y) => {
    held.lift = -y;
    axes.strafe = x;
  });

  const buttons = el('div', 'touch-buttons');
  const hold = (cls: string, text: string, label: string, set: (on: boolean) => void) => {
    const b = el('button', `tbtn ${cls}`, text);
    b.setAttribute('aria-label', label);
    const on = (e: PointerEvent) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      set(true);
      sync();
    };
    const off = () => {
      b.classList.remove('on');
      set(false);
      sync();
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    buttons.append(b);
    return b;
  };
  hold('tbtn-up', '▲', 'Climb', (on) => (held.up = on ? 1 : 0));
  hold('tbtn-down', '▼', 'Descend', (on) => (held.down = on ? 1 : 0));
  hold('tbtn-boost', 'BOOST', 'Boost, keep holding for supersonic', (on) => (axes.boost = on));
  const act = el('button', 'tbtn tbtn-act', 'F');
  act.setAttribute('aria-label', 'Interact');
  act.addEventListener('click', () => game.interact());
  buttons.append(act);
  root.append(buttons);
  game.ui.append(root);
  game.bus.on('panel:open', () => root.classList.add('away'));
  game.bus.on('panel:close', () => root.classList.remove('away'));
  return { update: () => void act.classList.toggle('ready', !!game.activities.nearby && !game.activities.active) };
}
