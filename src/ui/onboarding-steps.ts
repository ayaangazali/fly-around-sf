import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';

export interface OnboardStep {
  id: string;
  title: string;
  keys: string;
  touch: string;
}

export const STEPS: OnboardStep[] = [
  { id: 'forward', title: 'Fly forward', keys: 'Hold <kbd>W</kbd> or <kbd>↑</kbd>', touch: 'Push the left stick up' },
  { id: 'turn', title: 'Turn around', keys: '<kbd>A</kbd> and <kbd>D</kbd> turn the drone', touch: 'Push the left stick sideways' },
  { id: 'climb', title: 'Climb, then drop', keys: '<kbd>Space</kbd> climbs, <kbd>Shift</kbd> descends', touch: 'Right stick up and down, or ▲ ▼' },
  { id: 'boost', title: 'Boost', keys: 'Hold <kbd>R</kbd> while flying forward', touch: 'Hold BOOST while moving' },
  { id: 'journal', title: 'Open your journal', keys: 'Press <kbd>J</kbd> to see everything to do', touch: 'Tap 📋 in the top bar' },
  { id: 'activity', title: 'Start your first activity', keys: 'Follow the orange marker, then press <kbd>F</kbd>', touch: 'Follow the orange marker, then tap F' },
];

export const FLAG = 'onboarded';

export function firstActivity(game: Game): ActivityDef | null {
  const p = game.flight.pos;
  let best: ActivityDef | null = null;
  let bestD = Infinity;
  for (const d of game.activities.list()) {
    if (game.activities.kindOf(d).passive || d.hidden || game.save.isDone(d.id) || game.activities.locked(d)) continue;
    const q = game.activities.position(d);
    const dist = Math.hypot(q.x - p.x, q.z - p.z);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

export class OnboardingTracker {
  step = 0;
  private ref = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private turned = 0;
  private peak = -Infinity;
  private flags = new Set<string>();
  private offs: (() => void)[] = [];

  constructor(private game: Game) {
    this.mark();
    this.offs.push(
      game.bus.on('panel:open', ({ id }) => id === 'journal' && this.flags.add('journal')),
      game.bus.on('activity:start', () => this.flags.add('activity')),
    );
  }

  get done(): boolean {
    return this.step >= STEPS.length;
  }

  private mark(): void {
    const f = this.game.flight;
    this.ref = { ...f.pos };
    this.yaw = f.yaw;
    this.turned = 0;
    this.peak = f.pos.y;
    this.flags.delete('journal');
    this.flags.delete('activity');
  }

  private met(): boolean {
    const f = this.game.flight;
    switch (STEPS[this.step].id) {
      case 'forward':
        return Math.hypot(f.pos.x - this.ref.x, f.pos.z - this.ref.z) > 25;
      case 'turn':
        this.turned += Math.abs(f.yaw - this.yaw);
        this.yaw = f.yaw;
        return this.turned > 1.2;
      case 'climb':
        this.peak = Math.max(this.peak, f.pos.y);
        return this.peak - this.ref.y > 8 && this.peak - f.pos.y > 4;
      case 'boost':
        return Math.hypot(f.vel.x, f.vel.z) > 40;
      case 'journal':
        return this.flags.has('journal');
      default:
        return this.flags.has('activity');
    }
  }

  update(): boolean {
    if (this.done || !this.met()) return false;
    this.step++;
    if (this.done) this.dispose();
    else this.mark();
    return true;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
