export type FeedStatus = 'off' | 'loading' | 'live' | 'cached' | 'fallback' | 'schedule';

export interface FeedSpec<T> {
  id: string;
  label: string;
  url(now: Date): string;
  parse(json: unknown): T;
  ttl: number;
  maxAge: number;
  minInterval: number;
  failBackoff: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Fetcher = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

const PREFIX = 'fly-around-sf:live:v1:';
const TIMEOUT = 8000;

export class Feed<T> {
  status: FeedStatus = 'loading';
  data: T | null = null;
  updated = 0;
  error = '';
  private busy: Promise<FeedStatus> | null = null;
  private memory = new Map<string, string>();

  constructor(
    readonly spec: FeedSpec<T>,
    private store: Store | null,
    private online: boolean,
    private fetcher: Fetcher = (url, init) => fetch(url, init),
  ) {}

  refresh(now = Date.now()): Promise<FeedStatus> {
    return (this.busy ??= this.load(now).finally(() => (this.busy = null)));
  }

  age(now = Date.now()): number {
    return this.updated ? now - this.updated : Infinity;
  }

  private async load(now: number): Promise<FeedStatus> {
    const cached = this.read<{ t: number; data: T }>('data');
    const fresh = cached && now - cached.t < this.spec.ttl;
    if (fresh && this.status === 'live' && this.updated === cached.t) return this.status;
    if (fresh) return this.use(cached.data, cached.t, 'cached');
    const next = this.read<number>('next') ?? 0;
    if (!this.online || now < next) return this.stale(cached, now);
    try {
      const ctl = typeof AbortController === 'undefined' ? null : new AbortController();
      const timer = ctl && setTimeout(() => ctl.abort(), TIMEOUT);
      const res = await this.fetcher(this.spec.url(new Date(now)), ctl ? { signal: ctl.signal } : undefined).finally(() => timer && clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = this.spec.parse(await res.json());
      this.write('data', { t: now, data });
      this.write('next', now + this.spec.minInterval);
      this.error = '';
      return this.use(data, now, 'live');
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.write('next', now + this.spec.failBackoff);
      return this.stale(cached, now);
    }
  }

  private stale(cached: { t: number; data: T } | null, now: number): FeedStatus {
    if (cached && now - cached.t < this.spec.maxAge) return this.use(cached.data, cached.t, 'cached');
    this.data = null;
    this.updated = 0;
    return (this.status = 'fallback');
  }

  private use(data: T, t: number, status: FeedStatus): FeedStatus {
    this.data = data;
    this.updated = t;
    return (this.status = status);
  }

  private read<V>(key: string): V | null {
    const k = PREFIX + this.spec.id + ':' + key;
    let raw: string | null = null;
    try {
      raw = this.store?.getItem(k) ?? null;
    } catch {
      raw = null;
    }
    try {
      return JSON.parse(raw ?? this.memory.get(k) ?? 'null') as V | null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    const k = PREFIX + this.spec.id + ':' + key;
    const raw = JSON.stringify(value);
    this.memory.set(k, raw);
    try {
      this.store?.setItem(k, raw);
    } catch {
      return;
    }
  }
}

export function liveStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
