import type { ActivityDef, ActivityInstance, ActivityKind } from '../types';
import type { Vec3 } from '../../player/flight';
import type { Game } from '../../game';
import { lift } from '../minigame';

declare module '../../core/bus' {
  interface GameEvents {
    'hack:commit': { id: string; hash: string; n: number; total: number };
  }
}

export interface HackParams {
  venue: string;
  timeLimit: number;
  commits?: number;
  spread?: number;
}

export interface Commit {
  p: Vec3;
  hash: string;
  taken: boolean;
}

export interface HackInstance extends ActivityInstance {
  readonly params: HackParams;
  readonly commits: Commit[];
  timeLeft(): number;
}

export const HACK = { commits: 6, spread: 55, reach: 6, minLift: 6, maxLift: 24 };

function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function placeCommits(def: ActivityDef, game: Game): Commit[] {
  const p = def.params as unknown as HackParams;
  const n = p.commits ?? HACK.commits;
  const spread = p.spread ?? HACK.spread;
  const rand = rng(def.id);
  const c = game.world.toLocal(def.at.lat, def.at.lon);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rand() * 0.7;
    const r = spread * (0.4 + 0.6 * rand());
    const x = c.x + Math.cos(a) * r;
    const z = c.z + Math.sin(a) * r;
    const alt = HACK.minLift + rand() * (HACK.maxLift - HACK.minLift);
    const hash = Math.floor(rand() * 0xfffffff).toString(16).padStart(7, '0');
    return { p: lift(game, x, game.world.groundAt(x, z) + alt, z, alt), hash, taken: false };
  });
}

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

export const kind: ActivityKind = {
  kind: 'hack',
  label: 'Hackathon',
  icon: '⌨️',
  validate(def) {
    const p = def.params as Partial<HackParams> | undefined;
    const errors: string[] = [];
    if (!p || typeof p.venue !== 'string' || p.venue.trim().length < 3) errors.push('params.venue is required');
    if (!(typeof p?.timeLimit === 'number' && p.timeLimit >= 20 && p.timeLimit <= 300)) errors.push('params.timeLimit must be 20..300 seconds');
    if (p?.commits !== undefined && !int(p.commits, 3, 12)) errors.push('params.commits must be 3..12');
    if (p?.spread !== undefined && !(typeof p.spread === 'number' && p.spread >= 15 && p.spread <= 150)) errors.push('params.spread must be 15..150 m');
    return errors;
  },
  start(def, game) {
    const params = def.params as unknown as HackParams;
    const commits = placeCommits(def, game);
    let got = 0;
    let t = 0;
    const inst: HackInstance = {
      params,
      commits,
      update(dt) {
        t += dt;
        const pos = game.flight.pos;
        for (const c of commits) {
          if (c.taken || Math.hypot(pos.x - c.p.x, pos.y - c.p.y, pos.z - c.p.z) > HACK.reach) continue;
          c.taken = true;
          got++;
          game.bus.emit('hack:commit', { id: def.id, hash: c.hash, n: got, total: commits.length });
          game.bus.emit('toast', { text: `Pushed ${c.hash}  ${got}/${commits.length}`, kind: 'info' });
        }
        if (got === commits.length) return 'done';
        return t > params.timeLimit ? 'failed' : 'running';
      },
      progress: () => got / commits.length,
      hud: () => `${params.venue}  commits ${got}/${commits.length}  ${Math.max(0, params.timeLimit - t).toFixed(0)}s`,
      targets: () => commits.filter((c) => !c.taken).map((c) => c.p),
      elapsed: () => t,
      timeLeft: () => Math.max(0, params.timeLimit - t),
    };
    return inst;
  },
  solve(def, game) {
    return placeCommits(def, game).flatMap((c) => [{ teleport: c.p }, { wait: 0.05 }]);
  },
};
