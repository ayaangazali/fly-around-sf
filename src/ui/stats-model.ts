import type { Game } from '../game';

export interface Breakdown {
  key: string;
  label: string;
  icon: string;
  done: number;
  total: number;
}

export function pilotLevel(xp: number): { level: number; into: number; span: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const lo = 50 * (level - 1) ** 2;
  const hi = 50 * level ** 2;
  return { level, into: xp - lo, span: hi - lo };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function breakdowns(game: Game): { byHood: Breakdown[]; byKind: Breakdown[] } {
  const hoods = new Map<string, Breakdown>();
  const kinds = new Map<string, Breakdown>();
  for (const d of game.activities.list()) {
    if (d.kind === 'achievement' || (d.hidden && !game.save.isDone(d.id))) continue;
    const kind = game.activities.kindOf(d);
    const done = game.save.isDone(d.id) ? 1 : 0;
    const h = hoods.get(d.neighborhood) ?? { key: d.neighborhood, label: d.neighborhood, icon: '📍', done: 0, total: 0 };
    h.done += done;
    h.total++;
    hoods.set(d.neighborhood, h);
    const k = kinds.get(d.kind) ?? { key: d.kind, label: kind.label, icon: kind.icon, done: 0, total: 0 };
    k.done += done;
    k.total++;
    kinds.set(d.kind, k);
  }
  const sort = (a: Breakdown, b: Breakdown) => b.done / b.total - a.done / a.total || b.total - a.total || a.label.localeCompare(b.label);
  return { byHood: [...hoods.values()].sort(sort), byKind: [...kinds.values()].sort(sort) };
}
