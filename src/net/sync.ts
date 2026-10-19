import { decodeSave, encodeSave, normalize, type SaveData } from '../core/save';
import type { Game } from '../game';
import { LIMITS, makeCode, normalizeCode, parse } from './protocol';
import { openTransport, type Transport, type TransportKind } from './transport';

export interface MergeResult {
  save: SaveData;
  added: number;
  cards: number;
}

export function mergeSaves(local: SaveData, incoming: SaveData): MergeResult {
  const a = normalize(local);
  const b = normalize(incoming);
  const completed = { ...a.completed };
  let added = 0;
  for (const [id, at] of Object.entries(b.completed)) {
    if (!(id in completed)) {
      completed[id] = at;
      added++;
    } else if (at < completed[id]) completed[id] = at;
  }
  const best = { ...a.best };
  for (const [id, t] of Object.entries(b.best)) if (Number.isFinite(t) && (!(id in best) || t < best[id])) best[id] = t;
  const cards = [...new Set([...a.cards, ...b.cards])];
  const stats = { ...a.stats };
  for (const k of Object.keys(stats) as (keyof SaveData['stats'])[]) stats[k] = Math.max(a.stats[k] ?? 0, b.stats[k] ?? 0);
  return {
    save: { ...a, completed, best, cards, xp: Math.max(a.xp, b.xp), flags: { ...b.flags, ...a.flags }, stats },
    added,
    cards: cards.length - a.cards.length,
  };
}

export type SyncPhase = 'idle' | 'waiting' | 'sending' | 'sent' | 'receiving' | 'merged' | 'bad-code' | 'failed';

const EXPIRE_MS = 10 * 60 * 1000;

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
    const code = makeCode(6);
    this.code = code;
    this.set('waiting');
    const payload = encodeSave(this.game.save.data);
    if (payload.length > LIMITS.save) {
      this.set('failed');
      return code;
    }
    try {
      this.t = await openTransport(this.kind, `sync-${code}`, {
        join: (peer) => {
          this.set('sending');
          this.t?.send({ t: 'save', code: payload }, peer);
        },
        leave: () => undefined,
        message: (raw) => {
          const m = parse(raw);
          if (m?.t !== 'ack' || this.phase === 'sent') return;
          this.result = { added: m.added, cards: 0 };
          this.set('sent');
          this.game.toast('Progress delivered to your other device', 'reward');
          setTimeout(() => this.close(), 1500);
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
      this.t = await openTransport(this.kind, `sync-${code}`, {
        join: () => undefined,
        leave: () => undefined,
        message: (data, from) => {
          const m = parse(data);
          if (m?.t !== 'save' || this.phase !== 'receiving') return;
          let incoming: SaveData;
          try {
            incoming = decodeSave(m.code);
          } catch {
            return;
          }
          const r = mergeSaves(this.game.save.data, incoming);
          this.game.save.replace(r.save);
          this.result = { added: r.added, cards: r.cards };
          this.t?.send({ t: 'ack', added: r.added }, from);
          this.set('merged');
          this.game.toast(`Progress merged: ${r.added} new ${r.added === 1 ? 'activity' : 'activities'}, ${r.cards} new ${r.cards === 1 ? 'card' : 'cards'}`, 'reward');
          setTimeout(() => this.close(), 1500);
        },
      }, LIMITS.save + 1024);
    } catch {
      this.set('failed');
      return false;
    }
    this.timer = setTimeout(() => this.stop(), EXPIRE_MS);
    return true;
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
