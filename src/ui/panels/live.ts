import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { Game } from '../../game';
import { toLocal } from '../../core/geo';
import { liveState, type LiveState } from '../../live/state';
import type { FeedStatus } from '../../live/feed';
import { describe, fogLabel } from '../../live/weather';
import { tideNow, harmonicHeight, heightBetween } from '../../live/tides';
import { nearestStop, nextPass, vehiclesAt, type Mode, type Route } from '../../live/transit';
import { ago, compass, sfClock, sfTime } from '../../live/sf-time';
import '../../live/live.css';

const FEEDS: [string, string][] = [
  ['weather', 'Weather'],
  ['quakes', 'Earthquakes'],
  ['planes', 'Planes'],
  ['tides', 'Tides'],
  ['transit', 'Transit'],
];

const STATUS_TEXT: Record<FeedStatus, string> = {
  off: 'Off',
  loading: 'Connecting',
  live: 'Live',
  cached: 'Cached',
  fallback: 'Offline model',
  schedule: 'Timetable',
};

const MODE_LABEL: Record<Mode, [string, string]> = {
  cable: ['🚋', 'cable cars'],
  streetcar: ['🚃', 'streetcars'],
  bus: ['🚌', 'trolley buses and buses'],
  ferry: ['⛴️', 'ferries'],
};

function status(s: LiveState, id: string): { status: FeedStatus; age: number } {
  if (id === 'transit') return { status: s.transit.status, age: Infinity };
  const f = s.feeds.get(id);
  return { status: f?.status ?? 'off', age: f?.age() ?? Infinity };
}

function card(title: string, cls: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', `live-card ${cls}`);
  root.append(el('h3', '', title));
  const body = el('div', 'live-card-body');
  root.append(body);
  return { root, body };
}

function row(label: string, value: string): HTMLElement {
  const r = el('div', 'live-row');
  r.append(el('span', '', label), el('strong', '', value));
  return r;
}

function tideCurve(game: Game, s: LiveState): SVGSVGElement {
  const now = game.date().getTime();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 240 70');
  svg.setAttribute('class', 'live-tide-curve');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Tide height over the next 24 hours');
  const h = (t: number) => heightBetween(s.tides, t) ?? harmonicHeight(t);
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const v = h(now - 3 * 3600_000 + i * 1800_000);
    pts.push(`${(i * 5).toFixed(1)},${(62 - ((v + 0.5) / 2.6) * 56).toFixed(1)}`);
  }
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', `M0,70 L${pts.join(' L')} L240,70 Z`);
  area.setAttribute('class', 'live-tide-area');
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', pts.join(' '));
  line.setAttribute('class', 'live-tide-line');
  const mark = document.createElementNS(ns, 'line');
  mark.setAttribute('x1', '30');
  mark.setAttribute('x2', '30');
  mark.setAttribute('y1', '0');
  mark.setAttribute('y2', '70');
  mark.setAttribute('class', 'live-tide-now');
  svg.append(area, line, mark);
  return svg;
}

export function nextCableCar(routes: Route[], game: Game): { text: string; stop: string } | null {
  const cable = routes.filter((r) => r.mode === 'cable');
  const p = game.flight.pos;
  const near = nearestStop(cable, p.x, p.z);
  if (!near) return null;
  const t = sfTime(game.date());
  let best: { secs: number; route: Route; to: string } | null = null;
  for (const r of cable) {
    r.shapes.forEach((sh, si) => {
      const end = sh.stops.at(-1);
      if (!end || Math.hypot(end.x - near.stop.x, end.z - near.stop.z) <= 60) return;
      for (const st of sh.stops) {
        if (Math.hypot(st.x - near.stop.x, st.z - near.stop.z) > 60) continue;
        const secs = nextPass(r, si, st.at, t);
        if (secs !== null && (!best || secs < best.secs)) best = { secs, route: r, to: end.name };
      }
    });
  }
  const b = best as { secs: number; route: Route; to: string } | null;
  if (!b) return { stop: near.stop.name, text: 'No cable cars scheduled' };
  const mins = Math.round(b.secs / 60);
  const when = mins < 1 ? 'arriving now' : mins <= 90 ? `in ${mins} min` : `at ${sfClock(new Date(game.date().getTime() + b.secs * 1000))}`;
  return { stop: near.stop.name, text: `${b.route.name} toward ${b.to} ${when}` };
}

