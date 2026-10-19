import { toLocal } from '../core/geo';
import type { ActivityDef, GeoPoint } from '../activities/types';
import type { CardDef } from '../content/types';

export interface LoreEntry {
  id: string;
  name: string;
  category: string;
  neighborhood: string;
  blurb: string;
  lore: string;
  facts: string[];
  sources: string[];
  card: string | null;
  at: GeoPoint | null;
}

export interface Match {
  entry: LoreEntry;
  score: number;
  dist: number | null;
}

export interface Answer {
  entry: LoreEntry | null;
  quote: string;
  lead: string;
  related: LoreEntry[];
}

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

const STOP = new Set(
  'a an and are as at be been by can could did do does for from had has have how i if in into is it its me my of on or our tell than that the their them then there these they this those to was we were what when where which who whom whose why will with would you your about any some much many more most also just please know show give find there here near nearby around thing place called name me sf san francisco city'.split(' '),
);
const DEICTIC = /\b(this|that|here|near|nearby|around|below|under|close)\b/;
const MIN_SCORE = 1.2;

export function tokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

export function entriesFrom(cards: CardDef[], places: ActivityDef[]): LoreEntry[] {
  const out: LoreEntry[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    neighborhood: c.neighborhood,
    blurb: c.blurb,
    lore: c.lore,
    facts: c.facts ?? [],
    sources: c.sources ?? [],
    card: c.id,
    at: c.at ?? null,
  }));
  const seen = new Set(out.flatMap((e) => [e.id, e.name.toLowerCase()]));
  for (const d of places) {
    const slug = d.id.replace(/^discover-/, '');
    if (d.hidden || seen.has(slug) || seen.has(d.title.toLowerCase()) || (d.card && seen.has(d.card))) continue;
    seen.add(slug);
    out.push({ id: d.id, name: d.title, category: 'place', neighborhood: d.neighborhood, blurb: d.blurb, lore: '', facts: [], sources: [], card: null, at: d.at });
  }
  return out;
}

function distance(e: LoreEntry, pos: { x: number; z: number } | null): number | null {
  if (!e.at || !pos) return null;
  const p = toLocal(e.at.lat, e.at.lon);
  return Math.hypot(p.x - pos.x, p.z - pos.z);
}

