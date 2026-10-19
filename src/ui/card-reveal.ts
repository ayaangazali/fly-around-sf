import type { Game } from '../game';
import { el } from './panel-host';
import { cardFace, RARITY_LABEL } from './card-view';
import { allCards, openCard } from './panels/dex';
import { settingsOf } from './settings-model';

export function installCardReveal(game: Game): void {
  const queue: string[] = [];
  let showing = false;
  const next = () => {
    const id = queue.shift();
    const card = id ? allCards().find((c) => c.id === id) : undefined;
    if (!card) {
      showing = false;
      if (queue.length) next();
      return;
    }
    showing = true;
    const root = el('div', `reveal rarity-${card.rarity}`);
    root.setAttribute('role', 'status');
    root.dataset.card = card.id;
    const burst = el('div', 'reveal-burst');
    const stage = el('div', 'reveal-stage');
    const flip = el('div', 'reveal-flip');
    const back = el('div', 'reveal-back');
    back.innerHTML = '<span>SF</span>';
    const face = cardFace(card, true, 'div');
    flip.append(back, face);
    stage.append(flip);
    const caption = el('div', 'reveal-caption');
    caption.append(el('small', '', `New ${RARITY_LABEL[card.rarity].toLowerCase()} card`), el('strong', '', card.name), el('span', '', card.blurb));
    const actions = el('div', 'reveal-actions');
    const view = el('button', 'btn primary', 'View card');
    const keep = el('button', 'btn', 'Keep flying');
    actions.append(view, keep);
    caption.append(actions);
    root.append(burst, stage, caption);
    game.ui.append(root);
    if (settingsOf(game).reducedMotion) root.classList.add('still');
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      root.classList.add('out');
      setTimeout(() => {
        root.remove();
        next();
      }, 380);
    };
    view.addEventListener('click', () => {
      close();
      openCard(game, card.id);
    });
    keep.addEventListener('click', close);
    setTimeout(close, 6500);
  };
  game.bus.on('card:unlock', ({ id }) => {
    queue.push(id);
    if (!showing) next();
  });
}
