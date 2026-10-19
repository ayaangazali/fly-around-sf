import './stats.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import { breakdowns, formatDuration, pilotLevel, type Breakdown } from '../stats-model';
import { achievementProgress } from '../../activities/kinds/achievement';
import { formatDistance } from '../map-view';
import { settingsOf } from '../settings-model';

export const panel: Panel = {
  id: 'stats',
  title: 'Pilot log',
  icon: '📈',
  order: 20,
  render(root, game) {
    const save = game.save.data;
    const s = settingsOf(game);
    const lvl = pilotLevel(save.xp);
    const achievements = game.activities.list().filter((d) => d.kind === 'achievement');
    const unlocked = achievements.filter((d) => game.save.isDone(d.id)).length;
    root.classList.add('stats-body');

    const pilot = el('div', 'pilot');
    const badge = el('div', 'pilot-badge');
    badge.style.setProperty('--c', s.droneColor);
    badge.append(el('b', '', String(lvl.level)));
    badge.setAttribute('aria-hidden', 'true');
    const who = el('div', 'pilot-who');
    const bar = el('div', 'xp-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Progress to next level');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(lvl.span));
    bar.setAttribute('aria-valuenow', String(lvl.into));
    bar.append(el('i'));
    (bar.firstElementChild as HTMLElement).style.width = `${(100 * lvl.into) / lvl.span}%`;
    who.append(el('strong', '', s.playerName), el('span', '', `Level ${lvl.level} pilot · ${save.xp} XP · ${lvl.span - lvl.into} XP to level ${lvl.level + 1}`), bar);
    pilot.append(badge, who);

    const imperial = s.units === 'imperial';
    const tiles = el('div', 'stat-tiles');
    const done = Object.keys(save.completed).filter((id) => !id.startsWith('achievement-')).length;
    for (const [label, value, id] of [
      ['Distance flown', formatDistance(save.stats.distance, imperial), 'distance'],
      ['Flight time', formatDuration(save.stats.flightTime), 'time'],
      ['Activities done', String(done), 'done'],
      ['Cards', String(save.cards.length), 'cards'],
      ['Best times', String(Object.keys(save.best).length), 'bests'],
      ['Crashes', String(save.stats.crashes), 'crashes'],
      ['Sessions', String(save.stats.sessions), 'sessions'],
      ['Achievements', `${unlocked}/${achievements.length}`, 'achievements'],
    ]) {
      const t = el('div', 'stat-tile');
      t.dataset.stat = id;
      t.append(el('b', '', value), el('span', '', label));
      tiles.append(t);
    }

    const bars = (title: string, rows: Breakdown[]) => {
      const sec = el('section', 'stat-section');
      sec.append(el('h3', '', title));
      const list = el('ul', 'bars');
      for (const r of rows) {
        const li = el('li');
        li.dataset.key = r.key;
        const meter = el('div', 'bar');
        const fill = el('i');
        fill.style.width = `${(100 * r.done) / r.total}%`;
        meter.append(fill);
        meter.setAttribute('role', 'progressbar');
        meter.setAttribute('aria-label', `${r.label} completion`);
        meter.setAttribute('aria-valuemin', '0');
        meter.setAttribute('aria-valuemax', String(r.total));
        meter.setAttribute('aria-valuenow', String(r.done));
        li.append(el('span', 'bar-label', `${r.icon} ${r.label}`), meter, el('small', '', `${r.done}/${r.total}`));
        list.append(li);
      }
      if (!rows.length) list.append(el('li', 'empty', 'Nothing here yet.'));
      sec.append(list);
      return sec;
    };
    const { byHood, byKind } = breakdowns(game);

    const ach = el('section', 'stat-section');
    ach.append(el('h3', '', `Achievements · ${unlocked} of ${achievements.length}`));
    const grid = el('ul', 'ach-grid');
    const sorted = [...achievements].sort((a, b) => achievementProgress(b, game) - achievementProgress(a, game));
    for (const d of sorted) {
      const p = achievementProgress(d, game);
      const got = game.save.isDone(d.id);
      const li = el('li', `ach-card${got ? ' got' : ''}`);
      li.dataset.activity = d.id;
      const meter = el('div', 'bar');
      const fill = el('i');
      fill.style.width = `${p * 100}%`;
      meter.append(fill);
      meter.setAttribute('aria-hidden', 'true');
      li.append(el('span', 'ach-icon', got ? '🏆' : '🔒'), el('strong', '', d.title), el('p', '', d.blurb), meter, el('small', '', got ? `Unlocked ${new Date(save.completed[d.id]).toLocaleDateString()}` : `${Math.floor(p * 100)}%`));
      grid.append(li);
    }
    ach.append(grid);

    const cols = el('div', 'stat-cols');
    cols.append(bars('By neighborhood', byHood), bars('By kind', byKind));
    root.append(pilot, tiles, ach, cols);
  },
};
