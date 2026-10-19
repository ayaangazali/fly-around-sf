import { describe, it, expect } from 'vitest';
import { MOODS, MusicPlayer, chordAt, composeBar, swing, voicing } from '../../src/audio/music';
import type { Kit } from '../../src/audio/synth';
import { fakeKit } from './audio-fake';

describe('generative music', () => {
  it('[R-AUDIO-MUSIC] the same seed composes the same bar, other seeds differ', () => {
    const a = composeBar(7, 12, MOODS.day, 0);
    expect(composeBar(7, 12, MOODS.day, 0)).toEqual(a);
    const others = [8, 9, 10, 11].map((s) => JSON.stringify(composeBar(s, 12, MOODS.day, 0).events));
    expect(others.some((o) => o !== JSON.stringify(a.events))).toBe(true);
  });

  it('[R-AUDIO-MUSIC] chords come from the mood progression and hold for four-bar phrases', () => {
    for (const mood of Object.values(MOODS)) {
      const all = new Set(mood.progressions.flat());
      for (let bar = 0; bar < 64; bar++) expect(all.has(chordAt(3, mood, bar))).toBe(true);
      const phrase = [0, 1, 2, 3].map((b) => chordAt(3, mood, 40 + b));
      expect(mood.progressions.some((p) => p.every((c, i) => c === phrase[i]))).toBe(true);
    }
  });

  it('[R-AUDIO-MUSIC] night is slower and darker than day', () => {
    expect(MOODS.night.bpm).toBeLessThan(MOODS.day.bpm);
    expect(MOODS.night.cutoff).toBeLessThan(MOODS.day.cutoff);
    expect(MOODS.night.label).not.toEqual(MOODS.day.label);
  });

  it('[R-AUDIO-MUSIC] energy from an activity lifts the groove with more drums and bass', () => {
    let calm = 0;
    let lifted = 0;
    for (let bar = 0; bar < 32; bar++) {
      calm += composeBar(5, bar, MOODS.day, 0).events.filter((e) => e.voice !== 'keys').length;
      lifted += composeBar(5, bar, MOODS.day, 1).events.filter((e) => e.voice !== 'keys').length;
    }
    expect(lifted).toBeGreaterThan(calm * 1.4);
  });

  it('[R-AUDIO-MUSIC] every note sits in range and inside its bar', () => {
    for (const mood of Object.values(MOODS))
      for (let bar = 0; bar < 32; bar++) {
        const { chord, events } = composeBar(11, bar, mood, bar % 2);
        expect(events.some((e) => e.voice === 'kick' && e.beat === 0)).toBe(true);
        for (const e of events) {
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(4.2);
          expect(e.dur).toBeGreaterThan(0);
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          if (e.voice === 'lead') expect(e.midi).toBeLessThanOrEqual(81);
          if (e.voice === 'bass') expect(e.midi).toBeLessThan(chord.root + 13);
        }
      }
  });

  it('[R-AUDIO-MUSIC] chord voicings stay in the keys register and offbeats swing', () => {
    for (const c of MOODS.day.progressions.flat()) {
      const v = voicing(c);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(55);
      expect(Math.max(...v)).toBeLessThanOrEqual(74);
      expect([...v].sort((a, b) => a - b)).toEqual(v);
    }
    expect(swing(1)).toBe(1);
    expect(swing(1.5)).toBeCloseTo(1.58);
    expect(swing(2.25)).toBe(2.25);
  });

  it('[R-AUDIO-MUSIC] the player schedules half a second ahead and switches mood on phrase boundaries', () => {
    const { kit, ctx } = fakeKit();
    const out = ctx.createGain();
    const player = new MusicPlayer(kit as unknown as Kit, out as unknown as AudioNode, 1);
    player.update(0, 'day', 0);
    expect(player.bar).toBe(1);
    expect(player.notes).toBeGreaterThan(5);
    const created = ctx.created;
    player.update(0.1, 'night', 0);
    expect(ctx.created).toBe(created);
    for (let t = 0; t < 30; t += 0.25) player.update(t, 'night', 1);
    expect(player.mood.id).toBe('night');
    expect(player.next).toBeGreaterThan(29.9);
    expect(player.next).toBeLessThan(30.5 + (4 * 60) / MOODS.night.bpm);
    player.update(100, 'day', 0);
    expect(player.next).toBeGreaterThan(100);
  });
});
