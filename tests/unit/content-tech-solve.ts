import type { Game } from '../../src/game';
import type { ActivityDef, SolverStep } from '../../src/activities/types';

export function tick(game: Game, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) game.activities.update(dt);
}

export function replay(game: Game, def: ActivityDef): boolean {
  for (const r of def.requires ?? []) game.save.complete(r);
  game.flight.pos = { ...game.activities.position(def) };
  game.activities.update(1 / 30);
  if (!game.activities.start(def.id)) return false;
  const steps: SolverStep[] = game.activities.kindOf(def).solve(def, game);
  for (const s of steps) {
    if ('teleport' in s) {
      game.flight.pos = { ...s.teleport };
      game.flight.vel = { x: 0, y: 0, z: 0 };
    } else if ('wait' in s) tick(game, s.wait);
    else if ('call' in s) s.call(game);
    game.activities.update(1 / 30);
    if (game.save.isDone(def.id)) break;
  }
  return game.save.isDone(def.id);
}
