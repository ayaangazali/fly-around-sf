export interface SaveData {
  v: 1;
  completed: Record<string, number>;
  best: Record<string, number>;
  cards: string[];
  xp: number;
  pos?: [number, number, number, number];
  flags: Record<string, boolean | number | string>;
  settings: Record<string, boolean | number | string>;
  stats: { distance: number; flightTime: number; crashes: number; sessions: number };
}

const KEY = 'fly-around-sf:save';

export function emptySave(): SaveData {
  return { v: 1, completed: {}, best: {}, cards: [], xp: 0, flags: {}, settings: {}, stats: { distance: 0, flightTime: 0, crashes: 0, sessions: 0 } };
}

const finite = (rec: unknown): Record<string, number> => Object.fromEntries(Object.entries(rec && typeof rec === 'object' ? rec : {}).filter(([, v]) => Number.isFinite(v)));

export function normalize(raw: unknown): SaveData {
  const base = emptySave();
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return base;
  const r = raw as Partial<SaveData>;
  return {
    ...base,
    ...r,
    v: 1,
    completed: finite(r.completed),
    best: finite(r.best),
    pos: Array.isArray(r.pos) && r.pos.length === 4 && r.pos.every(Number.isFinite) ? r.pos : undefined,
    cards: Array.isArray(r.cards) ? [...new Set(r.cards.filter((c) => typeof c === 'string'))] : [],
    xp: Number.isFinite(r.xp) ? (r.xp as number) : 0,
    flags: { ...(r.flags ?? {}) },
    settings: { ...(r.settings ?? {}) },
    stats: { ...base.stats, ...finite(r.stats) },
  };
}

export function encodeSave(s: SaveData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSave(code: string): SaveData {
  const b64 = code.trim().replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return normalize(JSON.parse(new TextDecoder().decode(bytes)));
}

export class SaveStore {
  data: SaveData;
  private listeners = new Set<() => void>();

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(this.storage?.getItem(KEY) ?? 'null');
    } catch {
      raw = null;
    }
    this.data = normalize(raw);
  }

  isDone(id: string): boolean {
    return id in this.data.completed;
  }

  complete(id: string, xp = 0, at = Date.now()): boolean {
    if (this.isDone(id)) return false;
    this.data.completed[id] = at;
    this.data.xp += xp;
    this.persist();
    return true;
  }

  recordBest(id: string, seconds: number): boolean {
    const prev = this.data.best[id];
    if (prev !== undefined && prev <= seconds) return false;
    this.data.best[id] = seconds;
    this.persist();
    return true;
  }

  addCard(id: string): boolean {
    if (this.data.cards.includes(id)) return false;
    this.data.cards.push(id);
    this.persist();
    return true;
  }

  replace(next: SaveData): void {
    this.data = normalize(next);
    this.persist();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  persist(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: progress stays in memory for this session */
    }
    for (const fn of this.listeners) fn();
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
