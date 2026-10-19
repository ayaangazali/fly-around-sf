import { describe, it, expect } from 'vitest';
import { emptySave, type SaveData } from '../../src/core/save';
import { mergeSaves, DeviceSync } from '../../src/net/sync';
import { netGame, until } from './net-helpers';

function save(patch: Partial<SaveData>): SaveData {
  return { ...emptySave(), ...patch };
}

describe('device sync', () => {
  it('[R-SYNC-DEVICES] merging unions completions and cards, keeps max XP and min best times', () => {
    const local = save({
      completed: { a: 300, b: 50 },
      cards: ['x'],
      best: { a: 40, c: 12 },
      xp: 100,
      flags: { tutorial: true, theme: 'local' },
      settings: { units: 'imperial' },
      stats: { distance: 10, flightTime: 500, crashes: 2, sessions: 3 },
    });
    const incoming = save({
      completed: { a: 100, d: 70 },
      cards: ['x', 'y', 'z'],
      best: { a: 35, c: 20, e: Number.NaN },
      xp: 450,
      flags: { theme: 'remote', daily: 4 },
      settings: { units: 'metric' },
      stats: { distance: 99, flightTime: 20, crashes: 9, sessions: 1 },
    });
    const r = mergeSaves(local, incoming);
    expect(r.added).toBe(1);
    expect(r.cards).toBe(2);
    expect(r.save.completed).toEqual({ a: 100, b: 50, d: 70 });
    expect(r.save.cards).toEqual(['x', 'y', 'z']);
    expect(r.save.best).toEqual({ a: 35, c: 12 });
    expect(r.save.xp).toBe(450);
    expect(r.save.flags).toEqual({ tutorial: true, theme: 'local', daily: 4 });
    expect(r.save.settings).toEqual({ units: 'imperial' });
    expect(r.save.stats).toEqual({ distance: 99, flightTime: 500, crashes: 9, sessions: 3 });
    expect(mergeSaves(r.save, incoming).added).toBe(0);
    expect(mergeSaves(local, { v: 2 } as unknown as SaveData).save.completed).toEqual(local.completed);
  });

  it('[R-SYNC-DEVICES] a code moves progress from one device to another, which merges it', async () => {
    const ga = await netGame();
    const gb = await netGame();
    ga.save.replace(save({ completed: { 'discover-coit-tower': 1 }, cards: ['coit-tower'], xp: 300 }));
    gb.save.replace(save({ completed: { 'discover-ferry-building': 2 }, xp: 50 }));
    const a = new DeviceSync(ga, 'local');
    const b = new DeviceSync(gb, 'local');
    const phases: string[] = [];
    b.subscribe(() => phases.push(b.phase));
    const code = await a.offer();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(a.phase).toBe('waiting');
    expect(await b.receive(code.toLowerCase())).toBe(true);
    await until(() => b.phase === 'merged' && a.phase === 'sent');
    expect(Object.keys(gb.save.data.completed).sort()).toEqual(['discover-coit-tower', 'discover-ferry-building']);
    expect(gb.save.data.cards).toEqual(['coit-tower']);
    expect(gb.save.data.xp).toBe(300);
    expect(b.result).toEqual({ added: 1, cards: 1 });
    expect(a.result?.added).toBe(1);
    expect(phases).toEqual(['receiving', 'merged']);
    expect(gb.toasts.at(-1)).toBe('Progress merged: 1 new activity, 1 new card');
    expect(ga.toasts.at(-1)).toBe('Progress delivered to your other device');
    a.stop();
    b.stop();
    expect(a.phase).toBe('idle');
    expect(a.code).toBeNull();
  });

  it('[R-SYNC-DEVICES] bad codes and oversized saves fail clearly', async () => {
    const g = await netGame();
    const s = new DeviceSync(g, 'local');
    expect(await s.receive('no')).toBe(false);
    expect(s.phase).toBe('bad-code');
    g.save.data.cards = Array.from({ length: 20000 }, (_, i) => `card-${i}-${'x'.repeat(10)}`);
    await s.offer();
    expect(s.phase).toBe('failed');
    s.stop();
  });

  it('[R-SYNC-DEVICES] a corrupt save payload is ignored without touching local progress', async () => {
    const g = await netGame();
    g.save.replace(save({ completed: { keep: 1 }, xp: 7 }));
    const s = new DeviceSync(g, 'local');
    await s.receive('ABCDEF');
    const ch = new BroadcastChannel('fly-around-sf:sync-ABCDEF');
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'evil', d: { t: 'save', code: 'bm90LWpzb24' } }));
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'evil', d: { t: 'save', code: 'eyJ2IjoyfQ' } }));
    await new Promise((r) => setTimeout(r, 80));
    expect(s.phase).toBe('merged');
    expect(g.save.data.completed).toEqual({ keep: 1 });
    expect(g.save.data.xp).toBe(7);
    ch.close();
    s.stop();
  });
});
