import { describe, it, expect } from 'vitest';
import { decodeSave, emptySave, type SaveData } from '../../src/core/save';
import { cleanSave, knownContent, mergeSaves, DeviceSync } from '../../src/net/sync';
import { netGame, until } from './net-helpers';

function save(patch: Partial<SaveData>): SaveData {
  return { ...emptySave(), ...patch };
}

function snoop(room: string): { saves: SaveData[]; post: (d: unknown) => void; close: () => void } {
  const ch = new BroadcastChannel(`fly-around-sf:${room}`);
  const saves: SaveData[] = [];
  ch.onmessage = (e) => {
    const env = JSON.parse(e.data as string);
    if (env.d?.t === 'save') saves.push(decodeSave(env.d.code));
  };
  return { saves, post: (d) => ch.postMessage(JSON.stringify({ k: 'msg', from: 'evil', d })), close: () => ch.close() };
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

  it('[R-SYNC-DEVICES] an incoming save keeps only real content and sane numbers', () => {
    const known = { activities: new Set(['a', 'b', 'c']), cards: new Set(['x']) };
    const raw = {
      ...emptySave(),
      completed: { a: 100, b: -5, c: 'soon', ghost: 7 },
      best: { a: 12.5, b: -3, c: 1e9, ghost: 2 },
      cards: ['x', 'made-up'],
      xp: 1e300,
      flags: { mpPlayed: 4.7, mpWins: -1, unlockEverything: true },
      settings: { aiProxyUrl: 'https://evil.example' },
      stats: { distance: -9, flightTime: 1e300, crashes: 'many', sessions: 3 },
    } as unknown as SaveData;
    expect(cleanSave(raw, known)).toEqual({
      ...emptySave(),
      completed: { a: 100 },
      best: { a: 12.5 },
      cards: ['x'],
      xp: 10_000_000,
      flags: { mpPlayed: 4 },
      stats: { distance: 0, flightTime: 1e9, crashes: 0, sessions: 3 },
    });
  });

  it('[R-SYNC-DEVICES] a code moves progress from one device to another, which merges it', async () => {
    const ga = await netGame();
    const gb = await netGame();
    gb.activities.defs.get('discover-coit-tower')!.card = 'coit-tower';
    expect(knownContent(gb).cards.has('coit-tower')).toBe(true);
    ga.save.replace(save({ completed: { 'discover-coit-tower': 1, ghost: 1 }, cards: ['coit-tower', 'fake-card'], xp: 300, settings: { playerName: 'Ana' } }));
    gb.save.replace(save({ completed: { 'discover-ferry-building': 2 }, xp: 50 }));
    const a = new DeviceSync(ga, 'local');
    const b = new DeviceSync(gb, 'local');
    const phases: string[] = [];
    b.subscribe(() => phases.push(b.phase));
    const code = await a.offer();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(a.phase).toBe('waiting');
    const wire = snoop(`sync-${code.slice(0, 4)}`);
    expect(await b.receive(`${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase())).toBe(true);
    await until(() => b.phase === 'merged' && a.phase === 'sent');
    expect(wire.saves).toHaveLength(1);
    expect(wire.saves[0].settings).toEqual({});
    wire.close();
    expect(gb.save.data.settings.playerName).not.toBe('Ana');
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
    expect(await s.receive('ABCDEF')).toBe(false);
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
    await s.receive('ABCDEFGH');
    const ch = new BroadcastChannel('fly-around-sf:sync-ABCD');
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'evil', d: { t: 'save', code: 'bm90LWpzb24' } }));
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'evil', d: { t: 'save', code: 'eyJ2IjoyfQ' } }));
    await new Promise((r) => setTimeout(r, 80));
    expect(s.phase).toBe('merged');
    expect(g.save.data.completed).toEqual({ keep: 1 });
    expect(g.save.data.xp).toBe(7);
    ch.close();
    s.stop();
  });

  it('[R-SYNC-DEVICES] the sender only hands its save to a peer that proves the full code, and gives up after wrong guesses', async () => {
    const g = await netGame();
    const s = new DeviceSync(g, 'local');
    const code = await s.offer();
    const wire = snoop(`sync-${code.slice(0, 4)}`);
    const wrong = code.slice(4) === 'AAAA' ? 'BBBB' : 'AAAA';
    wire.post({ t: 'ack', added: 5 });
    wire.post({ t: 'claim', key: wrong });
    wire.post({ t: 'claim', key: wrong });
    await new Promise((r) => setTimeout(r, 60));
    expect(s.phase).toBe('waiting');
    wire.post({ t: 'claim', key: wrong });
    await until(() => s.phase === 'refused');
    wire.post({ t: 'claim', key: code.slice(4) });
    await new Promise((r) => setTimeout(r, 60));
    expect(wire.saves).toEqual([]);
    expect(s.phase).toBe('refused');
    wire.close();
    s.stop();
  });
});
