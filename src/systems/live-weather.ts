import type { GameSystem } from '../game';
import { addFeed, due, getFeed, grantCard, liveState, refresh } from '../live/state';
import { climate, fogDensity, sampleAt, weatherSpec, windVector } from '../live/weather';

export const system: GameSystem & { state: typeof liveState } = {
  id: 'live-weather',
  state: liveState,
  order: 20,
  init(game) {
    const feed = addFeed(game, weatherSpec);
    void refresh(game, feed);
  },
  update(dt, game) {
    const s = liveState(game);
    const feed = getFeed(game, weatherSpec);
    if (!feed) return;
    if (due(game, 'weather', 300, dt)) void refresh(game, feed);
    const now = game.date();
    const sample = (feed.data && sampleAt(feed.data, now.getTime())) ?? climate(now);
    const target = fogDensity(sample);
    s.fog = s.weather ? s.fog + (target - s.fog) * Math.min(1, dt * 0.5) : target;
    s.weather = sample;
    const f = game.flight.pos;
    const agl = game.world ? f.y - game.world.groundAt(f.x, f.z) : 30;
    s.wind = windVector(sample, agl, game.simTime);
    if (!s.online) return;
    game.env.wind = s.wind;
    game.sky.weatherFog = s.fog;
    if (s.fog > 2.4 && game.flight.speed > 3) grantCard(game, 'karl-the-fog', 'Karl the Fog');
  },
};
