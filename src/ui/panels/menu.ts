import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import { KEYMAP } from '../../core/input';
import { pilotLevel } from '../stats-model';
import { settingsOf } from '../settings-model';
import { nearestOpen } from '../nearby';
import { formatDistance } from '../map-view';
import { setWaypoint } from '../waypoint';

const ABOUT: Record<string, string> = {
  map: 'Every building, every activity',
  journal: 'Everything to do, nearest first',
  dex: 'Cards you have collected',
  stats: 'Your flight log and achievements',
  help: 'Keyboard, gamepad and touch',
  settings: 'Graphics, sound, controls',
};

const keyFor = (action?: string) => {
  const code = Object.entries(KEYMAP).find(([, a]) => a === action)?.[0];
  return code ? code.replace(/^Key/, '') : '';
};

export const panel: Panel = {
  id: 'menu',
  title: 'Menu',
  icon: '☰',
  order: 0,
  render(root, game) {
    const save = game.save.data;
    const lvl = pilotLevel(save.xp);
    const defs = game.activities.list().filter((d) => d.kind !== 'achievement' && !d.hidden);
    const done = defs.filter((d) => game.save.isDone(d.id)).length;
    const head = el('div', 'menu-head');
    head.append(
      el('strong', '', settingsOf(game).playerName),
      el('p', 'menu-summary', `Level ${lvl.level} · ${save.xp} XP · ${done} of ${defs.length} things done · ${save.cards.length} cards`),
    );
    const grid = el('div', 'menu-grid');
    const resume = el('button', 'menu-tile primary');
    resume.append(el('b', '', '▶  Keep flying'), el('small', '', 'Back to the sky'));
    resume.addEventListener('click', () => game.panels.close());
    grid.append(resume);
    for (const p of game.panels.list()) {
      if (p.id === 'menu') continue;
      const b = el('button', 'menu-tile');
      b.dataset.panel = p.id;
      const key = keyFor(p.action);
      const title = el('b', '', `${p.icon}  ${p.title}`);
      if (key) title.append(el('kbd', '', key));
      b.append(title);
      if (ABOUT[p.id]) b.append(el('small', '', ABOUT[p.id]));
      b.addEventListener('click', () => game.panels.open(p.id));
      grid.append(b);
    }
    const near = nearestOpen(game, 3);
    root.append(head, grid);
    if (near.length) {
      const next = el('section', 'menu-next');
      next.append(el('h3', '', 'Up next nearby'));
      const imperial = settingsOf(game).units === 'imperial';
      for (const { def, dist } of near) {
        const kind = game.activities.kindOf(def);
        const b = el('button', 'menu-next-item');
        b.dataset.activity = def.id;
        b.append(el('span', 'menu-next-icon', kind.icon), el('b', '', def.title), el('small', '', `${kind.label} · ${formatDistance(dist, imperial)}`));
        b.addEventListener('click', () => {
          setWaypoint(game, game.activities.position(def), def.title);
          game.panels.close();
        });
        next.append(b);
      }
      root.append(next);
    }
  },
};
