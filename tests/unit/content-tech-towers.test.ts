import { describe, expect, it } from 'vitest';
import snapshot from '../../src/content/github-snapshot.json';
import { loadCards } from '../../src/content/types';
import { toLocal } from '../../src/core/geo';
import { TIERS, fireflyCount, layoutTowers, towerHeight, towerTier, towerWidth, type TowerStat } from '../../src/systems/commit-towers';

const cards = loadCards();

describe('commit towers', () => {
  it('[R-COMMIT-TOWERS] the baked snapshot covers located tech cards with sane GitHub numbers', () => {
    expect(Number.isNaN(Date.parse(snapshot.generatedAt))).toBe(false);
    expect(snapshot.sinceDays).toBe(30);
    expect(snapshot.towers.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(snapshot.towers.map((t) => t.card));
    expect(ids.size).toBe(snapshot.towers.length);
    for (const t of snapshot.towers) {
      expect(cards.find((c) => c.id === t.card)?.at, t.card).toBeDefined();
      expect(t.orgs.length).toBeGreaterThan(0);
      for (const n of [t.publicRepos, t.stars, t.commits30d, t.topStars]) expect(Number.isInteger(n) && n >= 0, t.card).toBe(true);
      expect(t.topStars).toBeLessThanOrEqual(t.stars);
    }
  });

  it('[R-COMMIT-TOWERS] height grows by a fixed step for every 10x more commits', () => {
    expect(towerHeight(0)).toBe(40);
    const step = towerHeight(99) - towerHeight(9);
    expect(step).toBeCloseTo(46);
    expect(towerHeight(999) - towerHeight(99)).toBeCloseTo(step);
    expect(towerWidth(0)).toBe(8);
    expect(towerWidth(999)).toBeCloseTo(8 + 3.2 * 3);
    expect(fireflyCount(0)).toBe(0);
    expect(fireflyCount(10000)).toBeGreaterThan(fireflyCount(100));
  });

  it('[R-COMMIT-TOWERS] activity tiers run quiet, steady, busy, blazing', () => {
    expect([0, 49, 50, 499, 500, 2999, 3000, 1e6].map(towerTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(TIERS.map((t) => t.label)).toEqual(['quiet', 'steady', 'busy', 'blazing']);
  });

  it('[R-COMMIT-TOWERS] towers stand on their HQ, and companies sharing a building stand side by side', () => {
    const towers = layoutTowers(snapshot.towers, cards, toLocal);
    expect(towers).toHaveLength(snapshot.towers.length);
    const by = (id: string) => towers.find((t) => t.card === id)!;
    for (const [a, b] of [['reddit', 'doordash'], ['zynga', 'scale-ai'], ['slack', 'anthropic']]) {
      expect(by(a).z).toBeCloseTo(by(b).z);
      expect(Math.abs(by(a).x - by(b).x)).toBeGreaterThan((by(a).width + by(b).width) / 2);
    }
    const gh = by('github');
    const at = cards.find((c) => c.id === 'github')!.at!;
    expect(Math.hypot(gh.x - toLocal(at.lat, at.lon).x, gh.z - toLocal(at.lat, at.lon).z)).toBeLessThan(1);
    expect(gh.height).toBeCloseTo(towerHeight(gh.commits30d));
    const lost: TowerStat = { ...snapshot.towers[0], card: 'no-such-card' };
    expect(layoutTowers([lost], cards, toLocal)).toEqual([]);
  });
});
