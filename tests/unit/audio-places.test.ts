import { describe, it, expect, vi } from 'vitest';
import { toLocal } from '../../src/core/geo';
import { SaveStore } from '../../src/core/save';
import { Ambience, PLACED, audible, spotStatus, type Conditions } from '../../src/audio/ambience';
import { AudioEngine } from '../../src/audio/engine';
import { SPOTS } from '../../src/audio/spots';
import { westminsterHour } from '../../src/audio/schedule';
import type { Kit } from '../../src/audio/synth';
import { fakeCtx, fakeKit, type FakeNode } from './audio-fake';
import { memoryStorage } from './helpers';

const DAY: Conditions = { fog: 1, night: 0, hour: 12 };
const spot = (id: string) => PLACED.find((s) => s.id === id)!;
const above = (id: string, alt = 30) => {
  const p = spot(id).local[0][0];
  return { x: p.x, y: alt, z: p.z };
};

function setup() {
  const { kit, ctx } = fakeKit();
  const out = ctx.createGain();
  const amb = new Ambience(kit as unknown as Kit, out as unknown as AudioNode);
  const run = (pos: { x: number; y: number; z: number }, c: Conditions = DAY, seconds = 0.2) => {
    for (let t = 0; t < seconds; t += 0.2) {
      ctx.currentTime += 0.2;
      amb.update(pos, c, () => 0);
    }
  };
  return { amb, ctx, run };
}

