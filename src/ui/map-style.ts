import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';

const PALETTE = ['#ff6a3d', '#ffc15e', '#7de0a6', '#5fb4ff', '#b48cff', '#ff7eb6', '#4fd8d0', '#f4f1a6', '#ff9b6b', '#9fd0ff', '#c6f07a', '#ffb3d1'];
export const TRAIL_COLOR = '#ffd166';

export function kindColor(kind: string): string {
  if (kind === 'trail') return TRAIL_COLOR;
  let h = 0;
  for (const c of kind) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function sideActivitiesOn(game: Game): boolean {
  return game.save.data.settings.sideActivities === true;
}

export function trailOrder(d: ActivityDef): number {
  return Number(d.params?.order) || 0;
}

export function trailStops(game: Game): ActivityDef[] {
  return game.activities
    .list()
    .filter((d) => d.kind === 'trail')
    .sort((a, b) => trailOrder(a) - trailOrder(b));
}

export function currentObjective(game: Game): ActivityDef | null {
  return trailStops(game).find((d) => !game.save.isDone(d.id)) ?? null;
}

export function mappable(game: Game, d: ActivityDef): boolean {
  if (d.kind === 'trail') return true;
  return sideActivitiesOn(game) && d.kind !== 'achievement' && (!d.hidden || game.save.isDone(d.id));
}
