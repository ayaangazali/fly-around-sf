import './cards.css';
import type { CardDef } from '../content/types';
import { el } from './panel-host';
import { cardArt, CATEGORY } from './card-art';

export const RARITY_LABEL = { common: 'Common', rare: 'Rare', legendary: 'Legendary' } as const;

export function cardFace(card: CardDef, owned: boolean, tag: 'button' | 'div' = 'button'): HTMLElement {
  const meta = CATEGORY[card.category] ?? CATEGORY.hidden;
  const root = el(tag, `tcard rarity-${card.rarity} cat-${card.category}`);
  root.classList.toggle('locked', !owned);
  root.dataset.card = card.id;
  const art = el('div', 'tcard-art');
  art.innerHTML = cardArt(card);
  const badge = el('span', 'tcard-badge', meta.icon);
  badge.setAttribute('aria-hidden', 'true');
  const info = el('div', 'tcard-info');
  const name = el('b', '', owned ? card.name : '???');
  info.append(name, el('small', '', owned ? `${meta.one} · ${RARITY_LABEL[card.rarity]}` : `${meta.one} · ${card.neighborhood}`));
  root.append(art, el('div', 'tcard-foil'), badge, info);
  if (!owned) {
    name.setAttribute('aria-hidden', 'true');
    info.prepend(el('span', 'sr-only', 'Locked card'));
    const q = el('span', 'tcard-q', '?');
    q.setAttribute('aria-hidden', 'true');
    root.append(q);
  }
  return root;
}

export function enableTilt(node: HTMLElement, reduced: boolean): () => void {
  if (reduced) return () => undefined;
  const move = (e: PointerEvent) => {
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    node.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    node.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
    node.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
    node.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  const leave = () => {
    for (const p of ['--rx', '--ry', '--mx', '--my']) node.style.removeProperty(p);
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerleave', leave);
  };
}
