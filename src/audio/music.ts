import { mulberry32 } from './mix';
import { bass, hat, keys, kick, lead, snare, type Kit } from './synth';

export type MoodId = 'day' | 'night';

export interface Chord {
  name: string;
  root: number;
  tones: number[];
}

const c = (name: string, root: number, ...tones: number[]): Chord => ({ name, root, tones });
const Cmaj9 = c('Cmaj9', 48, 0, 4, 7, 11, 14);
const Dm9 = c('Dm9', 50, 0, 3, 7, 10, 14);
const Em7 = c('Em7', 52, 0, 3, 7, 10);
const E7 = c('E7', 52, 0, 4, 7, 10);
const Fmaj7 = c('Fmaj7', 53, 0, 4, 7, 11);
const Fmaj9 = c('Fmaj9', 53, 0, 4, 7, 11, 14);
const G9 = c('G9', 55, 0, 4, 10, 14);
const G6 = c('G6', 55, 0, 4, 7, 9);
const Am9 = c('Am9', 57, 0, 3, 7, 10, 14);
const Bbmaj7 = c('B♭maj7', 46, 0, 4, 7, 11);

export interface Mood {
  id: MoodId;
  label: string;
  bpm: number;
  progressions: Chord[][];
  cutoff: number;
  crackle: number;
}

export const MOODS: Record<MoodId, Mood> = {
  day: {
    id: 'day',
    label: 'Daylight lo-fi',
    bpm: 84,
    cutoff: 3600,
    crackle: 0.05,
    progressions: [
      [Fmaj7, Em7, Dm9, Cmaj9],
      [Dm9, G9, Cmaj9, Am9],
      [Am9, Fmaj7, Cmaj9, G6],
      [Cmaj9, Am9, Dm9, G9],
    ],
  },
  night: {
    id: 'night',
    label: 'Night drive lo-fi',
    bpm: 70,
    cutoff: 2200,
    crackle: 0.08,
    progressions: [
      [Am9, Dm9, Em7, Am9],
      [Am9, Fmaj7, Dm9, E7],
      [Dm9, Am9, Bbmaj7, Am9],
      [Fmaj9, Em7, Am9, Am9],
    ],
  },
};

export type Voice = 'keys' | 'bass' | 'lead' | 'kick' | 'snare' | 'hat';

export interface NoteEvent {
  voice: Voice;
  beat: number;
  midi: number;
  dur: number;
  vel: number;
}

export function chordAt(seed: number, mood: Mood, bar: number): Chord {
  const phrase = Math.floor(bar / 4);
  const pick = Math.floor(mulberry32(seed * 31 + phrase * 977)() * mood.progressions.length);
  return mood.progressions[pick][((bar % 4) + 4) % 4];
}

export function swing(beat: number, amount = 0.08): number {
  const frac = beat - Math.floor(beat);
  return Math.abs(frac - 0.5) < 1e-6 ? beat + amount : beat;
}

export function voicing(chord: Chord): number[] {
  return chord.tones
    .map((t) => {
      let m = chord.root + t;
      while (m < 55) m += 12;
      while (m > 74) m -= 12;
      return m;
    })
    .sort((a, b) => a - b);
}

const KEY_RHYTHMS = [[0, 2.5], [0, 1.5, 3], [0.5, 2], [0], [0, 2, 3.5]];

export function composeBar(seed: number, bar: number, mood: Mood, energy: number): { chord: Chord; events: NoteEvent[] } {
  const rng = mulberry32(seed * 7919 + bar * 104729);
  const chord = chordAt(seed, mood, bar);
  const night = mood.id === 'night';
  const events: NoteEvent[] = [];
  const push = (voice: Voice, beat: number, midi: number, dur: number, vel: number) => events.push({ voice, beat: swing(beat), midi, dur, vel });

  const rhythm = KEY_RHYTHMS[Math.floor(rng() * KEY_RHYTHMS.length)];
  const notes = voicing(chord);
  rhythm.forEach((b, i) => {
    const dur = (rhythm[i + 1] ?? 4) - b;
    for (const m of notes) push('keys', b + rng() * 0.02, m, dur, 0.5 + rng() * 0.2);
  });

  const root = chord.root >= 50 ? chord.root - 12 : chord.root;
  push('bass', 0, root, 1.6, 0.9);
  if (rng() < 0.75) push('bass', rng() < 0.5 ? 2.5 : 3, rng() < 0.6 ? root + 7 : root, 1, 0.75);
  if (energy > 0.5) push('bass', 3.5, root + 12, 0.4, 0.6);

  push('kick', 0, 0, 0.3, 1);
  if (!night || rng() < 0.5) push('kick', 2.5, 0, 0.3, 0.8);
  if (energy > 0.5) push('kick', 1.5, 0, 0.3, 0.6);
  push('snare', 1, 0, 0.2, night ? 0.6 : 0.85);
  push('snare', 3, 0, 0.2, night ? 0.6 : 0.85);
  const hatStep = night && energy < 0.5 ? 1 : energy > 0.5 ? 0.25 : 0.5;
  for (let b = 0; b < 4; b += hatStep) push('hat', b, 0, 0.05, (b % 1 === 0 ? 0.55 : 0.35) * (0.7 + rng() * 0.6));

  const scale = [0, 2, 4, 7, 9].flatMap((p) => [60 + p, 72 + p]).filter((m) => m >= 64 && m <= 81);
  const density = 0.12 + 0.2 * energy;
  let last = -1;
  for (let b = 0; b < 4; b += 0.5) {
    if (b - last < 1 || rng() > density) continue;
    const tones = rng() < 0.6 ? notes.map((n) => n + 12).filter((n) => n <= 81) : scale;
    push('lead', b, tones[Math.floor(rng() * tones.length)], 0.4 + rng() * 0.8, 0.6 + rng() * 0.4);
    last = b;
  }
  return { chord, events };
}

export class MusicPlayer {
  bar = 0;
  next = 0;
  mood: Mood = MOODS.day;
  chord: Chord = MOODS.day.progressions[0][0];
  notes = 0;

  constructor(
    private kit: Kit,
    private out: AudioNode,
    readonly seed = Math.floor(Math.random() * 1e6),
  ) {}

  update(now: number, mood: MoodId, energy: number): void {
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.5) {
      if (this.bar % 4 === 0) this.mood = MOODS[mood];
      const spb = 60 / this.mood.bpm;
      const { chord, events } = composeBar(this.seed, this.bar, this.mood, energy);
      this.chord = chord;
      for (const e of events) this.play(e, this.next + e.beat * spb, e.dur * spb);
      this.notes += events.length;
      this.next += 4 * spb;
      this.bar++;
    }
  }

  private play(e: NoteEvent, t: number, dur: number): void {
    const { kit, out } = this;
    if (e.voice === 'keys') keys(kit, out, t, e.midi, dur, e.vel);
    else if (e.voice === 'bass') bass(kit, out, t, e.midi, dur, e.vel);
    else if (e.voice === 'lead') lead(kit, out, t, e.midi, dur, e.vel);
    else if (e.voice === 'kick') kick(kit, out, t, e.vel);
    else if (e.voice === 'snare') snare(kit, out, t, e.vel, this.mood.id === 'night');
    else hat(kit, out, t, e.vel);
  }
}
