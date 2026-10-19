import type { CardCategory, CardDef } from '../content/types';
import type { ActivityDef } from '../activities/types';
import { CATEGORY } from './card-art';

export interface DexGroup {
  category: CardCategory;
  label: string;
  icon: string;
  cards: CardDef[];
  owned: number;
}

const RARITY = { legendary: 0, rare: 1, common: 2 } as const;

export function groupCards(cards: CardDef[], owned: ReadonlySet<string>): DexGroup[] {
  const order = Object.keys(CATEGORY) as CardCategory[];
  return order
    .map((category) => {
      const list = cards.filter((c) => c.category === category).sort((a, b) => RARITY[a.rarity] - RARITY[b.rarity] || a.name.localeCompare(b.name));
      return { category, ...CATEGORY[category], cards: list, owned: list.filter((c) => owned.has(c.id)).length };
    })
    .filter((g) => g.cards.length > 0);
}

export function sourceActivity(card: CardDef, defs: ActivityDef[]): ActivityDef | undefined {
  return defs.find((d) => d.card === card.id && !d.hidden) ?? defs.find((d) => d.card === card.id);
}

export function hintFor(card: CardDef, defs: ActivityDef[]): string {
  const src = sourceActivity(card, defs);
  if (src && !src.hidden) return `Earned from "${src.title}" in ${src.neighborhood}.`;
  if (src) return `A secret somewhere in ${src.neighborhood}.`;
  return `Look around ${card.neighborhood}.`;
}

export function completion(cards: CardDef[], owned: ReadonlySet<string>): { owned: number; total: number; pct: number } {
  const n = cards.filter((c) => owned.has(c.id)).length;
  return { owned: n, total: cards.length, pct: cards.length ? Math.round((100 * n) / cards.length) : 0 };
}

export function searchCards(cards: CardDef[], owned: ReadonlySet<string>, q: string): CardDef[] {
  const s = q.trim().toLowerCase();
  if (!s) return cards;
  return cards.filter((c) => `${c.category} ${c.neighborhood} ${owned.has(c.id) ? `${c.name} ${c.blurb}` : ''}`.toLowerCase().includes(s));
}
