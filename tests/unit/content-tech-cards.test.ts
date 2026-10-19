import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOUNDS, toLocal } from '../../src/core/geo';
import { CityData } from '../../src/world/city-data';
import { Terrain } from '../../src/world/terrain';
import { loadCards } from '../../src/content/types';
import { ROOT, loadDefs, walk } from './helpers';
import type { CardDef } from '../../src/content/types';

const techCards = walk(join(ROOT, 'src/content/cards'), '.json')
  .filter((f) => /[/\\]tech-[^/\\]+\.json$/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as CardDef[]);
const defs = loadDefs();

describe('tech cards', () => {
  it('[R-TECH-CARDS] at least 50 cards with a founding year, origin lore, facts and https sources', () => {
    expect(techCards.length).toBeGreaterThanOrEqual(50);
    for (const c of techCards) {
      expect(c.id, c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(['company', 'tech']).toContain(c.category);
      expect(['common', 'rare', 'legendary']).toContain(c.rarity);
      expect(Number.isInteger(c.year) && c.year! >= 1800 && c.year! <= 2026, c.id).toBe(true);
      expect(c.blurb.length, c.id).toBeGreaterThan(20);
      expect(c.lore.length, c.id).toBeGreaterThan(120);
      expect(c.facts.length, c.id).toBeGreaterThan(0);
      expect(c.sources.length, c.id).toBeGreaterThan(0);
      for (const s of c.sources) expect(() => new URL(s), s).not.toThrow();
      expect(c.sources.every((s) => s.startsWith('https://')), c.id).toBe(true);
      expect(JSON.stringify(c), c.id).not.toMatch(/[–—]/);
    }
    expect(techCards.filter((c) => c.rarity === 'legendary').length).toBeGreaterThanOrEqual(8);
  });

  it('[R-TECH-CARDS] card ids are unique across every card file and the import glob sees them all', () => {
    const all = loadCards();
    const ids = all.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of techCards) expect(ids).toContain(c.id);
  });

  it('[R-TECH-CARDS] every located card is inside SF and has a passive discovery that awards it', () => {
    for (const c of techCards.filter((x) => x.at)) {
      expect(c.at!.lat).toBeGreaterThan(BOUNDS.south);
      expect(c.at!.lat).toBeLessThan(BOUNDS.north);
      expect(c.at!.lon).toBeGreaterThan(BOUNDS.west);
      expect(c.at!.lon).toBeLessThan(BOUNDS.east);
      const d = defs.find((x) => x.id === `discover-${c.id}`);
      expect(d?.kind, c.id).toBe('discover');
      expect(d?.card).toBe(c.id);
      expect(Math.hypot(d!.at.lat - c.at!.lat, d!.at.lon - c.at!.lon)).toBeLessThan(1e-9);
    }
    const cardIds = new Set(loadCards().map((c) => c.id));
    for (const d of defs.filter((x) => x.card)) expect(cardIds.has(d.card!), d.id).toBe(true);
  });
});

describe('tech venues on real roofs', () => {
  const tb = readFileSync(join(ROOT, 'public/data/terrain.bin'));
  const terrain = Terrain.parse(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength) as ArrayBuffer);
  const cb = readFileSync(join(ROOT, 'public/data/city.bin'));
  const city = new CityData(cb.buffer.slice(cb.byteOffset, cb.byteOffset + cb.byteLength) as ArrayBuffer, (x, z) => terrain.heightAt(x, z));
  const meetups = defs.filter((d) => d.kind === 'pitch' || d.kind === 'hack');

  it('[R-TECH-VENUES] every pitch pad and hack venue center is on a building rooftop', () => {
    expect(meetups.length).toBeGreaterThanOrEqual(28);
    for (const d of meetups) {
      const { x, z } = toLocal(d.at.lat, d.at.lon);
      const roof = city.roofAt(x, z);
      expect(roof, d.id).toBeGreaterThan(Math.max(0, terrain.heightAt(x, z)) + 3);
    }
  });

  it('[R-TECH-VENUES] tech meetups are far enough apart that each start prompt is unambiguous', () => {
    const startable = defs.filter((d) => d.kind !== 'discover');
    for (const d of meetups) {
      const a = toLocal(d.at.lat, d.at.lon);
      for (const o of startable) {
        if (o.id === d.id) continue;
        const b = toLocal(o.at.lat, o.at.lon);
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${d.id} vs ${o.id}`).toBeGreaterThan(40);
      }
    }
  });
});