describe('sound spots', () => {
  it('[R-AUDIO-PLACES] every spot is a real place inside San Francisco with sources and clean text', () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);
    expect(SPOTS.length).toBeGreaterThanOrEqual(10);
    for (const s of SPOTS) {
      const pts = s.lines ? s.lines.flat() : [s.at!];
      expect(pts.length).toBeGreaterThan(0);
      for (const [lat, lon] of pts) {
        expect(lat).toBeGreaterThan(37.7);
        expect(lat).toBeLessThan(37.84);
        expect(lon).toBeGreaterThan(-122.52);
        expect(lon).toBeLessThan(-122.35);
      }
      expect(s.sources.length).toBeGreaterThan(0);
      for (const u of s.sources) expect(u).toMatch(/^https:\/\//);
      for (const text of [s.name, s.hear, s.fact]) expect(text).not.toMatch(/—/);
      expect(s.radius).toBeGreaterThan(s.ref);
    }
  });

  it('[R-AUDIO-PLACES] the Golden Gate horns sit on the bridge and Pier 39 sea lions on the pier', () => {
    const south = toLocal(37.814333, -122.477739);
    expect(Math.hypot(spot('ggb-south-horn').local[0][0].x - south.x, spot('ggb-south-horn').local[0][0].z - south.z)).toBeLessThan(1);
    const mid = spot('ggb-midspan-horn').local[0][0];
    const s = spot('ggb-south-horn').local[0][0];
    expect(Math.hypot(mid.x - s.x, mid.z - s.z)).toBeGreaterThan(550);
    expect(Math.hypot(mid.x - s.x, mid.z - s.z)).toBeLessThan(700);
  });

  it('[R-AUDIO-PLACES] each spot plays only under its real conditions', () => {
    expect(audible('fog', DAY)).toBe(false);
    expect(audible('fog', { ...DAY, fog: 2.5 })).toBe(true);
    expect(audible('day', { ...DAY, night: 0.8 })).toBe(false);
    expect(audible('day', DAY)).toBe(true);
    expect(audible('awake', { ...DAY, hour: 6 })).toBe(false);
    expect(audible('awake', { ...DAY, hour: 7 })).toBe(true);
    expect(audible('awake', { ...DAY, hour: 23 })).toBe(false);
    expect(audible('always', { fog: 3, night: 1, hour: 3 })).toBe(true);
    expect(audible('clock', { fog: 3, night: 1, hour: 3 })).toBe(true);
  });

  it('[R-AUDIO-PLACES] status chips explain what you will hear and when', () => {
    expect(spotStatus(spot('ggb-south-horn'), DAY, 9000, false)).toBe('Waiting for thick fog');
    expect(spotStatus(spot('waterfront-gulls'), { ...DAY, night: 1 }, 10, false)).toBe('Sunrise to sunset');
    expect(spotStatus(spot('cable-car-bells'), { ...DAY, hour: 2 }, 10, false)).toBe('Quiet from 11 PM to 7 AM');
    expect(spotStatus(spot('pier-39-sea-lions'), DAY, 1234, false)).toBe('Fly closer, 1.2 km away');
    expect(spotStatus(spot('pier-39-sea-lions'), DAY, 320.4, false)).toBe('Fly closer, 320 m away');
    expect(spotStatus(spot('pier-39-sea-lions'), DAY, 20, true)).toBe('Playing now');
    expect(spotStatus(spot('ferry-building-clock'), { ...DAY, hour: 15 }, 900, true)).toBe('Next chime 4 PM, in earshot');
    expect(spotStatus(spot('ferry-building-clock'), { ...DAY, night: 1 }, 900, false)).toBe('Chimes on the hour in daylight');
    expect(spotStatus(spot('grace-cathedral-bells'), { ...DAY, hour: 20 }, 900, false)).toBe('Next ring 9 AM');
    expect(spotStatus(spot('grace-cathedral-bells'), { ...DAY, hour: 11 }, 900, true)).toBe('Next ring 12 PM, in earshot');
  });

  it('[R-AUDIO-CPU] far away the ambience builds nothing at all', () => {
    const { amb, ctx, run } = setup();
    const before = ctx.created;
    run({ x: 40000, y: 100, z: 40000 }, DAY, 2);
    expect(amb.live.size).toBe(0);
    expect(amb.nodes).toBe(0);
    expect(ctx.created).toBe(before);
  });

  it('[R-AUDIO-PLACES] flying in opens a positioned source, flying out fades and frees it', () => {
    const { amb, ctx, run } = setup();
    run(above('pier-39-sea-lions'), DAY, 1);
    const live = amb.live.get('pier-39-sea-lions');
    expect(live).toBeDefined();
    const p = spot('pier-39-sea-lions').local[0][0];
    const panner = live!.panner as unknown as FakeNode;
    expect(panner.positionX.value).toBeCloseTo(p.x);
    expect(panner.positionZ.value).toBeCloseTo(p.z);
    expect(panner.positionY.value).toBe(2);
    expect(amb.nodes).toBeGreaterThan(0);
    expect(ctx.nodes.filter((n) => n.kind === 'Oscillator').length).toBeGreaterThan(1);
    run({ x: 40000, y: 100, z: 40000 }, DAY, 0.2);
    expect(amb.live.size).toBe(0);
    expect(amb.nodes).toBeGreaterThan(0);
    run({ x: 40000, y: 100, z: 40000 }, DAY, 1.2);
    expect(amb.nodes).toBe(0);
    expect(panner.outputs.size).toBe(0);
  });

  it('[R-AUDIO-PLACES] foghorns only sound when the fog is thick', () => {
    const { amb, ctx, run } = setup();
    run(above('ggb-south-horn', 80), DAY, 1);
    expect(amb.live.has('ggb-south-horn')).toBe(false);
    run(above('ggb-south-horn', 80), { ...DAY, fog: 3 }, 0.4);
    expect(amb.live.has('ggb-south-horn')).toBe(true);
    expect(amb.live.has('ggb-midspan-horn')).toBe(true);
    const saws = () => ctx.nodes.filter((n) => n.kind === 'Oscillator' && n.type === 'sawtooth').length;
    const first = saws();
    run(above('ggb-south-horn', 80), { ...DAY, fog: 3 }, 41);
    expect(saws()).toBeGreaterThan(first + 2);
  });

  it('[R-AUDIO-PLACES] each looping bed starts once: cable slot hum, ballpark crowd, surf', () => {
    for (const id of ['cable-car-bells', 'oracle-park-crowd', 'ocean-beach-surf']) {
      const { amb, ctx, run } = setup();
      run(above(id, 10), DAY, 12);
      expect(amb.live.has(id)).toBe(true);
      const loops = ctx.nodes.filter((n) => n.kind === 'BufferSource' && n.loop);
      expect(loops.length).toBeGreaterThan(0);
      expect(amb.live.get(id)!.bed.length).toBeGreaterThan(0);
    }
  });

  it('[R-AUDIO-BELLS] chimes queue only when the tower is in earshot', () => {
    const { amb, ctx, run } = setup();
    expect(amb.ring('ferry-building-clock', westminsterHour(12))).toBe(false);
    run(above('ferry-building-clock'), DAY, 0.4);
    expect(amb.ring('ferry-building-clock', westminsterHour(12))).toBe(true);
    const queued = amb.live.get('ferry-building-clock')!.queue.length;
    expect(queued).toBe(28);
    const bells = () => ctx.nodes.filter((n) => n.kind === 'Oscillator').length;
    const start = bells();
    run(above('ferry-building-clock'), DAY, 60);
    expect(amb.live.get('ferry-building-clock')!.queue.length).toBe(0);
    expect(bells() - start).toBeGreaterThanOrEqual(28 * 6);
  });
});

