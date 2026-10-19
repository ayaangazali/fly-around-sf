import type { Game } from '../game';
import { Feed, liveStorage, type FeedStatus, type FeedSpec } from './feed';
import type { WeatherSample } from './weather';
import type { Quake } from './quakes';
import type { Plane } from './planes';
import type { TideEvent } from './tides';
import type { Mode, TransitData } from './transit';

export interface TransitVehicle {
  route: string;
  name: string;
  mode: Mode;
  x: number;
  y: number;
  z: number;
  heading: number;
  moving: boolean;
}

declare module '../core/bus' {
  interface GameEvents {
    'live:status': { id: string; status: FeedStatus };
    'live:quake': { id: string; mag: number; place: string; km: number };
    'live:close-call': { id: string; label: string; distance: number };
  }
}

export interface LiveState {
  online: boolean;
  feeds: Map<string, Feed<unknown>>;
  weather: WeatherSample | null;
  fog: number;
  wind: { x: number; z: number };
  quakes: Quake[];
  planes: Plane[];
  tides: TideEvent[];
  transit: { status: FeedStatus; data: TransitData | null; vehicles: TransitVehicle[] };
  timers: Map<string, number>;
}

const states = new WeakMap<Game, LiveState>();

export function liveState(game: Game): LiveState {
  let s = states.get(game);
  if (!s) {
    const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
    const online = !game.opts.test || q.has('live');
    s = { online, feeds: new Map(), weather: null, fog: 1, wind: { x: 0, z: 0 }, quakes: [], planes: [], tides: [], transit: { status: 'loading', data: null, vehicles: [] }, timers: new Map() };
    states.set(game, s);
  }
  return s;
}

export function addFeed<T>(game: Game, spec: FeedSpec<T>): Feed<T> {
  const s = liveState(game);
  const feed = new Feed(spec, liveStorage(), s.online);
  s.feeds.set(spec.id, feed as Feed<unknown>);
  return feed;
}

export function getFeed<T>(game: Game, spec: FeedSpec<T>): Feed<T> | undefined {
  return liveState(game).feeds.get(spec.id) as Feed<T> | undefined;
}

export async function refresh<T>(game: Game, feed: Feed<T>, now = Date.now()): Promise<T | null> {
  const before = feed.status;
  const status = await feed.refresh(now);
  if (status !== before) game.bus.emit('live:status', { id: feed.spec.id, status });
  return feed.data;
}

export function due(game: Game, id: string, every: number, dt: number): boolean {
  const timers = liveState(game).timers;
  const t = (timers.get(id) ?? 0) + dt;
  timers.set(id, t >= every ? 0 : t);
  return t >= every;
}

export function grantCard(game: Game, id: string, name: string): void {
  if (!game.save.addCard(id)) return;
  game.bus.emit('card:unlock', { id });
  game.toast(`New card: ${name}`, 'reward');
}
