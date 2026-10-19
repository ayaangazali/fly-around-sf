import { describe, expect, it, vi } from 'vitest';
import { Feed, type FeedSpec } from '../../src/live/feed';
import { memoryStorage } from './helpers';
import { respond } from './live-helpers';

const spec: FeedSpec<number> = {
  id: 'test',
  label: 'Test',
  url: () => 'https://example.test/feed',
  parse: (j) => {
    const v = (j as { v?: unknown }).v;
    if (typeof v !== 'number') throw new Error('bad');
    return v;
  },
  ttl: 60_000,
  maxAge: 3600_000,
  minInterval: 30_000,
  failBackoff: 300_000,
};

describe('live feed cache', () => {
  it('[R-LIVE-CACHE] fetches once, then serves the cache within the TTL across instances', async () => {
    const store = memoryStorage();
    const fetcher = vi.fn(() => respond({ v: 7 }));
    const a = new Feed(spec, store, true, fetcher);
    expect(await a.refresh(1000)).toBe('live');
    expect(a.data).toBe(7);
    expect(await a.refresh(2000)).toBe('live');
    const b = new Feed(spec, store, true, fetcher);
    expect(await b.refresh(5000)).toBe('cached');
    expect(b.data).toBe(7);
    expect(b.age(5000)).toBe(4000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('[R-LIVE-CACHE] refetches after the TTL and rate-limits failed attempts', async () => {
    const store = memoryStorage();
    let ok = true;
    const fetcher = vi.fn(() => respond({ v: ok ? 1 : 0 }, ok));
    const f = new Feed(spec, store, true, fetcher);
    await f.refresh(0);
    ok = false;
    expect(await f.refresh(70_000)).toBe('cached');
    expect(f.error).toBe('HTTP 503');
    expect(await f.refresh(80_000)).toBe('cached');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await f.refresh(4_000_000)).toBe('fallback');
    expect(f.data).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('[R-LIVE-CACHE] concurrent refreshes share one request and bad payloads fall back', async () => {
    const fetcher = vi.fn(() => respond({ nope: true }));
    const f = new Feed(spec, null, true, fetcher);
    const [x, y] = await Promise.all([f.refresh(0), f.refresh(0)]);
    expect([x, y]).toEqual(['fallback', 'fallback']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(f.error).toBe('bad');
  });

  it('[R-LIVE-CACHE] survives storage that throws and still rate-limits in memory', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const fetcher = vi.fn(() => Promise.reject(new Error('offline')));
    const f = new Feed(spec, broken, true, fetcher);
    expect(await f.refresh(0)).toBe('fallback');
    expect(await f.refresh(1000)).toBe('fallback');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const g = new Feed(spec, broken, true, () => respond({ v: 3 }));
    expect(await g.refresh(0)).toBe('live');
    expect(await g.refresh(10)).toBe('live');
  });

  it('[R-LIVE-FALLBACK] an offline feed never touches the network', async () => {
    const fetcher = vi.fn(() => respond({ v: 1 }));
    const f = new Feed(spec, memoryStorage(), false, fetcher);
    expect(await f.refresh(0)).toBe('fallback');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('[R-LIVE-FALLBACK] an offline feed still uses a cache written while online', async () => {
    const store = memoryStorage();
    await new Feed(spec, store, true, () => respond({ v: 9 })).refresh(0);
    const off = new Feed(spec, store, false);
    expect(await off.refresh(600_000)).toBe('cached');
    expect(off.data).toBe(9);
  });

  it('[R-LIVE-CACHE] aborts requests that hang past the timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_: string, init?: RequestInit) => new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const f = new Feed(spec, null, true, fetcher);
    const p = f.refresh(0);
    await vi.advanceTimersByTimeAsync(9000);
    expect(await p).toBe('fallback');
    expect(f.error).toBe('aborted');
    vi.useRealTimers();
  });
});