describe('audio engine', () => {
  it('[R-AUDIO] builds nothing until unlocked, then applies the mix to every bus', () => {
    const save = new SaveStore(memoryStorage());
    const ctx = fakeCtx();
    const make = vi.fn(() => ctx as unknown as AudioContext);
    const engine = new AudioEngine(save, make);
    save.data.settings.volMusic = 0.2;
    save.persist();
    expect(make).not.toHaveBeenCalled();
    expect(engine.ctx).toBeNull();
    expect(engine.running).toBe(false);
    const g = engine.unlock()!;
    expect(make).toHaveBeenCalledTimes(1);
    expect(engine.unlock()).toBe(g);
    expect(make).toHaveBeenCalledTimes(1);
    expect(g.buses.master.gain.value).toBeCloseTo(0.64);
    expect(g.buses.music.gain.value).toBeCloseTo(0.04);
    expect(g.buses.sfx.gain.value).toBeCloseTo(0.64);
    save.data.settings.volSfx = 0.5;
    save.persist();
    expect(g.buses.sfx.gain.value).toBeCloseTo(0.25);
    expect(g.buses.ambience.gain.value).toBeCloseTo(0.25);
  });

  it('[R-AUDIO] mute persists in the save and survives a reload', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const save = new SaveStore(storage);
    const ctx = fakeCtx();
    const engine = new AudioEngine(save, () => ctx as unknown as AudioContext);
    const g = engine.unlock()!;
    engine.setMuted(true);
    expect(engine.muted).toBe(true);
    expect(g.buses.master.gain.value).toBe(0);
    vi.advanceTimersByTime(500);
    expect(ctx.state).toBe('suspended');
    const reloaded = new AudioEngine(new SaveStore(storage), () => fakeCtx() as unknown as AudioContext);
    expect(reloaded.muted).toBe(true);
    expect(reloaded.unlock()!.buses.master.gain.value).toBe(0);
    engine.setMuted(false);
    expect(g.buses.master.gain.value).toBeCloseTo(0.64);
    vi.useRealTimers();
  });

  it('[R-AUDIO-CPU] a hidden tab suspends the context and a visible one resumes it', async () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    const engine = new AudioEngine(new SaveStore(memoryStorage()), () => ctx as unknown as AudioContext);
    engine.unlock();
    engine.setHidden(true);
    vi.advanceTimersByTime(500);
    expect(ctx.state).toBe('suspended');
    engine.setHidden(false);
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    vi.useRealTimers();
  });

  it('[R-AUDIO] survives browsers without WebAudio and ducks the music under events', () => {
    const save = new SaveStore(memoryStorage());
    const broken = new AudioEngine(save, () => {
      throw new Error('no audio');
    });
    expect(broken.unlock()).toBeNull();
    broken.duck(0.3, 1);
    broken.apply();
    const engine = new AudioEngine(save, () => fakeCtx() as unknown as AudioContext);
    const g = engine.unlock()!;
    engine.duck(0.3, 2);
    const log = (g.duck.gain as unknown as { log: [string, number, number][] }).log;
    expect(log).toEqual([
      ['cancel', 0, 0],
      ['setTargetAtTime', 0.3, 0],
      ['setTargetAtTime', 1, 2],
    ]);
  });
});
