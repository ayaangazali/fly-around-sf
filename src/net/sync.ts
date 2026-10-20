import { decodeSave, emptySave, encodeSave, normalize, type SaveData } from '../core/save';
import type { Game } from '../game';
import { loadCards } from '../content/types';
import { CODE_LENGTH, LIMITS, makeCode, normalizeCode, parse } from './protocol';
import { openTransport, type Transport, type TransportKind } from './transport';

export interface MergeResult {
  save: SaveData;
  added: number;
  cards: number;
}

export function mergeSaves(local: SaveData, incoming: SaveData, xpOf: (id: string) => number = () => 0): MergeResult {
  const a = normalize(local);
  const b = normalize(incoming);
  const completed = { ...a.completed };
  let added = 0;
  for (const [id, at] of Object.entries(b.completed)) {
    if (!(id in completed)) {
      completed[id] = at;
      added++;
      a.xp += xpOf(id);
    } else if (at < completed[id]) completed[id] = at;
  }
  const best = { ...a.best };
  for (const [id, t] of Object.entries(b.best)) if (Number.isFinite(t) && (!(id in best) || t < best[id])) best[id] = t;
  const cards = [...new Set([...a.cards, ...b.cards])];
  const stats = { ...a.stats };
  for (const k of Object.keys(stats) as (keyof SaveData['stats'])[]) stats[k] = Math.max(a.stats[k] ?? 0, b.stats[k] ?? 0);
  const flags = { ...b.flags, ...a.flags };
  for (const [k, v] of Object.entries(b.flags)) if (typeof v === 'number' && typeof flags[k] === 'number') flags[k] = Math.max(v, flags[k] as number);
  const daily = String(b.flags['daily:last'] ?? '') > String(a.flags['daily:last'] ?? '') ? b : a;
  for (const k of ['daily:last', 'daily:streak']) if (k in daily.flags) flags[k] = daily.flags[k];
  return {
    save: { ...a, completed, best, cards, xp: Math.max(a.xp, b.xp), flags, stats },
    added,
    cards: cards.length - a.cards.length,
  };
}

export interface Known {
  activities: Map<string, string>;
  cards: Set<string>;
}

export function knownContent(game: Game): Known {
  const defs = [...game.activities.defs.values()];
  return { activities: new Map(defs.map((d) => [d.id, d.kind])), cards: new Set([...loadCards().map((c) => c.id), ...defs.flatMap((d) => (d.card ? [d.card] : []))]) };
}

const MAX_XP = 10_000_000;
const MAX_STAT = 1e9;
const MAX_BEST = 86_400;
const COUNTERS = ['mpPlayed', 'mpWins', 'daily:streak', 'daily:count'];
const MAX_SHARE = 300;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const positive = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
const clamp = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);

export function cleanSave(raw: SaveData, known: Known): SaveData {
  const keep = (rec: Record<string, unknown>, max: number) => Object.fromEntries(Object.entries(rec).filter(([id, v]) => known.activities.has(id) && positive(v, max))) as Record<string, number>;
  const base = emptySave();
  const stats = { ...base.stats };
  for (const k of Object.keys(stats) as (keyof SaveData['stats'])[]) stats[k] = clamp(raw.stats[k], MAX_STAT);
  const flags: SaveData['flags'] = {};
  for (const [k, v] of Object.entries(raw.flags)) {
    const [, head, id = ''] = /^(\w+):(.+)$/.exec(k) ?? [];
    const kind = known.activities.get(id);
    const ok = COUNTERS.includes(k)
      ? positive(v, MAX_STAT)
      : head === 'medal'
        ? !!kind && positive(v, 3)
        : head === 'points'
          ? !!kind && positive(v, kind === 'photo' ? 3 : 100)
          : k === 'daily:last'
            ? typeof v === 'string' && DATE.test(v)
            : head === 'daily' && DATE.test(id) && typeof v === 'string' && v.length <= MAX_SHARE;
    if (ok) flags[k] = typeof v === 'number' ? Math.floor(v) : v;
  }
  return {
    ...base,
    completed: keep(raw.completed, Number.MAX_SAFE_INTEGER),
    best: keep(raw.best, MAX_BEST),
    cards: raw.cards.filter((c) => known.cards.has(c)),
    xp: Math.round(clamp(raw.xp, MAX_XP)),
    flags,
    stats,
  };
}

