# Ask the City: live guide worker

A Cloudflare Worker that lets the in-game **Ask the City** panel answer with Claude, in the voice of Emperor Norton. The game works fully offline without it: answers then come from the handwritten card lore. Deploy this only when you want live answers.

The browser never sees the API key. It posts the question plus the nearest card lore to this worker, and the worker calls the Anthropic Messages API (`claude-opus-5-5`, low effort, server-side refusal fallback) with the key stored as a Cloudflare secret.

## Deploy

You need a Cloudflare account and an Anthropic API key from https://platform.claude.com.

**Cap your spend first.** The `Origin` allowlist only stops other websites from calling the worker from a browser. Any script can send the allowed `Origin` header (the `curl` check below does exactly that), so the per-IP limit of 10 questions a minute is the only other guard, and someone with many IPs can still run up your bill. Before deploying, set a monthly spend limit in the Claude Console: Billing page (https://platform.claude.com/settings/billing), **Spend limits**, **Adjust limit**. Better still, create the key in its own workspace and give that workspace a low spend limit (the default workspace cannot have one). Once a limit is hit the API refuses requests, the worker returns `upstream_error`, and the game answers from the archive. See https://platform.claude.com/docs/en/api/rate-limits#setting-your-own-spend-limit. If the bill climbs anyway, `wrangler secret delete ANTHROPIC_API_KEY` or `wrangler delete` turns the guide off and the game falls back to the archive.

```sh
cd worker
pnpm install                                     # pnpm-workspace.yaml allows the esbuild and workerd build scripts wrangler needs
pnpm exec wrangler login                         # opens the browser once
pnpm exec wrangler secret put ANTHROPIC_API_KEY  # paste the key when asked
pnpm exec wrangler deploy                        # prints https://fly-around-sf-ask.<you>.workers.dev
```

Then open the game, press `/` (or the 💬 button), expand **Live guide (optional)**, paste the printed URL and press **Save**. The dot next to the mode line turns green. To bake the URL into a build instead, set `VITE_AI_PROXY_URL` when running `pnpm build`.

Check it from a terminal (the Origin header must be on the allowlist):

```sh
curl -s https://fly-around-sf-ask.<you>.workers.dev \
  -H 'origin: https://ayaangazali.github.io' -H 'content-type: application/json' \
  -d '{"question":"What is Coit Tower?","context":[{"name":"Coit Tower","text":"Completed in 1933."}]}'
```

## Configuration (`wrangler.toml`)

| Setting | Default | Meaning |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://ayaangazali.github.io` | Comma-separated origins allowed to call the worker. Add `http://localhost:5173` for local dev. |
| `MAX_TOKENS` | `1024` | Output cap per answer, clamped to 256..2048. |
| `[[ratelimits]] RATE_LIMITER` | 10 per 60 s per IP | Cloudflare rate limiting binding, keyed by `CF-Connecting-IP`. Without the binding, an in-memory limit of `RATE_LIMIT_PER_MINUTE` (default 10) applies per isolate. |
| `ANTHROPIC_API_KEY` | secret | Set with `wrangler secret put`, never in the file. |

## API

`POST /` with `content-type: application/json`, body at most 8 KB:

```json
{ "question": "1 to 400 chars", "place": "optional, up to 120 chars", "context": [{ "name": "up to 120 chars", "text": "up to 1500 chars" }] }
```

At most 4 context notes. Success is `200 { "answer": "...", "model": "claude-opus-5-5" }`. Every failure is `{ "error": "<code>", "message": "<human text>" }`:

| Status | `error` | When |
|---|---|---|
| 400 | `bad_json`, `bad_request`, `bad_question`, `bad_place`, `bad_context` | Body is not valid JSON or a field breaks the limits above |
| 403 | `origin_not_allowed` | Missing or unlisted `Origin` |
| 405 | `method_not_allowed` | Anything but `POST` or the `OPTIONS` preflight |
| 413 | `too_large` | Body over 8 KB |
| 415 | `bad_content_type` | Not `application/json` |
| 429 | `rate_limited` | Over the per-IP limit (`Retry-After: 60`) |
| 500 | `not_configured` | No `ANTHROPIC_API_KEY` secret |
| 502 | `upstream_error`, `upstream_refused`, `upstream_empty` | The API failed, declined, or returned no text |
| 503 | `upstream_busy` | The API rate limited the worker |
| 504 | `upstream_timeout` | No answer within 12 s (one attempt, no retries) |

The worker gives up before the game does. The game treats any non-200 or a 15 s timeout as "live guide unreachable" and answers from the archive instead.

Tests live in `tests/unit/ai-worker.test.ts` at the repo root and run with `pnpm test`.
