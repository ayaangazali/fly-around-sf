import './objective.css';
import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';
import type { Waypoint } from '../activities/quest-common';
import { trailParams, trailStops } from '../activities/kinds/trail';
import { el } from './panel-host';
import { bearingDeg, formatDistance, headingDeg, relativeDeg } from './map-view';
import { setSetting, settingsOf } from './settings-model';

const TUTORIAL = '.onboard:not([data-step="done"])';

function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function showFinale(game: Game, stops: ActivityDef[]): HTMLElement {
  const times = stops.map((d) => game.save.data.completed[d.id]).filter((t) => typeof t === 'number');
  const cards = stops.filter((d) => d.card && game.save.data.cards.includes(d.card)).length;
  const root = el('section', 'finale');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Founder Trail complete');
  const box = el('div', 'finale-box');
  const span = times.length > 1 ? ` in ${duration(Math.max(...times) - Math.min(...times))}` : '';
  box.append(
    el('small', '', 'Founder Trail complete'),
    el('h2', '', 'You flew the whole trail'),
    el('p', '', `${stops.length} stops from ${stops[0].title} to ${stops[stops.length - 1].title}${span}. ${cards} of ${stops.length} trail cards are in your collection.`),
  );
  const actions = el('div', 'finale-actions');
  const off = game.bus.on('panel:open', () => close());
  const close = () => {
    root.remove();
    off();
  };
  if (!settingsOf(game).sideActivities) {
    const side = el('button', 'btn primary', 'Show side activities');
    side.addEventListener('click', () => {
      setSetting(game, 'sideActivities', true);
      game.toast('Side activities are on. Look for beacons around the city', 'info');
      close();
    });
    actions.append(side);
  }
  const keep = el('button', `btn${actions.childElementCount ? '' : ' primary'}`, 'Keep flying');
  keep.addEventListener('click', close);
  actions.append(keep);
  box.append(actions);
  root.append(el('div', 'finale-burst'), box);
  game.ui.append(root);
  return root;
}

export function installObjective(game: Game): { update(): void } {
  const root = el('button', 'objective');
  root.hidden = true;
  const step = el('span', 'objective-step');
  const dist = el('span', 'objective-dist');
  const head = el('span', 'objective-head');
  head.append(step, dist);
  const arrow = el('i', 'objective-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  const name = el('strong', 'objective-name');
  const main = el('span', 'objective-main');
  main.append(arrow, name);
  const clue = el('span', 'objective-clue');
  const bar = el('span', 'objective-bar');
  const fill = el('i');
  bar.append(fill);
  root.append(head, main, clue, bar);
  root.addEventListener('click', () => game.panels.open('map'));
  game.hud.root.append(root);

  let shownId: string | null | undefined;
  let mine: Waypoint | null = null;
  let finale = false;
  let last = '';
  game.bus.on('activity:complete', ({ id }) => {
    if (game.activities.defs.get(id)?.kind === 'trail' && trailStops(game).every((d) => game.save.isDone(d.id))) finale = true;
  });

  const paint = (stops: ActivityDef[], cur: ActivityDef | null) => {
    last = '';
    const done = stops.filter((d) => game.save.isDone(d.id)).length;
    fill.style.width = `${(done / stops.length) * 100}%`;
    root.classList.toggle('complete', !cur);
    root.classList.remove('bump');
    void root.offsetWidth;
    root.classList.add('bump');
    if (!cur) {
      step.textContent = `Founder Trail · ${stops.length}/${stops.length}`;
      name.textContent = 'Trail complete';
      clue.textContent = 'Every stop visited. Open the map to fly anywhere, or turn on side activities in Settings.';
      dist.textContent = '';
      root.setAttribute('aria-label', 'Founder Trail complete. Open the map');
      return;
    }
    const p = trailParams(cur);
    step.textContent = `Founder Trail · ${p.order}/${stops.length}`;
    name.textContent = cur.title;
    clue.textContent = p.clue;
    root.title = p.clue;
    root.setAttribute('aria-label', `Founder Trail stop ${p.order} of ${stops.length}: ${cur.title}. ${p.clue} Open the map`);
  };

  return {
    update() {
      const stops = trailStops(game);
      root.hidden = !game.loaded || !stops.length || !!game.hud.root.querySelector(TUTORIAL);
      if (root.hidden) return;
      if (finale && !game.panels.openId && !game.ui.querySelector('.reveal')) {
        finale = false;
        showFinale(game, stops);
      }
      const cur = stops.find((d) => !game.save.isDone(d.id)) ?? null;
      const t = cur && game.activities.position(cur);
      if (cur?.id !== shownId) {
        shownId = cur?.id ?? null;
        paint(stops, cur);
        if (game.waypoint === mine) game.waypoint = null;
        mine = cur && t ? { x: t.x, y: t.y, z: t.z, label: cur.title, quest: true } : null;
        if (mine && !game.activities.active) game.waypoint = mine;
      }
      if (!t || !mine) return;
      if (game.activities.active) {
        if (game.waypoint === mine) game.waypoint = null;
      } else if (!game.waypoint) game.waypoint = mine;
      const p = game.flight.pos;
      const turn = Math.round(relativeDeg(bearingDeg(p.x, p.z, t.x, t.z), headingDeg(game.flight.yaw)) / 3) * 3;
      const text = formatDistance(Math.hypot(t.x - p.x, t.z - p.z), settingsOf(game).units === 'imperial');
      const key = `${turn}|${text}`;
      if (key === last) return;
      last = key;
      arrow.style.transform = `rotate(${turn}deg)`;
      dist.textContent = text;
    },
  };
}
