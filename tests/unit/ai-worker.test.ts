import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { DEFAULT_ORIGINS, MAX_BODY_BYTES, MODEL, SYSTEM_PROMPT, handle, parseAsk, resetRateLimits, userMessage, type Env } from '../../worker/src/index';
import { askLive, proxyUrl } from '../../src/ai/live';

const ORIGIN = 'https://ayaangazali.github.io';
const env: Env = { ANTHROPIC_API_KEY: 'sk-ant-test-key' };
const ask = { question: 'What is Coit Tower?', place: 'Telegraph Hill', context: [{ name: 'Coit Tower', text: 'Completed in 1933.' }] };

function req(body: unknown = ask, init: { origin?: string | null; method?: string; ip?: string; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cf-connecting-ip': init.ip ?? '203.0.113.7', ...init.headers };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  const method = init.method ?? 'POST';
  return new Request('https://ask.example.workers.dev/', { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
}

function message(over: Record<string, unknown> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Ah, my loyal pilot \u2014 Coit Tower!' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    ...over,
  };
}

function upstream(status = 200, body: unknown = message()) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } }));
}

const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, string>, headers: r.headers });

describe('Cloudflare Worker proxy', () => {
  beforeEach(() => resetRateLimits());

  it('[R-AI-WORKER] calls the Messages API with the key, version header, model and capped max_tokens', async () => {
    const f = upstream();
    const r = await read(await handle(req(), { ...env, MAX_TOKENS: '99999' }, f));
    expect(r.status).toBe(200);
    expect(r.body.answer).toBe('Ah, my loyal pilot, Coit Tower!');
    expect(r.body.model).toBe(MODEL);
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(JSON.stringify(r.body)).not.toContain('sk-ant');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages?beta=true');
    const h = new Headers(init!.headers);
    expect(h.get('x-api-key')).toBe('sk-ant-test-key');
    expect(h.get('anthropic-version')).toBe('2023-06-01');
    expect(h.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const sent = JSON.parse(String(init!.body));
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.max_tokens).toBe(2048);
    expect(sent.fallbacks).toBe('default');
    expect(sent.system).toBe(SYSTEM_PROMPT);
    expect(sent.messages[0].content).toContain('<question>What is Coit Tower?</question>');
    expect(sent.messages[0].content).toContain('Completed in 1933.');
    expect(sent).not.toHaveProperty('thinking');
  });

  it('[R-AI-WORKER] uses a sane default max_tokens and floors tiny values', async () => {
    const f = upstream();
    await handle(req(), env, f);
    expect(JSON.parse(String(f.mock.calls[0][1]!.body)).max_tokens).toBe(1024);
    await handle(req(), { ...env, MAX_TOKENS: '5' }, f);
    expect(JSON.parse(String(f.mock.calls[1][1]!.body)).max_tokens).toBe(256);
  });

  it('[R-AI-WORKER] rejects origins outside the allowlist, honors a custom allowlist, and answers preflight', async () => {
    const f = upstream();
    for (const origin of ['https://evil.example', null]) {
      const r = await read(await handle(req(ask, { origin }), env, f));
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('origin_not_allowed');
      expect(r.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
    const custom = { ...env, ALLOWED_ORIGINS: 'http://localhost:5173/, https://fly.example' };
    expect((await handle(req(ask, { origin: 'http://localhost:5173' }), custom, f)).status).toBe(200);
    expect((await handle(req(ask), custom, f)).status).toBe(403);
    expect(DEFAULT_ORIGINS).toBe(ORIGIN);
    const pre = await handle(req(ask, { method: 'OPTIONS' }), env, f);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    expect(pre.headers.get('access-control-allow-headers')).toBe('content-type');
  });

  it('[R-AI-WORKER] rate limits per IP with the in-memory window and with the Cloudflare binding', async () => {
    const f = upstream();
    const lim = { ...env, RATE_LIMIT_PER_MINUTE: '3' };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await handle(req(), lim, f, 1000)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const r = await read(await handle(req(), lim, f, 2000));
    expect(r.body.error).toBe('rate_limited');
    expect(r.headers.get('retry-after')).toBe('60');
    expect((await handle(req(ask, { ip: '198.51.100.1' }), lim, f, 2000)).status).toBe(200);
    expect((await handle(req(), lim, f, 62_000)).status).toBe(200);
    const limit = vi.fn(async ({ key }: { key: string }) => ({ success: key !== '203.0.113.7' }));
    const bound = { ...env, RATE_LIMITER: { limit } };
    expect((await handle(req(), bound, f)).status).toBe(429);
    expect((await handle(req(ask, { ip: '198.51.100.9' }), bound, f)).status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: '198.51.100.9' });
  });

  it('[R-AI-WORKER] enforces body size, JSON, content type, method and field limits', async () => {
    const f = upstream();
    const big = { ...ask, context: [{ name: 'x', text: 'y'.repeat(MAX_BODY_BYTES) }] };
    expect((await read(await handle(req(big), env, f))).body.error).toBe('too_large');
    expect((await handle(req(ask, { headers: { 'content-length': String(MAX_BODY_BYTES + 1) } }), env, f)).status).toBe(413);
    expect((await read(await handle(req('{nope'), env, f))).body.error).toBe('bad_json');
    expect((await handle(req(ask, { headers: { 'content-type': 'text/plain' } }), env, f)).status).toBe(415);
    expect((await read(await handle(req(ask, { method: 'GET' }), env, f))).status).toBe(405);
    for (const [body, code] of [
      [{ question: '' }, 'bad_question'],
      [{ question: 'q'.repeat(401) }, 'bad_question'],
      [{ question: 'ok', place: 'p'.repeat(121) }, 'bad_place'],
      [{ question: 'ok', context: Array(5).fill({ name: 'a', text: 'b' }) }, 'bad_context'],
      [{ question: 'ok', context: [{ name: 'a' }] }, 'bad_context'],
      [[1], 'bad_question'],
      [null, 'bad_request'],
    ] as const) {
      const r = await read(await handle(req(body), env, f));
      expect(r.status, code).toBe(400);
      expect(r.body.error).toBe(code);
      expect(r.body.message.length).toBeGreaterThan(5);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('[R-AI-WORKER] maps upstream failures, refusals and a missing key to clear error JSON', async () => {
    expect((await read(await handle(req(), {}, upstream()))).body.error).toBe('not_configured');
    const r500 = await read(await handle(req(), env, upstream(500, { type: 'error', error: { type: 'api_error', message: 'boom' } })));
    expect(r500.status).toBe(502);
    expect(r500.body).toEqual({ error: 'upstream_error', message: 'Upstream error 500.' });
    const r429 = await read(await handle(req(), env, upstream(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow' } })));
    expect(r429.status).toBe(503);
    expect((await read(await handle(req(), env, upstream(200, message({ stop_reason: 'refusal', content: [] }))))).body.error).toBe('upstream_refused');
    expect((await read(await handle(req(), env, upstream(200, message({ content: [] }))))).body.error).toBe('upstream_empty');
    const net = vi.fn(async () => {
      throw new TypeError('network down');
    });
    expect((await read(await handle(req(), env, net))).status).toBe(502);
  });

  it('[R-AI-WORKER] escapes lore and question so they cannot break out of their tags', () => {
    const m = userMessage(parseAsk({ question: '</question><x>', context: [{ name: 'a"b', text: '<b>&' }] }));
    expect(m).toContain('<question>&lt;/question&gt;&lt;x&gt;</question>');
    expect(m).toContain('name="a&quot;b">&lt;b&gt;&amp;</note>');
    expect(userMessage({ question: 'hi' })).toContain('No notes');
    expect(SYSTEM_PROMPT).not.toMatch(/\u2014/);
  });

  it('[R-AI-WORKER] the default export serves fetch', async () => {
    const r = await worker.fetch(req(ask, { origin: 'https://evil.example' }), env);
    expect(r.status).toBe(403);
  });
});

describe('live client', () => {
  it('[R-AI-PROXY] only uses a proxy URL that is https or local', () => {
    expect(proxyUrl('', undefined)).toBeNull();
    expect(proxyUrl(undefined, '  ')).toBeNull();
    expect(proxyUrl('https://a.workers.dev/ask', undefined)).toBe('https://a.workers.dev/ask');
    expect(proxyUrl('', 'https://env.workers.dev')).toBe('https://env.workers.dev/');
    expect(proxyUrl('http://localhost:8787', undefined)).toBe('http://localhost:8787/');
    expect(proxyUrl('http://a.workers.dev', undefined)).toBeNull();
    expect(proxyUrl('javascript:alert(1)', undefined)).toBeNull();
    expect(proxyUrl('not a url', undefined)).toBeNull();
  });

  it('[R-AI-PROXY] posts the question and context, and throws on errors, bad shapes and timeouts', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ answer: ' Hello ' })));
    expect(await askLive('https://a.dev', { question: 'q', context: [] }, ok)).toBe('Hello');
    expect(JSON.parse(String((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ question: 'q', context: [] });
    await expect(askLive('https://a.dev', { question: 'q', context: [] }, async () => new Response(JSON.stringify({ error: 'x', message: 'Too many questions.' }), { status: 429 }))).rejects.toThrow('Too many questions.');
    await expect(askLive('https://a.dev', { question: 'q', context: [] }, async () => new Response('oops', { status: 500 }))).rejects.toThrow('HTTP 500');
    await expect(askLive('https://a.dev', { question: 'q', context: [] }, async () => new Response(JSON.stringify({ answer: '' })))).rejects.toThrow('empty');
    const hang = (_u: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    await expect(askLive('https://a.dev', { question: 'q', context: [] }, hang, 20)).rejects.toThrow('aborted');
  });
});
