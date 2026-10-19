import { describe, expect, it } from 'vitest';
import { SaveStore, encodeSave, decodeSave, emptySave, normalize } from '../../src/core/save';
import { memoryStorage } from './helpers';

describe('save', () => {
  it('[R-SAVE] round-trips through a share code including unicode', () => {
    const s = emptySave();
    s.completed['a'] = 1;
    s.cards.push('café-☕');
    s.xp = 42;
    expect(decodeSave(encodeSave(s))).toEqual(s);
    expect(encodeSave(s)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('[R-SAVE] normalizes garbage and wrong versions to an empty save', () => {
    expect(normalize(null)).toEqual(emptySave());
    expect(normalize({ v: 2 })).toEqual(emptySave());
    const n = normalize({ v: 1, cards: ['x', 'x', 3], xp: 'lots' });
    expect(n.cards).toEqual(['x']);
    expect(n.xp).toBe(0);
    expect(() => decodeSave('!!!')).toThrow();
  });

  it('[R-SAVE] completes once, keeps best times, dedupes cards, persists', () => {
    const storage = memoryStorage();
    const s = new SaveStore(storage);
    let changes = 0;
    const off = s.onChange(() => changes++);
    expect(s.complete('x', 10)).toBe(true);
    expect(s.complete('x', 10)).toBe(false);
    expect(s.data.xp).toBe(10);
    expect(s.recordBest('t', 30)).toBe(true);
    expect(s.recordBest('t', 31)).toBe(false);
    expect(s.recordBest('t', 29)).toBe(true);
    expect(s.addCard('c')).toBe(true);
    expect(s.addCard('c')).toBe(false);
    off();
    expect(changes).toBe(4);
    expect(new SaveStore(storage).data.best.t).toBe(29);
    s.replace(emptySave());
    expect(new SaveStore(storage).data.xp).toBe(0);
  });

  it('[R-SAVE] survives broken storage', () => {
    const s = new SaveStore({ getItem: () => '{not json', setItem: () => { throw new Error('quota'); } });
    expect(s.data).toEqual(emptySave());
    expect(() => s.complete('a')).not.toThrow();
    expect(new SaveStore(null).data.v).toBe(1);
  });
});
