// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { completion, groupCards, hintFor, searchCards, sourceActivity } from '../../src/ui/dex-model';
import { cardArt, CATEGORY, hash, rng } from '../../src/ui/card-art';
import { cardFace } from '../../src/ui/card-view';
import type { CardDef, CardCategory } from '../../src/content/types';
import type { ActivityDef } from '../../src/activities/types';
import { fakeGame } from './helpers';

const card = (id: string, category: CardCategory, rarity: CardDef['rarity'] = 'common', extra: Partial<CardDef> = {}): CardDef => ({
  id,
  name: id.replace(/-/g, ' '),
  category,
  rarity,
  neighborhood: 'North Beach',
  blurb: `About ${id}`,
  lore: 'Lore',
  facts: ['A fact'],
  sources: ['https://example.org'],
  ...extra,
});

const CARDS = [card('coit-tower', 'landmark'), card('transamerica', 'landmark', 'legendary'), card('sea-lions', 'wildlife', 'rare'), card('stripe', 'company'), card('secret-tunnel', 'hidden', 'rare', { neighborhood: 'Presidio' })];
vi.mock('../../src/content/types', async (real) => ({ ...(await real<object>()), loadCards: () => [...CARDS, CARDS[0]] }));
const act = (id: string, c: string, extra: Partial<ActivityDef> = {}): ActivityDef => ({ id, kind: 'discover', title: `Find ${c}`, blurb: 'b', neighborhood: 'North Beach', at: { lat: 37.8, lon: -122.4 }, card: c, ...extra });

