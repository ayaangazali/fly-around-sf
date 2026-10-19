import type { GameSystem } from '../game';
import { addFeed, due, getFeed, liveState, refresh } from '../live/state';
import { harmonicEvents, tideSpec } from '../live/tides';

const DAY = 86400_000;

export const system: GameSystem = {
  id: 'live-tides',
  order: 22,
  init(game) {
    void refresh(game, addFeed(game, tideSpec));
  },
  update(dt, game) {
    const feed = getFeed(game, tideSpec);
    if (!feed) return;
    if (due(game, 'tides', 1800, dt)) void refresh(game, feed);
    const s = liveState(game);
    const now = game.date().getTime();
    const covered = (list: { t: number }[]) => list.length > 1 && list[0].t < now && list[list.length - 1].t > now + DAY / 2;
    if (feed.data && covered(feed.data)) s.tides = feed.data;
    else if (!covered(s.tides) || s.tides === feed.data) s.tides = harmonicEvents(now - DAY / 2, now + 2 * DAY);
  },
};
