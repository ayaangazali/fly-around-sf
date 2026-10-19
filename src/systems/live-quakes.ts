import type { Game, GameSystem } from '../game';
import { addFeed, due, getFeed, grantCard, liveState, refresh } from '../live/state';
import { newQuakes, quakeSpec, shakeFor } from '../live/quakes';

const seen = new WeakMap<Game, { ids: Set<string>; primed: boolean }>();

async function poll(game: Game, now = Date.now()): Promise<void> {
  const feed = getFeed(game, quakeSpec);
  const memo = seen.get(game);
  if (!feed || !memo) return;
  const list = await refresh(game, feed, now);
  const s = liveState(game);
  s.quakes = list ?? [];
  if (!list) return;
  const fresh = newQuakes(memo.ids, list, now - 3600_000);
  const report = memo.primed && s.online;
  memo.primed = true;
  if (!report) return;
  for (const q of fresh) {
    game.chase.shake = Math.max(game.chase.shake, shakeFor(q));
    game.toast(`Earthquake! M${q.mag.toFixed(1)}, ${q.place} (${Math.round(q.km)} km away)`, 'warn');
    game.bus.emit('live:quake', { id: q.id, mag: q.mag, place: q.place, km: q.km });
    grantCard(game, 'felt-a-quake', 'Felt a Quake');
  }
}

export const system: GameSystem & { poll: typeof poll } = {
  id: 'live-quakes',
  order: 21,
  poll,
  init(game) {
    addFeed(game, quakeSpec);
    seen.set(game, { ids: new Set(), primed: false });
    void poll(game);
  },
  update(dt, game) {
    if (due(game, 'quakes', 120, dt)) void poll(game);
  },
};
