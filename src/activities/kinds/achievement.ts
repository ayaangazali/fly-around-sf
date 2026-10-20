import type { ActivityDef, ActivityKind, SolverStep } from '../types';
import type { Game } from '../../game';
import type { GameEvents } from '../../core/bus';
import { sunPosition } from '../../core/sun';
import { ORIGIN } from '../../core/geo';
import { forwardVector } from '../../player/flight';

const STATS = ['distance', 'flightTime', 'crashes', 'sessions'] as const;
const COUNTERS = ['xp', 'cards', 'completed', 'neighborhoods', 'bests'] as const;
const MOMENTS = ['altitude', 'speed', 'skim', 'night', 'golden'] as const;
const EVENTS = ['splash', 'panel'] as const;
export const METRICS = [...STATS, ...COUNTERS, ...MOMENTS, ...EVENTS] as const;
export type Metric = (typeof METRICS)[number];

export interface AchievementParams {
  metric: Metric;
  gte: number;
  kind?: string;
  panel?: string;
}

export const WATER = { lat: 37.815, lon: -122.43 };
const DEG = Math.PI / 180;

const params = (def: ActivityDef) => def.params as unknown as AchievementParams;
const isAchievement = (id: string) => id.startsWith('achievement-');

export function sunAltitude(game: Game, offsetMs = 0): number {
  return sunPosition(new Date(game.date().getTime() + offsetMs), ORIGIN.lat, ORIGIN.lon).altitude;
}

export function metricValue(p: AchievementParams, game: Game): number {
  const save = game.save.data;
  const f = game.flight;
  const done = Object.keys(save.completed).filter((id) => !isAchievement(id));
  switch (p.metric) {
    case 'distance':
    case 'flightTime':
    case 'crashes':
    case 'sessions':
      return save.stats[p.metric];
    case 'xp':
      return save.xp;
    case 'cards':
      return save.cards.length;
    case 'completed':
      return p.kind ? done.filter((id) => id.startsWith(`${p.kind}-`)).length : done.length;
    case 'neighborhoods':
      return new Set(done.map((id) => game.activities.defs.get(id)?.neighborhood).filter(Boolean)).size;
    case 'bests':
      return Object.keys(save.best).length;
    case 'altitude':
      return f.pos.y;
    case 'speed':
      return Math.hypot(f.vel.x, f.vel.z);
    case 'skim':
      return game.world.isWater(f.pos.x, f.pos.z) && f.pos.y < 5 ? Math.hypot(f.vel.x, f.vel.z) : 0;
    case 'night':
      return sunAltitude(game) < -6 * DEG ? 1 : 0;
    case 'golden': {
      const a = sunAltitude(game);
      return a > 0 && a < 6 * DEG ? 1 : 0;
    }
    case 'splash':
    case 'panel':
      return 0;
  }
}

export function achievementProgress(def: ActivityDef, game: Game): number {
  if (game.save.isDone(def.id)) return 1;
  const p = params(def);
  return (EVENTS as readonly string[]).includes(p.metric) ? 0 : Math.max(0, Math.min(1, metricValue(p, game) / p.gte));
}

function findOffset(game: Game, test: (alt: number) => boolean): number {
  for (let h = 0; h < 48; h++) if (test(sunAltitude(game, h * 1_800_000))) return h * 1_800_000;
  return 0;
}

function momentarily(mutate: (g: Game) => () => void): SolverStep {
  return {
    call: (g) => {
      const restore = mutate(g);
      g.activities.update(0);
      restore();
    },
  };
}

function clockShift(test: (alt: number) => boolean): SolverStep {
  return momentarily((g) => {
    const off = findOffset(g, test);
    g.clockOffset += off;
    return () => (g.clockOffset -= off);
  });
}

export const kind: ActivityKind = {
  kind: 'achievement',
  label: 'Achievement',
  icon: '🏆',
  passive: true,
  validate(def) {
    const p = def.params as Partial<AchievementParams> | undefined;
    const errors: string[] = [];
    if (!p || !METRICS.includes(p.metric as Metric)) errors.push(`params.metric must be one of ${METRICS.join(', ')}`);
    if (!(typeof p?.gte === 'number' && p.gte > 0)) errors.push('params.gte must be > 0');
    if (p?.metric === 'panel' && !p.panel) errors.push('params.panel is required for the panel metric');
    if (!def.id.startsWith('achievement-')) errors.push('id must start with achievement-');
    return errors;
  },
  start(def, game) {
    const p = params(def);
    let count = 0;
    const listen = <K extends keyof GameEvents>(type: K, match: (e: GameEvents[K]) => boolean) => game.bus.on(type, (e) => match(e) && count++);
    const off = p.metric === 'splash' ? listen('player:splash', () => true) : p.metric === 'panel' ? listen('panel:open', (e) => e.id === p.panel) : null;
    const value = () => (off ? count : metricValue(p, game));
    return {
      update() {
        if (value() < p.gte) return 'running';
        off?.();
        return 'done';
      },
      progress: () => Math.min(1, value() / p.gte),
      hud: () => def.title,
    };
  },
  solve(def) {
    const p = params(def);
    const water = (alt: number) => (g: Game) => g.world.point({ ...WATER, alt });
    switch (p.metric) {
      case 'distance':
      case 'flightTime':
      case 'crashes':
      case 'sessions':
        return [{ call: (g) => (g.save.data.stats[p.metric as (typeof STATS)[number]] = Math.max(g.save.data.stats[p.metric as (typeof STATS)[number]], p.gte)) }];
      case 'xp':
        return [{ call: (g) => (g.save.data.xp = Math.max(g.save.data.xp, p.gte)) }];
      case 'cards':
        return [{ call: (g) => Array.from({ length: p.gte }, (_, i) => g.save.addCard(`solver-card-${i}`)) }];
      case 'completed':
        return [{ call: (g) => Array.from({ length: p.gte }, (_, i) => g.save.complete(`${p.kind ?? 'solver'}-solver-${i}`)) }];
      case 'bests':
        return [{ call: (g) => Array.from({ length: p.gte }, (_, i) => g.save.recordBest(`solver-${i}`, 60)) }];
      case 'neighborhoods':
        return [
          {
            call: (g) => {
              const seen = new Set<string>();
              for (const d of g.activities.list()) {
                if (seen.size >= p.gte || isAchievement(d.id) || seen.has(d.neighborhood)) continue;
                seen.add(d.neighborhood);
                g.save.complete(d.id);
              }
            },
          },
        ];
      case 'altitude':
        return [{ call: (g) => g.teleport({ ...g.flight.pos, y: Math.max(g.flight.pos.y, p.gte + 2) }) }, { wait: 0.1 }];
      case 'speed':
      case 'skim':
        return [
          ...(p.metric === 'skim' ? [{ call: (g: Game) => g.teleport(water(2)(g), 0) }] : []),
          momentarily((g) => {
            const f = forwardVector(g.flight.yaw);
            g.flight.vel = { x: f.x * (p.gte + 1), y: 0, z: f.z * (p.gte + 1) };
            return () => (g.flight.vel = { x: 0, y: 0, z: 0 });
          }),
        ];
      case 'night':
        return [clockShift((a) => a < -8 * DEG)];
      case 'golden':
        return [clockShift((a) => a > 1 * DEG && a < 5 * DEG)];
      case 'splash':
        return [{ call: (g) => g.teleport(water(15)(g), 0) }, { fly: { lift: -1 }, seconds: 2.5 }];
      case 'panel':
        return [
          {
            call: (g) => {
              g.panels.open(p.panel as string);
              g.panels.close();
            },
          },
        ];
    }
  },
};
