import type { Panel } from '../panel-host';
import { el } from '../panel-host';

export const panel: Panel = {
  id: 'menu',
  title: 'Menu',
  icon: '☰',
  order: 0,
  render(root, game) {
    const done = Object.keys(game.save.data.completed).length;
    const total = game.activities.list().length;
    const summary = el('p', 'menu-summary', `${done} of ${total} things done · ${game.save.data.cards.length} cards · ${game.save.data.xp} XP`);
    const grid = el('div', 'menu-grid');
    const resume = el('button', 'menu-tile primary', '▶  Keep flying');
    resume.addEventListener('click', () => game.panels.close());
    grid.append(resume);
    for (const p of game.panels.list()) {
      if (p.id === 'menu') continue;
      const b = el('button', 'menu-tile');
      b.dataset.panel = p.id;
      b.textContent = `${p.icon}  ${p.title}`;
      b.addEventListener('click', () => game.panels.open(p.id));
      grid.append(b);
    }
    const keys = el('dl', 'keys');
    for (const [k, v] of [
      ['W / S', 'forward / back'],
      ['A / D', 'turn'],
      ['Q / E', 'slide sideways'],
      ['Space / Shift', 'up / down'],
      ['R (hold)', 'boost'],
      ['F', 'start the activity you are next to'],
      ['V', 'camera view'],
      ['Esc', 'menu'],
    ]) {
      keys.append(el('dt', '', k), el('dd', '', v));
    }
    root.append(summary, grid, keys);
  },
};
