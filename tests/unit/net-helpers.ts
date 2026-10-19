import { fakeGame, loadDefs, loadKinds } from './helpers';
import type { Game } from '../../src/game';
import type { Vec3 } from '../../src/player/flight';

export async function netGame(): Promise<Game & { toasts: string[] }> {
  const game = fakeGame() as Game & { toasts: string[] };
  const toasts: string[] = [];
  Object.assign(game, {
    toasts,
    toast: (text: string) => toasts.push(text),
    teleport(p: Vec3, yaw?: number) {
      game.flight.pos = { ...p };
      game.flight.vel = { x: 0, y: 0, z: 0 };
      if (yaw !== undefined) game.flight.yaw = yaw;
    },
    sky: { fogDensity: 1 },
    panels: { close() {}, openId: null },
  });
  game.activities.register(await loadKinds(), loadDefs());
  return game;
}

export async function until(fn: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}
