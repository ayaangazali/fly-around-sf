import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOUNDS } from '../../src/core/geo';
import type { CardDef } from '../../src/content/types';
import type { ActivityDef } from '../../src/activities/types';
import { ROOT, loadDefs, walk } from './helpers';

const CATEGORIES = ['landmark', 'company', 'food', 'wildlife', 'park', 'history', 'culture', 'hidden', 'event', 'tech', 'transit'];
const PLACE_CATEGORIES = ['landmark', 'park', 'food', 'wildlife', 'history', 'culture', 'hidden', 'transit'];
const cardFiles = walk(join(ROOT, 'src/content/cards'), '.json');
const cards = cardFiles.flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as CardDef[]).map((c) => ({ ...c, file: basename(f) })));
const places = cards.filter((c) => c.file.startsWith('places-'));
const defs = loadDefs();
const placeDefs = walk(join(ROOT, 'src/content/activities'), '.json')
  .filter((f) => basename(f).startsWith('places-'))
  .flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as ActivityDef[]);
const neighborhoods = JSON.parse(readFileSync(join(ROOT, 'src/content/neighborhoods.json'), 'utf8')) as { id: string; name: string; at: { lat: number; lon: number }; blurb: string }[];
const DASHES = /[–—]/;

function inBounds(p: { lat: number; lon: number }): boolean {
  return p.lat >= BOUNDS.south && p.lat <= BOUNDS.north && p.lon >= BOUNDS.west && p.lon <= BOUNDS.east;
}

describe('cards', () => {
  it('[R-CARDS] every card in every card file is complete, sourced and free of em dashes', () => {
    expect(cardFiles.length).toBeGreaterThan(0);
    for (const c of cards) {
      const where = `${c.file}:${c.id}`;
      expect(c.id, where).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.name.length, where).toBeGreaterThan(2);
      expect(CATEGORIES, where).toContain(c.category);
      expect(['common', 'rare', 'legendary'], where).toContain(c.rarity);
      expect(c.neighborhood.length, where).toBeGreaterThan(2);
      expect(c.blurb.length, where).toBeGreaterThan(10);
      expect(c.blurb.length, where).toBeLessThanOrEqual(140);
      expect(c.lore.length, where).toBeGreaterThanOrEqual(250);
      expect(c.lore.length, where).toBeLessThanOrEqual(600);
      expect(c.facts.length, where).toBeGreaterThanOrEqual(3);
      expect(c.facts.length, where).toBeLessThanOrEqual(5);
      for (const f of c.facts) expect(f.length, where).toBeGreaterThan(10);
      expect(c.sources.length, where).toBeGreaterThan(0);
      for (const s of c.sources) {
        expect(s, where).toMatch(/^https:\/\/\S+$/);
        expect(() => new URL(s), where).not.toThrow();
      }
      if (c.at) expect(inBounds(c.at), where).toBe(true);
      if (c.year !== undefined) {
        expect(Number.isInteger(c.year), where).toBe(true);
        expect(c.year, where).toBeGreaterThan(1700);
        expect(c.year, where).toBeLessThanOrEqual(new Date().getFullYear());
      }
      expect(DASHES.test([c.name, c.blurb, c.lore, ...c.facts].join(' ')), where).toBe(false);
    }
  });

  it('[R-CARDS] card ids are unique across all card files', () => {
    const seen = new Map<string, string>();
    for (const c of cards) {
      expect(seen.get(c.id), `${c.id} in ${c.file} and ${seen.get(c.id)}`).toBeUndefined();
      seen.set(c.id, c.file);
    }
  });

  it('[R-CARDS] every card referenced by any activity exists', () => {
    const ids = new Set(cards.map((c) => c.id));
    const missing = defs.filter((d) => d.card && !ids.has(d.card)).map((d) => `${d.id} -> ${d.card}`);
    expect(missing).toEqual([]);
  });
});

describe('place cards', () => {
  const names = new Set(neighborhoods.map((n) => n.name));

  it('[R-PLACES] at least 130 place cards span all eight place categories', () => {
    expect(places.length).toBeGreaterThanOrEqual(130);
    for (const cat of PLACE_CATEGORIES) expect(places.filter((c) => c.category === cat).length, cat).toBeGreaterThanOrEqual(8);
    for (const c of places) expect(PLACE_CATEGORIES, c.id).toContain(c.category);
  });

  it('[R-PLACES] every place has a location in one of the 41 DataSF neighborhoods', () => {
    expect(neighborhoods.length).toBe(41);
    expect(new Set(neighborhoods.map((n) => n.id)).size).toBe(41);
    for (const n of neighborhoods) {
      expect(inBounds(n.at), n.name).toBe(true);
      expect(n.blurb.length, n.name).toBeGreaterThan(20);
      expect(DASHES.test(n.blurb), n.name).toBe(false);
    }
    for (const c of places) {
      expect(c.at, c.id).toBeDefined();
      expect(names.has(c.neighborhood), `${c.id}: ${c.neighborhood}`).toBe(true);
    }
  });

  it('[R-PLACES] every place card is unlocked by a discovery at the same spot, hidden spots stay hidden', () => {
    for (const c of places) {
      const d = defs.find((a) => a.kind === 'discover' && a.card === c.id);
      expect(d, c.id).toBeDefined();
      expect(d!.id).toBe(`discover-${c.id}`);
      const km = Math.hypot((d!.at.lat - c.at!.lat) * 111, (d!.at.lon - c.at!.lon) * 88);
      expect(km, c.id).toBeLessThan(0.05);
      if (c.category === 'hidden') expect(d!.hidden, c.id).toBe(true);
    }
  });

  it('[R-PLACES] place activities stay in their own neighborhoods and free of em dashes', () => {
    for (const d of placeDefs) {
      expect(names.has(d.neighborhood), `${d.id}: ${d.neighborhood}`).toBe(true);
      expect(DASHES.test(JSON.stringify(d)), d.id).toBe(false);
    }
  });

  it('[R-TRIVIA] at least 70 trivia questions, each drawn from a located card with a fair answer', () => {
    const trivia = placeDefs.filter((d) => d.kind === 'trivia');
    expect(trivia.length).toBeGreaterThanOrEqual(70);
    const counts = [0, 0, 0, 0];
    for (const t of trivia) {
      const c = cards.find((x) => x.id === t.card);
      expect(c?.at, t.id).toBeDefined();
      expect(t.id).toBe(`trivia-${t.card}`);
      expect(t.requires).toEqual([`discover-${t.card}`]);
      counts[(t.params as { answer: number }).answer]++;
    }
    for (const n of counts) expect(n).toBeGreaterThan(trivia.length / 8);
  });

  it('[R-TOUR] at least 14 tours, each starting at its first stop', () => {
    const tours = placeDefs.filter((d) => d.kind === 'tour');
    expect(tours.length).toBeGreaterThanOrEqual(14);
    expect(new Set(tours.map((t) => t.neighborhood)).size).toBeGreaterThanOrEqual(10);
    for (const t of tours) {
      const first = (t.params as { stops: { lat: number; lon: number }[] }).stops[0];
      expect([t.at.lat, t.at.lon], t.id).toEqual([first.lat, first.lon]);
    }
  });
});