function findVehicle(game: Game, mode: Mode): boolean {
  const p = game.flight.pos;
  const best = liveState(game)
    .transit.vehicles.filter((v) => v.mode === mode)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (!best) return false;
  game.waypoint = { x: best.x, y: best.y + 12, z: best.z, label: best.name };
  game.toast(`Waypoint: ${best.name}`);
  return true;
}

function render(root: HTMLElement, game: Game): void {
  const s = liveState(game);
  const imperial = game.save.data.settings.units === 'imperial';
  const now = game.date();
  const ms = now.getTime();
  root.replaceChildren();

  const chips = el('div', 'live-chips');
  for (const [id, label] of FEEDS) {
    const st = status(s, id);
    const chip = el('div', `live-chip live-${st.status}`);
    chip.dataset.feed = id;
    chip.dataset.status = st.status;
    chip.append(el('i'), el('span', '', label), el('small', '', `${STATUS_TEXT[st.status]}${Number.isFinite(st.age) ? `, ${ago(st.age)}` : ''}`));
    chips.append(chip);
  }
  root.append(el('p', 'live-intro', `San Francisco right now, ${sfClock(now)}. Real feeds when online, honest models when not.`), chips);

  const grid = el('div', 'live-grid');
  const w = s.weather;
  const wc = card('Weather', 'live-weather');
  if (w) {
    const d = describe(w.code);
    const temp = imperial ? `${Math.round((w.temp * 9) / 5 + 32)}°F` : `${Math.round(w.temp)}°C`;
    const speed = (v: number) => (imperial ? `${Math.round(v * 2.237)} mph` : `${Math.round(v * 3.6)} km/h`);
    const big = el('div', 'live-big');
    big.append(el('span', 'live-icon', d.icon), el('strong', '', temp), el('span', '', d.text));
    const arrow = el('span', 'live-arrow', '➤');
    arrow.style.transform = `rotate(${w.dir + 90}deg)`;
    arrow.setAttribute('aria-hidden', 'true');
    const wind = row('Wind', `${compass(w.dir)} ${speed(w.wind)}, gusts ${speed(w.gust)}`);
    wind.prepend(arrow);
    const vis = w.vis >= 20000 ? 'Unlimited' : imperial ? `${(w.vis / 1609).toFixed(1)} mi` : `${(w.vis / 1000).toFixed(1)} km`;
    const meter = el('div', 'live-meter');
    const fill = el('i');
    fill.style.width = `${Math.round(((s.fog - 1) / 2) * 100)}%`;
    meter.append(fill);
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', 'Fog density');
    meter.setAttribute('aria-valuemin', '1');
    meter.setAttribute('aria-valuemax', '3');
    meter.setAttribute('aria-valuenow', s.fog.toFixed(2));
    wc.body.append(big, wind, row('Visibility', vis), row('Low clouds', `${Math.round(w.lowCloud)}%`), row('Fog', fogLabel(s.fog)), meter);
    if (status(s, 'weather').status === 'fallback') wc.body.append(el('p', 'live-note', 'Offline: typical weather for this month and hour.'));
  }
  grid.append(wc.root);

  const qc = card('Earthquakes', 'live-quakes');
  if (s.quakes.length) {
    const q = s.quakes[0];
    const big = el('div', 'live-big');
    big.append(el('span', 'live-icon', '〰️'), el('strong', '', `M${q.mag.toFixed(1)}`), el('span', '', q.place));
    qc.body.append(big, row('When', ago(Date.now() - q.time)), row('Distance', imperial ? `${Math.round(q.km / 1.609)} mi` : `${Math.round(q.km)} km`), row('Depth', `${q.depth.toFixed(1)} km`));
    const list = el('ul', 'live-list');
    for (const o of s.quakes.slice(1, 5)) list.append(el('li', '', `M${o.mag.toFixed(1)} ${o.place}, ${ago(Date.now() - o.time)}`));
    qc.body.append(list);
  } else {
    qc.body.append(el('p', 'live-note', 'No live feed right now. The last big one was Loma Prieta: magnitude 6.9 at 5:04 pm on October 17, 1989.'));
  }
  qc.body.append(el('p', 'live-note', 'A new Bay Area quake of magnitude 2.5 or more during your flight shakes the camera and earns a rare card.'));
  grid.append(qc.root);

  const pc = card('Planes', 'live-planes');
  const me = game.flight.pos;
  const near = s.planes
    .map((p) => {
      const { x, z } = toLocal(p.lat, p.lon);
      return { p, d: Math.hypot(x - me.x, z - me.z) };
    })
    .sort((a, b) => a.d - b.d);
  const within = near.filter((n) => n.d < 30000);
  const big = el('div', 'live-big');
  big.append(el('span', 'live-icon', '✈️'), el('strong', '', String(within.length)), el('span', '', 'in the air within 30 km'));
  pc.body.append(big);
  for (const { p, d } of near.slice(0, 3)) {
    const alt = imperial ? `${Math.round(p.alt * 3.281).toLocaleString('en-US')} ft` : `${Math.round(p.alt).toLocaleString('en-US')} m`;
    const dist = imperial ? `${(d / 1609).toFixed(1)} mi` : `${(d / 1000).toFixed(1)} km`;
    pc.body.append(row(p.label, `${alt}, ${dist}, heading ${compass(p.track)}`));
  }
  pc.body.append(el('p', 'live-note', status(s, 'planes').status === 'live' ? 'Positions from OpenSky Network.' : 'Simulated SFO and OAK traffic on the real runways and 3 degree glide paths.'));
  grid.append(pc.root);

  const tc = card('Transit', 'live-transit');
  const data = s.transit.data;
  if (data) {
    const t = sfTime(now);
    const counts = new Map<Mode, number>();
    for (const r of data.routes) counts.set(r.mode, (counts.get(r.mode) ?? 0) + vehiclesAt(r, t).length);
    const cc = nextCableCar(data.routes, game);
    if (cc) {
      const big = el('div', 'live-big');
      big.append(el('span', 'live-icon', '🚋'), el('strong', '', 'Next cable car'), el('span', '', cc.stop));
      tc.body.append(big, el('p', 'live-next', cc.text));
    }
    for (const [mode, n] of counts) tc.body.append(row(`${MODE_LABEL[mode][0]} ${MODE_LABEL[mode][1]}`, `${n} running`));
    const actions = el('div', 'live-actions');
    for (const [mode, label] of [['cable', 'Find a cable car'], ['ferry', 'Find a ferry']] as [Mode, string][]) {
      const b = el('button', 'live-btn', label);
      b.addEventListener('click', () => {
        if (findVehicle(game, mode)) game.panels.close();
        else b.textContent = 'None running right now';
      });
      actions.append(b);
    }
    tc.body.append(actions, el('p', 'live-note', `SFMTA, Golden Gate Ferry and SF Bay Ferry timetables, baked ${data.generated}.`));
  } else {
    tc.body.append(el('p', 'live-note', s.transit.status === 'loading' ? 'Loading timetables.' : 'Timetables unavailable.'));
  }
  grid.append(tc.root);

  const tide = tideNow(s.tides, ms);
  const tdc = card('Tides at the Golden Gate', 'live-tides');
  const fmt = (m: number) => (imperial ? `${(m * 3.281).toFixed(1)} ft` : `${m.toFixed(2)} m`);
  const tbig = el('div', 'live-big');
  tbig.append(el('span', 'live-icon', tide.rising ? '⬆️' : '⬇️'), el('strong', '', fmt(tide.height)), el('span', '', tide.rising ? 'rising' : 'falling'));
  tdc.body.append(tbig);
  for (const e of [tide.next, tide.after]) if (e) tdc.body.append(row(`${e.high ? 'High' : 'Low'} tide`, `${fmt(e.h)} at ${sfClock(new Date(e.t))}`));
  tdc.body.append(tideCurve(game, s), el('p', 'live-note', `NOAA station 9414290, heights above mean lower low water.${status(s, 'tides').status === 'fallback' ? ' Offline: computed from NOAA harmonic constants.' : ''}`));
  grid.append(tdc.root);

  root.append(grid);
}

export const panel: Panel = {
  id: 'live',
  title: 'Live SF',
  icon: '📡',
  order: 40,
  render(root, game) {
    render(root, game);
    const timer = setInterval(() => {
      const focused = root.contains(document.activeElement) ? document.activeElement?.textContent : null;
      render(root, game);
      if (focused) [...root.querySelectorAll('button')].find((b) => b.textContent === focused)?.focus();
    }, 2000);
    return () => clearInterval(timer);
  },
};
