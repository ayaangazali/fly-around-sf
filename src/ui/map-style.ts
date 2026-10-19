import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';

const PALETTE = ['#ff6a3d', '#ffc15e', '#7de0a6', '#5fb4ff', '#b48cff', '#ff7eb6', '#4fd8d0', '#f4f1a6', '#ff9b6b', '#9fd0ff', '#c6f07a', '#ffb3d1'];

export function kindColor(kind: string): string {
  let h = 0;
  for (const c of kind) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function mappable(game: Game, d: ActivityDef): boolean {
  return d.kind !== 'achievement' && (!d.hidden || game.save.isDone(d.id));
}
