import { describe, it, expect } from 'vitest';
import { altitudeMix, busLevels, closestOnLines, droneSound, edgeFade, gate, midiHz, mulberry32, readMix, smoothstep, volumeGain } from '../../src/audio/mix';

describe('audio mix', () => {
  it('[R-AUDIO] reads volumes with defaults, clamps them and ignores junk', () => {
    expect(readMix({})).toEqual({ volMaster: 0.8, volMusic: 0.5, volSfx: 0.8, volVoice: 1, muted: false });
    const m = readMix({ volMaster: 2, volMusic: -1, volSfx: Number.NaN, volVoice: '0.3', muted: 'yes' });
    expect(m).toEqual({ volMaster: 1, volMusic: 0, volSfx: 0.8, volVoice: 1, muted: false });
    expect(readMix({ muted: true }).muted).toBe(true);
  });

  it('[R-AUDIO] maps sliders to bus gains on a perceptual curve and mutes the master only', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(0.5)).toBeCloseTo(0.25);
    expect(volumeGain(1)).toBe(1);
    const on = busLevels(readMix({ volMaster: 0.5, volMusic: 0.3, volSfx: 1 }));
    expect(on).toEqual({ master: 0.25, music: expect.closeTo(0.09), sfx: 1, ambience: 1 });
    const off = busLevels(readMix({ volMaster: 0.5, volMusic: 0.3, muted: true }));
    expect(off.master).toBe(0);
    expect(off.music).toBeCloseTo(0.09);
  });

  it('[R-AUDIO-DRONE] motor pitch, brightness and wind rise with speed', () => {
    const rest = droneSound(0, 0, 0, false);
    const cruise = droneSound(30, 0, 0, false);
    const fast = droneSound(62, 0, 0, false);
    expect(rest.wind).toBe(0);
    expect(rest.gain).toBeGreaterThan(0);
    for (const k of ['freq', 'cutoff', 'gain', 'wind', 'windFreq'] as const) {
      expect(cruise[k]).toBeGreaterThan(rest[k]);
      expect(fast[k]).toBeGreaterThan(cruise[k]);
    }
    expect(fast.chop).toBeCloseTo(fast.freq / 3);
  });

  it('[R-AUDIO-DRONE] load from acceleration and climbing strains the motor, boost adds a whine', () => {
    const calm = droneSound(20, 0, 0, false);
    expect(droneSound(20, 0, 10, false).freq).toBeGreaterThan(calm.freq);
    expect(droneSound(20, 12, 0, false).cutoff).toBeGreaterThan(calm.cutoff);
    expect(droneSound(20, -12, 0, false).cutoff).toBeGreaterThan(calm.cutoff);
    expect(calm.whine).toBe(0);
    const boost = droneSound(62, 0, 0, true);
    expect(boost.whine).toBeGreaterThan(0.05);
    expect(boost.whineFreq).toBeGreaterThan(calm.whineFreq);
    expect(droneSound(500, 500, 500, true).freq).toBeLessThan(250);
  });

  it('[R-AUDIO-DRONE] altitude shifts from city hum to open wind, water laps near the bay', () => {
    expect(altitudeMix(5, false)).toEqual({ hum: 1, high: 0, water: 0 });
    const high = altitudeMix(700, false);
    expect(high.hum).toBe(0);
    expect(high.high).toBe(1);
    const mid = altitudeMix(200, false);
    expect(mid.hum).toBeGreaterThan(0);
    expect(mid.hum).toBeLessThan(1);
    const bay = altitudeMix(5, true);
    expect(bay.water).toBe(1);
    expect(bay.hum).toBeLessThan(0.2);
    expect(altitudeMix(200, true).water).toBe(0);
  });

  it('[R-AUDIO-PLACES] distance gate has hysteresis and the edge fades to silence', () => {
    expect(gate(990, 1000, false)).toBe(true);
    expect(gate(1050, 1000, false)).toBe(false);
    expect(gate(1050, 1000, true)).toBe(true);
    expect(gate(1200, 1000, true)).toBe(false);
    expect(edgeFade(0, 1000)).toBe(1);
    expect(edgeFade(700, 1000)).toBe(1);
    expect(edgeFade(1000, 1000)).toBe(0);
    expect(edgeFade(875, 1000)).toBeCloseTo(0.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
  });

  it('[R-AUDIO-PLACES] finds the closest point on polylines and single points', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 100 },
    ];
    expect(closestOnLines([line], 50, 30)).toEqual({ x: 50, z: 0, d: 30 });
    expect(closestOnLines([line], 130, 60)).toEqual({ x: 100, z: 60, d: 30 });
    expect(closestOnLines([line], -40, 0)).toEqual({ x: 0, z: 0, d: 40 });
    expect(closestOnLines([[{ x: 5, z: 5 }]], 8, 9).d).toBe(5);
    expect(closestOnLines([], 0, 0).d).toBe(Infinity);
  });

  it('[R-AUDIO-MUSIC] seeded random and note frequencies are stable', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seq = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seq);
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(midiHz(69)).toBe(440);
    expect(midiHz(81)).toBe(880);
  });
});
