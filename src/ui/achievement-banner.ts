import type { Game } from '../game';
import { el } from './panel-host';

export function installAchievementBanner(game: Game): void {
  const host = el('div', 'ach-host');
  host.setAttribute('aria-live', 'polite');
  game.hud.root.append(host);
  game.bus.on('activity:complete', ({ id }) => {
    const def = game.activities.defs.get(id);
    if (!def || def.kind !== 'achievement') return;
    game.hud.muted.add(`${game.activities.kindOf(def).icon} ${def.title}`);
    const b = el('div', 'ach');
    b.dataset.activity = id;
    const medal = el('div', 'ach-medal', '🏆');
    medal.setAttribute('aria-hidden', 'true');
    const text = el('div', 'ach-text');
    text.append(el('small', '', 'Achievement unlocked'), el('strong', '', def.title), el('span', '', def.blurb));
    b.append(medal, text, el('b', 'ach-xp', `+${def.xp ?? 10} XP`));
    host.append(b);
    while (host.children.length > 3) host.firstElementChild?.remove();
    setTimeout(() => b.classList.add('out'), 4200);
    setTimeout(() => b.remove(), 4800);
  });
}
