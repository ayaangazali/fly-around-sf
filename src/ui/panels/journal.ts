import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { ActivityDef } from '../../activities/types';

export const panel: Panel = {
  id: 'journal',
  title: 'Things to do',
  icon: '📋',
  action: 'journal',
  order: 10,
  render(root, game) {
    const filter = el('input', 'journal-filter');
    filter.type = 'search';
    filter.placeholder = 'Search activities, places, neighborhoods';
    filter.setAttribute('aria-label', 'Search activities');
    const list = el('ul', 'journal-list');
    const p = game.flight.pos;
    const dist = (d: ActivityDef) => {
      const q = game.activities.position(d);
      return Math.hypot(q.x - p.x, q.z - p.z);
    };
    const all = game.activities
      .list()
      .filter((d) => !d.hidden || game.save.isDone(d.id))
      .sort((a, b) => Number(game.save.isDone(a.id)) - Number(game.save.isDone(b.id)) || dist(a) - dist(b));
    const draw = () => {
      const q = filter.value.trim().toLowerCase();
      list.replaceChildren();
      for (const d of all) {
        const hay = `${d.title} ${d.blurb} ${d.neighborhood} ${d.kind} ${(d.tags ?? []).join(' ')}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        const kind = game.activities.kindOf(d);
        const li = el('li', 'journal-item');
        li.dataset.activity = d.id;
        const done = game.save.isDone(d.id);
        const locked = game.activities.locked(d);
        li.classList.toggle('done', done);
        li.classList.toggle('locked', locked);
        const km = dist(d) / 1000;
        li.append(
          el('span', 'journal-icon', kind.icon),
          el('strong', '', d.title),
          el('span', 'journal-meta', `${kind.label} · ${d.neighborhood} · ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}${done ? ' · ✓' : locked ? ' · 🔒' : ''}`),
          el('p', '', d.blurb),
        );
        list.append(li);
      }
    };
    filter.addEventListener('input', draw);
    draw();
    root.append(filter, list);
    filter.focus();
  },
};