export function search(question: string, entries: LoreEntry[], pos: { x: number; z: number } | null = null): Match[] {
  const q = [...new Set(tokens(question))];
  const deictic = DEICTIC.test(question.toLowerCase());
  const docs = entries.map((e) => ({
    e,
    name: new Set(tokens(e.name)),
    meta: new Set(tokens(`${e.neighborhood} ${e.category}`)),
    body: tokens(`${e.blurb} ${e.lore} ${e.facts.join(' ')}`),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.name, ...d.meta, ...d.body])) df.set(t, (df.get(t) ?? 0) + 1);
  const flat = ` ${tokens(question).join(' ')} `;
  const out: Match[] = [];
  for (const d of docs) {
    let score = 0;
    for (const t of q) {
      const idf = Math.log(1 + docs.length / (df.get(t) ?? docs.length));
      const hits = d.body.filter((b) => b === t).length;
      score += idf * ((d.name.has(t) ? 4 : 0) + (d.meta.has(t) ? 1.5 : 0) + (hits ? 1 + 0.25 * Math.min(hits - 1, 3) : 0));
    }
    const name = tokens(d.e.name).join(' ');
    if (name && flat.includes(` ${name} `)) score += 6;
    const dist = distance(d.e, pos);
    if (dist !== null) score += (deictic ? 6 : score > 0 ? 1 : 0) * Math.exp(-dist / (deictic ? 700 : 1500));
    if (score > 0) out.push({ entry: d.e, score, dist });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function sentences(e: LoreEntry): string[] {
  const lore = e.lore.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [];
  return [...lore, ...e.facts].map((s) => s.trim()).filter((s) => s.length > 2);
}

const HINTS: [RegExp, RegExp][] = [
  [/\b(tall|high|height|big|size|long|wide|deep)\b/, /\b\d[\d,.]*\s*(feet|foot|ft|meters?|stories|floors|miles?|acres?)\b/i],
  [/\b(when|year|old|age|built|opened|founded|started)\b/, /\b(1[5-9]|20)\d\d\b/],
  [/\bwho\b/, /\b[A-Z][a-z]+ [A-Z][a-z]+/],
  [/\bhow many\b/, /\d/],
];

export function bestQuote(e: LoreEntry, question: string): string {
  const all = sentences(e);
  if (!all.length) return e.blurb;
  const own = new Set(tokens(e.name));
  const q = tokens(question).filter((t) => !own.has(t));
  const lower = question.toLowerCase();
  const hints = HINTS.filter(([ask]) => ask.test(lower)).map(([, want]) => want);
  let best = 0;
  let top = 0;
  all.forEach((s, i) => {
    const words = tokens(s);
    const score = q.filter((t) => words.some((w) => w === t || (t.length >= 4 && w.startsWith(t)))).length + hints.filter((h) => h.test(s)).length * 1.5;
    if (score > top) [best, top] = [i, score];
  });
  const lore = sentences({ ...e, facts: [] }).length;
  return best > 0 && best < lore && /^(It|Its|This|They|Their|He|She|His|Her)\b/.test(all[best]) ? `${all[best - 1]} ${all[best]}` : all[best];
}

const LEADS = ['The Imperial archive records:', 'By order of the Emperor, the facts:', 'Hear ye, pilot:', 'From the city ledger:', 'His Majesty recalls:'];

export function leadFor(question: string): string {
  let h = 0;
  for (const c of question) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return LEADS[h % LEADS.length];
}

export function answerOffline(question: string, entries: LoreEntry[], pos: { x: number; z: number } | null = null): Answer {
  if (!entries.length) return { entry: null, lead: 'The archive is still being written.', quote: 'No cards or places are loaded yet. Fly around, discover landmarks, and ask again.', related: [] };
  const hits = search(question, entries, pos);
  const best = hits[0];
  if (!best || best.score < MIN_SCORE) {
    const near = nearest(entries, pos, 3);
    return {
      entry: null,
      lead: 'Even an Emperor has gaps in his ledger.',
      quote: `Nothing in the archive matches that yet. Try a landmark, a neighborhood or a company${near.length ? `, or ask about ${near[0].name} nearby` : ''}.`,
      related: near,
    };
  }
  const related = hits
    .slice(1)
    .filter((h) => h.score >= best.score * 0.4)
    .slice(0, 3)
    .map((h) => h.entry);
  return { entry: best.entry, lead: leadFor(question), quote: bestQuote(best.entry, question), related };
}

export function nearest(entries: LoreEntry[], pos: { x: number; z: number } | null, n: number): LoreEntry[] {
  if (!pos) return [];
  return entries
    .map((e) => ({ e, d: distance(e, pos) }))
    .filter((x): x is { e: LoreEntry; d: number } => x.d !== null)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.e);
}

export interface Sighting {
  entry: LoreEntry;
  dist: number;
  ahead: boolean;
  side: 'ahead' | 'right' | 'behind' | 'left';
}

const CONE = (35 * Math.PI) / 180;
const RANGE = 4000;

export function whatIsThat(entries: LoreEntry[], pose: Pose): Sighting | null {
  const fx = -Math.sin(pose.yaw);
  const fz = -Math.cos(pose.yaw);
  let best: Sighting | null = null;
  let bestScore = Infinity;
  let closest: Sighting | null = null;
  for (const entry of entries) {
    if (!entry.at) continue;
    const p = toLocal(entry.at.lat, entry.at.lon);
    const dx = p.x - pose.x;
    const dz = p.z - pose.z;
    const dist = Math.hypot(dx, dz);
    const fwd = dist < 1 ? 1 : (dx * fx + dz * fz) / dist;
    const right = dist < 1 ? 0 : (dx * -fz + dz * fx) / dist;
    const angle = Math.acos(Math.max(-1, Math.min(1, fwd)));
    const side = angle <= Math.PI / 4 ? 'ahead' : angle >= (3 * Math.PI) / 4 ? 'behind' : right > 0 ? 'right' : 'left';
    const s: Sighting = { entry, dist, ahead: false, side };
    if (!closest || dist < closest.dist) closest = s;
    if ((angle <= CONE || dist < 60) && dist <= RANGE) {
      const score = Math.max(dist, 40) * (1 + 3 * (angle / CONE) ** 2);
      if (score < bestScore) [best, bestScore] = [{ ...s, ahead: true }, score];
    }
  }
  return best ?? closest;
}

export function formatDistance(m: number, imperial: boolean): string {
  if (imperial) {
    const ft = m * 3.281;
    return ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609.34).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function contextFor(entries: LoreEntry[], limit = 3): { name: string; text: string }[] {
  return entries.slice(0, limit).map((e) => ({
    name: e.name.slice(0, 120),
    text: [e.blurb, e.lore, ...e.facts].filter(Boolean).join(' ').slice(0, 1500),
  }));
}
