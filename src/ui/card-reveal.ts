import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';
import { el } from './panel-host';
import { cardFace, RARITY_LABEL } from './card-view';
import { allCards, openCard } from './panels/dex';
import { settingsOf } from './settings-model';
import { isTouchDevice } from './touch';
import { currentStop, trailParams, trailStops } from '../activities/kinds/trail';
import type { CardDef } from '../content/types';

interface Reveal {
  id: string;
  stop?: ActivityDef;
}

export function installCardReveal(game: Game): void {
  const queue: Reveal[] = [];
  let showing = false;
  let dismiss: (() => void) | null = null;
  const next = () => {
    showing = false;
    document.documentElement.classList.remove('revealing');
    if (game.panels.openId || game.activities.active || game.ui.querySelector('.qd:not([hidden])')) return;
    let card: CardDef | undefined;
    let stop: ActivityDef | undefined;
    while (!card && queue.length) {
      const r = queue.shift() as Reveal;
      card = allCards().find((c) => c.id === r.id);
      stop = r.stop;
    }
    if (!card) return;
    showing = true;
    document.documentElement.classList.add('revealing');
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
    if (stop) {
      const after = currentStop(game);
      const hint = el('p', 'reveal-next');
      hint.append(el('b', '', after ? `Next: ${after.title}` : 'Trail complete'), after ? trailParams(after).clue : 'You visited every stop on the Founder Trail.');
      caption.append(el('small', '', `Founder Trail · stop ${trailParams(stop).order} of ${trailStops(game).length}`), el('strong', '', card.name), el('span', '', trailParams(stop).fact), hint);
    } else caption.append(el('small', '', `New ${RARITY_LABEL[card.rarity].toLowerCase()} card`), el('strong', '', card.name), el('span', '', card.blurb));
    if (!stop && game.save.data.cards[0] === card.id) caption.append(el('p', 'reveal-tip', `Your first card. Discover places and finish activities to fill your Collection (${isTouchDevice() ? 'tap 🃏' : 'press K'}).`));
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
      dismiss = null;
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
    dismiss = close;
    setTimeout(close, stop ? 12000 : queue.length ? 3000 : 6500);
  };
  const add = (r: Reveal) => {
    queue.push(r);
    if (!showing) next();
  };
  game.bus.on('panel:open', () => dismiss?.());
  game.bus.on('activity:start', () => dismiss?.());
  game.hud.widgets.push({ update: () => !showing && queue.length && next() });
  game.bus.on('card:unlock', ({ id }) => {
    if (settingsOf(game).sideActivities && ![...game.activities.defs.values()].some((d) => d.kind === 'trail' && d.card === id)) add({ id });
  });
  game.bus.on('activity:complete', ({ id }) => {
    const stop = game.activities.defs.get(id);
    if (stop?.kind === 'trail' && stop.card) add({ id: stop.card, stop });
  });
}
