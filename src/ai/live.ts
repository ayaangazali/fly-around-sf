export interface LiveRequest {
  question: string;
  place?: string;
  context: { name: string; text: string }[];
}

export const LIVE_TIMEOUT_MS = 15_000;

export function proxyUrl(setting: unknown, env: string | undefined): string | null {
  const raw = (typeof setting === 'string' && setting.trim()) || env?.trim() || '';
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? u.href : null;
  } catch {
    return null;
  }
}

export async function askLive(url: string, body: LiveRequest, fetchImpl: typeof fetch = (i, o) => fetch(i, o), timeoutMs = LIVE_TIMEOUT_MS): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const data = (await res.json().catch(() => null)) as { answer?: unknown; message?: unknown } | null;
    if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : `HTTP ${res.status}`);
    if (typeof data?.answer !== 'string' || !data.answer.trim()) throw new Error('empty answer');
    return data.answer.trim().slice(0, 2000);
  } finally {
    clearTimeout(timer);
  }
}