describe('collection book', () => {
  it('[R-DEX] groups every card by category, rarest first, with owned counts', () => {
    const owned = new Set(['coit-tower', 'stripe']);
    const groups = groupCards(CARDS, owned);
    expect(groups.map((g) => g.category)).toEqual(['landmark', 'wildlife', 'company', 'hidden']);
    expect(groups[0].cards.map((c) => c.id)).toEqual(['transamerica', 'coit-tower']);
    expect(groups[0].owned).toBe(1);
    expect(groups.flatMap((g) => g.cards)).toHaveLength(CARDS.length);
    expect(completion(CARDS, owned)).toEqual({ owned: 2, total: 5, pct: 40 });
    expect(completion([], owned).pct).toBe(0);
  });

  it('[R-DEX] locked cards give a hint without revealing the name', () => {
    const defs = [act('discover-coit', 'coit-tower'), act('discover-tunnel', 'secret-tunnel', { hidden: true, neighborhood: 'Presidio' })];
    expect(hintFor(CARDS[0], defs)).toBe('Earned from "Find coit-tower" in North Beach.');
    expect(hintFor(CARDS[4], defs)).toBe('A secret somewhere in Presidio.');
    expect(hintFor(CARDS[3], defs)).toBe('Look around North Beach.');
    expect(sourceActivity(CARDS[0], defs)?.id).toBe('discover-coit');
    expect(searchCards(CARDS, new Set(), 'stripe')).toEqual([]);
    expect(searchCards(CARDS, new Set(['stripe']), 'stripe').map((c) => c.id)).toEqual(['stripe']);
    expect(searchCards(CARDS, new Set(), 'presidio').map((c) => c.id)).toEqual(['secret-tunnel']);
    expect(searchCards(CARDS, new Set(), '  ')).toHaveLength(CARDS.length);
  });

  it('[R-DEX] locked faces are mysteries and owned faces show the name', () => {
    const locked = cardFace(CARDS[0], false);
    expect(locked.classList.contains('locked')).toBe(true);
    expect(locked.textContent).toContain('???');
    expect(locked.textContent).not.toContain('coit tower');
    expect(locked.querySelector('.sr-only')?.textContent).toBe('Locked card');
    expect(locked.querySelector('b')?.getAttribute('aria-hidden')).toBe('true');
    const open = cardFace(CARDS[1], true);
    expect(open.textContent).toContain('transamerica');
    expect(open.className).toContain('rarity-legendary');
    expect(open.textContent).toContain('Legendary');
    expect(open.querySelector('.sr-only')).toBeNull();
  });

  it('[R-DEX] card art is generated per card, deterministic, and never loads an image', () => {
    const arts = new Set<string>();
    for (const category of Object.keys(CATEGORY) as CardCategory[]) {
      const a = cardArt({ id: `x-${category}`, category });
      expect(a).toBe(cardArt({ id: `x-${category}`, category }));
      expect(a).toMatch(/^<svg/);
      expect(a).not.toMatch(/<image|href=|url\(http/);
      arts.add(a);
    }
    expect(arts.size).toBe(Object.keys(CATEGORY).length);
    expect(cardArt({ id: 'a', category: 'landmark' })).not.toBe(cardArt({ id: 'b', category: 'landmark' }));
    expect(hash('golden-gate-bridge')).toBe(hash('golden-gate-bridge'));
    const r = rng(7);
    const v = [r(), r(), r()];
    expect(v.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(new Set(v).size).toBe(3);
  });
});

describe('collection book panel', () => {
  it('[R-DEX] renders tabs, a grid of locked and owned cards, search, and a detail view with lore, facts, sources and a waypoint', async () => {
    const { panel } = await import('../../src/ui/panels/dex');
    const game = fakeGame();
    let closed = 0;
    Object.assign(game, { panels: { close: () => closed++ } });
    game.save.addCard('stripe');
    const at = { lat: 37.7913, lon: -122.3937 };
    CARDS[3].at = at;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    panel.render(root, game);
    expect(root.dataset.total).toBe('5');
    expect(root.querySelector('.dex-head')?.textContent).toContain('1 of 5 cards');
    expect([...root.querySelectorAll('.dex-tab')].map((t) => t.querySelector('small')?.textContent)).toEqual(['1/5', '0/2', '0/1', '1/1', '0/1']);
    expect(root.querySelectorAll('.tcard')).toHaveLength(5);
    expect(root.querySelectorAll('.tcard.locked')).toHaveLength(4);
    const owned = root.querySelector('[data-card="stripe"]') as HTMLElement;
    expect(owned.textContent).toContain('Company · Common');

    const search = root.querySelector('.dex-search') as HTMLInputElement;
    search.value = 'presidio';
    search.dispatchEvent(new Event('input'));
    expect([...root.querySelectorAll('.tcard')].map((c) => (c as HTMLElement).dataset.card)).toEqual(['secret-tunnel']);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelector('.dex-empty')?.textContent).toBe('No cards match that search.');
    search.value = '';
    search.dispatchEvent(new Event('input'));

    (root.querySelector('[data-card="coit-tower"]') as HTMLElement).click();
    expect(root.querySelector('.dex-detail h3')?.textContent).toBe('Undiscovered card');
    expect(root.querySelector('.dex-hint')?.textContent).toBe('Look around North Beach.');
    expect(root.querySelector('.dex-lore')).toBeNull();
    (root.querySelector('.dex-back') as HTMLElement).click();

    (root.querySelector('[data-card="stripe"]') as HTMLElement).click();
    const detail = root.querySelector('.dex-detail') as HTMLElement;
    expect(detail.dataset.card).toBe('stripe');
    expect(detail.querySelector('h3')?.textContent).toBe('stripe');
    expect([...detail.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['🏢 Company', 'Common', 'North Beach']);
    expect(detail.querySelector('.dex-lore')?.textContent).toBe('Lore');
    expect(detail.querySelector('.dex-facts li')?.textContent).toBe('A fact');
    const link = detail.querySelector('.dex-sources a') as HTMLAnchorElement;
    expect(link.textContent).toBe('example.org');
    expect(link.rel).toBe('noopener noreferrer');
    (detail.querySelector('.btn.primary') as HTMLElement).click();
    expect(game.waypoint?.label).toBe('stripe');
    expect(game.waypoint?.x).toBeCloseTo(game.world.point(at).x);
    expect(closed).toBe(1);
    delete CARDS[3].at;
  });
});
