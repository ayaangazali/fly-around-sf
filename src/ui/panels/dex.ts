import './dex.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { Game } from '../../game';
import type { CardDef } from '../../content/types';
import { loadCards } from '../../content/types';
import { completion, groupCards, hintFor, searchCards, sourceActivity } from '../dex-model';
import { cardFace, enableTilt, RARITY_LABEL } from '../card-view';
import { CATEGORY } from '../card-art';
import { setWaypoint } from '../waypoint';
import { settingsOf } from '../settings-model';

let cards: CardDef[] | null = null;
let pendingCard: string | null = null;
let activeCategory = 'all';

export function allCards(): CardDef[] {
  return (cards ??= [...new Map(loadCards().map((c) => [c.id, c])).values()]);
}

export function openCard(game: Game, id: string): void {
  pendingCard = id;
  game.panels.open('dex');
}

export const panel: Panel = {
  id: 'dex',
  title: 'Collection',
  icon: '🃏',
  action: 'dex',
  order: 15,
  render(root, game) {
    const list = allCards();
    const owned = new Set(game.save.data.cards);
    const defs = game.activities.list();
    const reduced = settingsOf(game).reducedMotion;
    const total = completion(list, owned);
    root.classList.add('dex-body');
    root.dataset.total = String(list.length);

    const head = el('div', 'dex-head');
    const ring = el('div', 'dex-ring');
    ring.style.setProperty('--p', String(total.pct));
    ring.append(el('b', '', `${total.pct}%`));
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', `${total.pct} percent collected`);
    const text = el('div', 'dex-head-text');
    text.append(el('strong', '', `${total.owned} of ${total.total} cards`), el('span', '', list.length ? 'Fly, discover and complete activities to unlock more.' : 'No cards in this build yet.'));
    const search = el('input', 'dex-search');
    search.type = 'search';
    search.placeholder = 'Search by place or category';
    search.setAttribute('aria-label', 'Search cards');
    head.append(ring, text, search);

    const tabs = el('div', 'dex-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Card categories');
    const view = el('div', 'dex-view');
    root.append(head, tabs, view);

    const groups = groupCards(list, owned);
    const tab = (id: string, label: string, count: string) => {
      const b = el('button', 'dex-tab');
      b.setAttribute('role', 'tab');
      b.dataset.category = id;
      b.setAttribute('aria-selected', String(id === activeCategory));
      b.append(el('span', '', label), el('small', '', count));
      b.addEventListener('click', () => {
        activeCategory = id;
        for (const t of tabs.children) t.setAttribute('aria-selected', String((t as HTMLElement).dataset.category === id));
        drawGrid();
      });
      tabs.append(b);
    };
    if (!groups.some((g) => g.category === activeCategory)) activeCategory = 'all';
    tab('all', 'All', `${total.owned}/${total.total}`);
    for (const g of groups) tab(g.category, `${g.icon} ${g.label}`, `${g.owned}/${g.cards.length}`);

    let untilt: () => void = () => undefined;
    const drawGrid = () => {
      untilt();
      view.replaceChildren();
      const q = search.value;
      const shown = groups.filter((g) => activeCategory === 'all' || g.category === activeCategory);
      let any = false;
      for (const g of shown) {
        const matches = searchCards(g.cards, owned, q);
        if (!matches.length) continue;
        any = true;
        const section = el('section', 'dex-section');
        const h = el('h3', '', `${g.icon} ${g.label}`);
        h.append(el('small', '', `${g.owned} / ${g.cards.length}`));
        const grid = el('div', 'dex-grid');
        for (const c of matches) {
          const face = cardFace(c, owned.has(c.id));
          face.addEventListener('click', () => drawDetail(c));
          grid.append(face);
        }
        section.append(h, grid);
        view.append(section);
      }
      if (!any) view.append(el('p', 'dex-empty', list.length ? 'No cards match that search.' : 'Cards will appear here as the city fills with things to find.'));
    };

    const drawDetail = (c: CardDef) => {
      const have = owned.has(c.id);
      const meta = CATEGORY[c.category] ?? CATEGORY.hidden;
      view.replaceChildren();
      const detail = el('article', 'dex-detail');
      detail.dataset.card = c.id;
      const back = el('button', 'btn dex-back', '← All cards');
      back.addEventListener('click', () => {
        drawGrid();
        (view.querySelector(`[data-card="${c.id}"]`) as HTMLElement | null)?.focus();
      });
      const face = cardFace(c, have, 'div');
      face.classList.add('big');
      untilt = enableTilt(face, reduced || !have);
      const info = el('div', 'dex-info');
      const title = el('h3', '', have ? c.name : 'Undiscovered card');
      const tags = el('p', 'dex-tags');
      for (const t of [`${meta.icon} ${meta.one}`, RARITY_LABEL[c.rarity], c.neighborhood, ...(have && c.year ? [String(c.year)] : [])]) tags.append(el('span', `tag${t === RARITY_LABEL[c.rarity] ? ` rarity-${c.rarity}` : ''}`, t));
      info.append(title, tags);
      if (have) {
        info.append(el('p', 'dex-blurb', c.blurb), el('p', 'dex-lore', c.lore));
        if (c.facts.length) {
          const facts = el('ul', 'dex-facts');
          for (const f of c.facts) facts.append(el('li', '', f));
          info.append(el('h4', '', 'Facts'), facts);
        }
        if (c.sources.length) {
          const src = el('ul', 'dex-sources');
          for (const s of c.sources) {
            const a = el('a', '', new URL(s).hostname.replace(/^www\./, ''));
            a.href = s;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            const li = el('li');
            li.append(a);
            src.append(li);
          }
          info.append(el('h4', '', 'Sources'), src);
        }
      } else {
        info.append(el('p', 'dex-hint', hintFor(c, defs)));
      }
      const actions = el('div', 'dex-actions');
      const target = c.at ? game.world.point(c.at) : (() => {
        const src = sourceActivity(c, defs);
        return src && !src.hidden ? game.activities.position(src) : null;
      })();
      if (target) {
        const go = el('button', 'btn primary', have ? 'Fly there' : 'Set waypoint to the hint');
        go.addEventListener('click', () => {
          setWaypoint(game, target, have ? c.name : 'Card hint');
          game.panels.close();
        });
        actions.append(go);
      }
      info.append(actions);
      detail.append(face, info);
      view.append(back, detail);
      back.focus();
    };

    search.addEventListener('input', drawGrid);
    const pending = pendingCard ? list.find((c) => c.id === pendingCard) : undefined;
    pendingCard = null;
    if (pending) drawDetail(pending);
    else drawGrid();
    return () => untilt();
  },
};
