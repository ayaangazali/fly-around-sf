const SF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

export function sfClock(date: Date): { hour: number; minute: number } {
  let hour = 0;
  let minute = 0;
  for (const p of SF.formatToParts(date)) {
    if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
  }
  return { hour, minute };
}

export function hourLabel(hour: number): string {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

const HOUR = 3_600_000;

export function crossedHour(prevMs: number, nowMs: number): number | null {
  if (nowMs <= prevMs || nowMs - prevMs > 60_000) return null;
  const h = Math.floor(nowMs / HOUR) * HOUR;
  return h > prevMs ? h : null;
}

export interface Strike {
  t: number;
  midi: number;
  vel: number;
  decay: number;
}

function tune(phrases: number[][], beat: number, rest: number, vel: number, decay: number): { strikes: Strike[]; end: number } {
  const strikes: Strike[] = [];
  let t = 0;
  for (const phrase of phrases) {
    phrase.forEach((midi, i) => strikes.push({ t: t + i * beat, midi, vel: i === phrase.length - 1 ? vel : vel * 0.85, decay }));
    t += phrase.length * beat + rest;
  }
  return { strikes, end: t };
}

const C4 = 60;
const D4 = 62;
const E4 = 64;
const G3 = 55;
const GRACE_CHIMES = [
  [C4, D4, E4, C4],
  [G3, D4, E4, C4],
  [D4, E4, C4, G3],
  [E4, D4, E4, C4],
];

export function graceRings(hour: number): boolean {
  return hour >= 9 && hour <= 18;
}

export function graceHour(hour: number): Strike[] {
  if (!graceRings(hour)) return [];
  const { strikes, end } = tune(GRACE_CHIMES, 0.9, 1.6, 0.8, 4);
  const count = hour % 12 || 12;
  let t = end + 2;
  for (let i = 0; i < count; i++, t += 3.2) strikes.push({ t, midi: G3, vel: 1, decay: 14 });
  if (hour === 12 || hour === 18) {
    t += 6;
    for (let g = 0; g < 3; g++, t += 4) for (let i = 0; i < 3; i++) strikes.push({ t: t + i * 0.9, midi: C4, vel: 0.9, decay: 4 });
    for (let i = 0; i < 12; i++, t += 1.8) strikes.push({ t, midi: C4, vel: 0.85, decay: 4 });
  }
  return strikes;
}

export interface HornPattern {
  cycle: number;
  phase: number;
  blasts: { at: number; dur: number; freq: number }[];
}

export const GGB_SOUTH_TOWER: HornPattern = { cycle: 20, phase: 0, blasts: [{ at: 0, dur: 2, freq: 147 }] };
export const GGB_MIDSPAN: HornPattern = {
  cycle: 40,
  phase: 9,
  blasts: [
    { at: 0, dur: 1, freq: 233 },
    { at: 3, dur: 1, freq: 262 },
  ],
};
export const ALCATRAZ_HORN: HornPattern = {
  cycle: 30,
  phase: 17,
  blasts: [
    { at: 0, dur: 2, freq: 196 },
    { at: 4, dur: 2, freq: 196 },
  ],
};

export function blastsBetween(p: HornPattern, from: number, to: number): { t: number; dur: number; freq: number }[] {
  const out: { t: number; dur: number; freq: number }[] = [];
  const first = Math.floor((from - p.phase) / p.cycle);
  for (let k = first; p.phase + k * p.cycle < to; k++) {
    for (const b of p.blasts) {
      const t = p.phase + k * p.cycle + b.at;
      if (t >= from && t < to) out.push({ t, dur: b.dur, freq: b.freq });
    }
  }
  return out;
}
