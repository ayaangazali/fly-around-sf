import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';
import { FLIGHT } from '../player/flight';

export interface OnboardStep {
  id: string;
  title: string;
  keys: string;
  touch: string;
}

export const STEPS: OnboardStep[] = [
  { id: 'forward', title: 'Fly forward', keys: 'Hold <kbd>W</kbd> or <kbd>↑</kbd>', touch: 'Push the left stick up' },
  { id: 'turn', title: 'Turn', keys: '<kbd>A</kbd> and <kbd>D</kbd> turn the drone', touch: 'Push the left stick left or right' },
  { id: 'climb', title: 'Climb and descend', keys: 'Hold <kbd>Space</kbd> to climb and <kbd>Shift</kbd> to descend, in any order', touch: 'Hold ▲ to climb and ▼ to descend, in any order' },
  { id: 'boost', title: 'Boost to supersonic', keys: 'Hold <kbd>W</kbd> and <kbd>R</kbd>. Keep holding to break the sound barrier', touch: 'Push the left stick up and hold BOOST. Keep holding to break the sound barrier' },
  { id: 'objective', title: 'Follow the objective', keys: 'Fly toward the orange marker', touch: 'Fly toward the orange marker' },
];

export const FLAG = 'onboarded';

const CLIMB = 6;
const DROP = 4;
const CLOSER = 100;
const ARRIVED = 60;

export function trailTarget(game: Game): ActivityDef | null {
  const order = (d: ActivityDef) => Number(d.params?.order);
  return (
    game.activities
      .list()
      .filter((d) => d.kind === 'trail' && !game.save.isDone(d.id))
      .sort((a, b) => order(a) - order(b))[0] ?? null
  );
}

export class OnboardingTracker {
  step = 0;
  up = 0;
  down = 0;
  private ref = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private turned = 0;
  private lastY = 0;
  private start = Infinity;

  constructor(private game: Game) {
    this.mark();
  }

  get done(): boolean {
    return this.step >= STEPS.length;
  }

  get id(): string {
    return STEPS[this.step]?.id ?? 'done';
  }

  private distance(): number {
    const t = trailTarget(this.game);
    if (!t) return 0;
    const p = this.game.activities.position(t);
    const f = this.game.flight.pos;
    return Math.hypot(p.x - f.x, p.z - f.z);
  }

  private mark(): void {
    const f = this.game.flight;
    this.ref = { ...f.pos };
    this.yaw = f.yaw;
    this.turned = 0;
    this.lastY = f.pos.y;
    this.up = 0;
    this.down = 0;
    this.start = this.id === 'objective' ? this.distance() : Infinity;
  }

  private met(): boolean {
    const f = this.game.flight;
    switch (this.id) {
      case 'forward':
        return Math.hypot(f.pos.x - this.ref.x, f.pos.z - this.ref.z) > 25;
      case 'turn':
        this.turned += Math.abs(f.yaw - this.yaw);
        this.yaw = f.yaw;
        return this.turned > 1.2;
      case 'climb': {
        const dy = f.pos.y - this.lastY;
        this.lastY = f.pos.y;
        if (dy > 0) this.up += dy;
        else this.down -= dy;
        return this.up >= CLIMB && this.down >= DROP;
      }
      case 'boost':
        return Math.hypot(f.vel.x, f.vel.z) > FLIGHT.boost * 0.8;
      default: {
        const d = this.distance();
        return d < ARRIVED || this.start - d > CLOSER;
      }
    }
  }

  get climbed(): boolean {
    return this.up >= CLIMB;
  }

  get descended(): boolean {
    return this.down >= DROP;
  }

  update(): boolean {
    if (this.done || !this.met()) return false;
    this.step++;
    if (!this.done) this.mark();
    return true;
  }
}