export type SyncPhase = 'idle' | 'waiting' | 'sending' | 'sent' | 'receiving' | 'merged' | 'bad-code' | 'failed' | 'refused';

const EXPIRE_MS = 10 * 60 * 1000;
const STRIKES = 3;
const room = (code: string) => `sync-${code}`;
const secret = (code: string) => code.slice(CODE_LENGTH / 2);

export class DeviceSync {
  phase: SyncPhase = 'idle';
  code: string | null = null;
  result: { added: number; cards: number } | null = null;
  private t: Transport | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onChange = new Set<() => void>();

  constructor(
    private game: Game,
    private kind: TransportKind,
  ) {}

  subscribe(fn: () => void): () => void {
    this.onChange.add(fn);
    return () => this.onChange.delete(fn);
  }

  private set(phase: SyncPhase): void {
    this.phase = phase;
    for (const fn of this.onChange) fn();
  }

  async offer(): Promise<string> {
    this.stop();
    const code = makeCode();
    this.code = code;
    this.set('waiting');
    const payload = encodeSave({ ...this.game.save.data, settings: {} });
    if (payload.length > LIMITS.save) {
      this.set('failed');
      return code;
    }
    let peer: string | null = null;
    let strikes = 0;
    try {
      this.t = await openTransport(this.kind, room(code), {
        join: () => undefined,
        leave: () => undefined,
        message: (raw, from) => {
          const m = parse(raw);
          if (m?.t === 'claim' && !peer) {
            if (m.key === secret(code)) {
              peer = from;
              this.set('sending');
              this.t?.send({ t: 'save', code: payload }, from);
            } else if (++strikes >= STRIKES) {
              this.close();
              this.set('refused');
            }
            return;
          }
          if (m?.t !== 'ack' || from !== peer || this.phase !== 'sending') return;
          this.result = { added: m.added, cards: 0 };
          this.set('sent');
          this.game.toast('Progress delivered to your other device', 'reward');
          this.closeSoon();
        },
      }, 1024);
    } catch {
      this.set('failed');
    }
    this.timer = setTimeout(() => this.stop(), EXPIRE_MS);
    return code;
  }

  async receive(raw: string): Promise<boolean> {
    const code = normalizeCode(raw);
    this.stop();
    if (!code) {
      this.set('bad-code');
      return false;
    }
    this.code = code;
    this.set('receiving');
    try {
      this.t = await openTransport(this.kind, room(code), {
        join: (peer) => this.t?.send({ t: 'claim', key: secret(code) }, peer),
        leave: () => undefined,
        message: (data, from) => {
          const m = parse(data);
          if (m?.t !== 'save' || this.phase !== 'receiving') return;
          let incoming: SaveData;
          try {
            incoming = cleanSave(decodeSave(m.code), knownContent(this.game));
          } catch {
            return;
          }
          const r = mergeSaves(this.game.save.data, incoming, (id) => this.game.activities.defs.get(id)?.xp ?? 10);
          this.game.save.replace(r.save);
          this.result = { added: r.added, cards: r.cards };
          this.t?.send({ t: 'ack', added: r.added }, from);
          this.set('merged');
          this.game.toast(`Progress merged: ${r.added} new ${r.added === 1 ? 'activity' : 'activities'}, ${r.cards} new ${r.cards === 1 ? 'card' : 'cards'}`, 'reward');
          this.closeSoon();
        },
      }, LIMITS.save + 1024);
    } catch {
      this.set('failed');
      return false;
    }
    this.timer = setTimeout(() => this.stop(), EXPIRE_MS);
    return true;
  }

  private closeSoon(): void {
    const t = this.t;
    setTimeout(() => this.t === t && this.close(), 1500);
  }

  private close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.t?.leave();
    this.t = null;
  }

  stop(): void {
    this.close();
    this.code = null;
    this.result = null;
    if (this.phase !== 'idle') this.set('idle');
  }
}
