import type { Game } from './game';
import type { SolverStep } from './activities/types';
import type { Vec3 } from './player/flight';
import { encodeSave, decodeSave } from './core/save';

export interface TestApi {
  game: Game;
  ready: boolean;
  errors: string[];
  step(seconds: number, dt?: number): void;
  teleport(p: Vec3, yaw?: number): void;
  activities(): { id: string; kind: string; title: string; passive: boolean; hidden: boolean; requires: string[] }[];
  kinds(): string[];
  solve(id: string): Promise<{ ok: boolean; error?: string }>;
  state(): { pos: Vec3; yaw: number; completed: string[]; cards: string[]; xp: number; active: string | null; panel: string | null };
  exportSave(): string;
  importSave(code: string): void;
  reset(): void;
}

export function installTestApi(game: Game, errors: string[]): TestApi {
  const api: TestApi = {
    game,
    ready: false,
    errors,
    step(seconds, dt = 1 / 30) {
      for (let t = 0; t < seconds - 1e-9; t += dt) game.step(dt);
    },
    teleport(p, yaw) {
      game.teleport(p, yaw);
    },
    activities() {
      return game.activities.list().map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        passive: !!game.activities.kinds.get(d.kind)?.passive,
        hidden: !!d.hidden,
        requires: d.requires ?? [],
      }));
    },
    kinds() {
      return [...game.activities.kinds.keys()];
    },
    async solve(id) {
      const def = game.activities.defs.get(id);
      if (!def) return { ok: false, error: 'unknown id' };
      const kind = game.activities.kindOf(def);
      for (const r of def.requires ?? []) {
        if (!game.save.isDone(r)) {
          const sub = await api.solve(r);
          if (!sub.ok) return { ok: false, error: `prerequisite ${r}: ${sub.error}` };
        }
      }
      if (!kind.passive) {
        game.teleport(game.activities.position(def));
        game.step(1 / 30);
        if (!game.activities.start(id)) return { ok: false, error: 'could not start' };
      }
      const steps: SolverStep[] = kind.solve(def, game);
      for (const s of steps) {
        if ('teleport' in s) game.teleport(s.teleport, s.yaw);
        else if ('wait' in s) api.step(s.wait);
        else if ('action' in s) {
          game.input.press(s.action);
          if (s.action === 'interact') game.interact();
          game.step(1 / 30);
        } else if ('fly' in s) {
          const saved = game.input.flight.bind(game.input);
          game.input.flight = () => ({ forward: 0, strafe: 0, lift: 0, yaw: 0, boost: false, ...s.fly });
          api.step(s.seconds);
          game.input.flight = saved;
        } else if ('call' in s) s.call(game);
        game.step(1 / 30);
        if (game.save.isDone(id)) break;
      }
      for (let i = 0; i < 10 && !game.save.isDone(id); i++) game.step(1 / 30);
      const ok = game.save.isDone(id);
      if (!ok) game.activities.stop();
      return ok ? { ok } : { ok, error: 'not completed after solver' };
    },
    state() {
      return {
        pos: { ...game.flight.pos },
        yaw: game.flight.yaw,
        completed: Object.keys(game.save.data.completed),
        cards: [...game.save.data.cards],
        xp: game.save.data.xp,
        active: game.activities.active?.def.id ?? null,
        panel: game.panels.openId,
      };
    },
    exportSave: () => encodeSave(game.save.data),
    importSave: (code) => game.save.replace(decodeSave(code)),
    reset() {
      game.activities.stop();
      game.save.replace({ v: 1, completed: {}, best: {}, cards: [], xp: 0, flags: {}, settings: {}, stats: { distance: 0, flightTime: 0, crashes: 0, sessions: 0 } });
    },
  };
  (window as unknown as { __fly: TestApi }).__fly = api;
  return api;
}
