# Architecture

Vite + TypeScript + Three.js. No framework. Static site, deployed to GitHub Pages by CI.

## Run it

```sh
pnpm install
pnpm dev                 # http://localhost:5173
pnpm test                # unit tests (vitest)
pnpm build && pnpm e2e   # browser tests (playwright, uses the built site)
pnpm ledger              # requirement ledger from the two test reports
node scripts/shots.mjs <dir>   # screenshots of 4 viewpoints (needs `pnpm preview` running)
```

URL flags: `?test` (deterministic, exposes `window.__fly`, no auto sim, live feeds offline), `?live` (with `?test`: let live feeds hit the network), `?opensky=https://proxy` (fetch live planes through a CORS proxy for `opensky-network.org`; OpenSky only allows its own origin, so without it planes are simulated and nothing is requested), `?time=2026-10-19T02:00:00Z`, `?spawn=lat,lon,yaw`, `?quality=low|medium|high`, `?room=CODE`.

## World

- `public/data/city.bin`: all 172,368 DataSF building footprints (2010 LiDAR heights, ground elevation), delta-encoded int16 at 0.5 m. Built by `scripts/build-city.mjs`.
- `public/data/terrain.bin`: 16 m heightmap with bathymetry from AWS terrain tiles (z13). Water is `y < 0`. Built by `scripts/build-terrain.mjs`.
- Local coordinates: meters, `x` east, `z` south (north is `-z`), `y` up. `src/core/geo.ts` converts.
- City meshes are built in a worker (`src/world/city-worker.ts`) in 500 m chunks; the shader adds windows and lights them at night.
- Environment data, built by `scripts/build-env.mjs` (`pnpm data:env`): `streets.bin` (DataSF street centerlines with class), `green.bin` (RPD parks plus OpenStreetMap wood, scrub, sand and lakes), `trees.bin` (DataSF street tree inventory, species mapped to shape and tint by `treeKind`/`treeTint` in `src/world/env-data.ts`), `stars.bin` (Yale Bright Star Catalog). OSM data is ODbL: keep its credit line on the title screen (`src/ui/title.ts`).
- `src/systems/env.ts` drapes roads on the rendered terrain, plants instanced trees, swaps in the water shader, drives `settings.timeMode` and culls by quality tier. Read it at runtime as `game.systems.find((s) => s.id === 'env').env` (`stats()`, `visibility()`).
- Environment performance (`R-ENV-PERF`): `node scripts/gpu-probe.mjs <preview url>` renders nine reference views per tier back to back on the real GPU at 1280x800, device pixel ratio 2, and prints draw calls, triangles and saturated frame time with and without Karl the Fog. On an Apple M4 (2026-10-19, full city) the worst views were low 223 calls, 2.37M triangles, 2.7 ms; medium 468, 5.23M, 5.6 ms; high 565, 8.47M, 10.1 ms; Karl added at most 3.1 ms. The e2e budgets are 1.25x those counts (low 280 / 3.0M, medium 590 / 6.6M, high 710 / 10.6M): at linear cost the high tier's worst frame stays near 12.6 ms, inside the 16.7 ms of 60 fps on that GPU, and the low tier keeps about 5x headroom for slower tablet GPUs, which have not been measured. Raise a budget only with a new probe run.
- Draw calls after the merge (2026-10-19, full city, swiftshader): low 264, medium 532, high 628. Landmark `paint()` and `glow()` parts bake into one vertex-colored mesh per landmark, so a new color costs no draw call. `frustumCulled = false` makes an object draw in every view: drive per-frame updates from a system's `update`, not from a culled-off `onBeforeRender`, and give instanced meshes fresh bounds with `computeBoundingSphere()`.
- Initial JS (`R-PERF`, gate `max_initial_js_gzip_kb`): `tests/e2e/perf.spec.ts` sums the entry chunk and its static imports from `dist/.vite/manifest.json`. Activity content JSON is a lazy glob that `game.load` starts fetching with `terrain.bin`, so it downloads alongside the city data and not after it (the `R-PERF` ready test checks this); keep anything not needed before the first frame out of the entry chunk the same way.
- Shaders (`R-PERF-SHADERS`): `game.load` compiles every material in the scene before ready. Add meshes in a system's `init`, not after load, or their first appearance in flight stalls on a shader link.
- Geometry arrays stay in JS memory after upload (about 52 MB on the 3 km city at low, 109 MB at high). three re-uploads from them when the browser restores a lost WebGL context (mobile browsers drop the context of a background tab under memory pressure), so do not free them in `onUpload` unless the city and terrain are rebuilt on `webglcontextrestored`.
- `src/world/sky.ts` owns the sky palette, stars, moon and fog. `game.sky.karl` is the current Karl the Fog state; `karlDensity(x, y, z, game.sky.karl)` in `src/world/karl.ts` tells gameplay whether a point is inside the fog. `game.sky.cloudCover` (0..1) is settable by live weather.
- Known data gap: heights are from 2010, so towers built later (Salesforce Tower, 181 Fremont, Park Tower...) are missing or wrong. `R-SKYLINE` tracks the fix.
- `world.groundAt` does not see hand-built landmarks: their raw footprints are hidden, so it returns street level under Salesforce Tower or Coit Tower. Every `src/world/landmarks/<slug>.ts` exports `TOP`, the height in meters above the ground at its `source` that clears the whole model. Put an activity point at a landmark with `alt` above `TOP`, or beside the model. Skyline towers carry their own `top` in `TOWERS` (`skyline-modern.ts`).

## Live data

`src/live/` holds the feeds (Open-Meteo weather, USGS quakes, OpenSky planes, NOAA tides) and `public/data/transit.json`, baked from SFMTA, Golden Gate Ferry and SF Bay Ferry GTFS by `node scripts/build-transit.mjs`. Every feed is cached in localStorage with a TTL and falls back to a model offline (climate weather, simulated SFO/OAK traffic, NOAA harmonic tides). The Live SF panel shows each feed's status. Events: `live:status`, `live:quake`, `live:close-call`.

## Extension points (add files, never edit a shared list)

Everything below is discovered with `import.meta.glob`. Parallel teams add new files and never need to touch `game.ts`.

| Folder | Export | Purpose |
|---|---|---|
| `src/activities/kinds/*.ts` | `export const kind: ActivityKind` | A type of activity (rings, photo, delivery...). Must implement `validate`, `start`, `solve`. |
| `src/content/activities/**/*.json` | array of `ActivityDef` | Activity instances. One file per theme. |
| `src/content/cards/**/*.json` | array of `CardDef` | Collectible cards (landmarks, companies, food, wildlife, lore). |
| `src/world/landmarks/*.ts` | `export const landmark: Landmark` | Hand-built 3D landmark. `exclusions` hide the raw footprints under it, `build(game)` adds meshes and colliders. |
| `src/systems/*.ts` | `export const system: GameSystem` | Anything that runs every frame: multiplayer, live data, audio, markers, quests. `init(game)` then `update(dt, game)`. |
| `src/ui/panels/*.ts` | `export const panel: Panel` | A full-screen menu sheet with a menubar button and optional hotkey action. |

## Activity contract

```ts
interface ActivityKind {
  kind: string; label: string; icon: string; passive?: boolean;
  validate(def): string[];               // content errors, empty when valid
  blocked?(def, game): string | null;    // optional: why it cannot start right now (shown as a toast)
  start(def, game): ActivityInstance;    // update(dt) -> 'running' | 'done' | 'failed'
  solve(def, game): SolverStep[];        // a script the test bot replays to WIN this activity
}
```

`solve` is not optional and not decorative: `R-ACT-ALL` replays it for every activity in a real browser and fails CI if any activity cannot be completed. Passive kinds (like `discover`) complete without being started; active kinds start when the player presses F near `at`.

## Test API (`?test`)

`window.__fly`: `step(seconds)`, `teleport(p, yaw)`, `activities()`, `kinds()`, `solve(id)`, `state()`, `exportSave()`, `importSave(code)`, `reset()`, plus `game` for anything else.

## Requirement ledger

`requirements.json` lists every hard requirement. A test proves a requirement by putting its tag in the title, e.g. `it('[R-FLIGHT] ...')`. `scripts/check-ledger.mjs` reads `reports/vitest.json` and `reports/playwright.json` and fails CI unless every requirement has at least one passing test and no failing one. Numeric gates live in `requirements.json` under `gates`.

## Rules

- Visible text never uses em dashes.
- Real company names, never their logos. Every fact on a card has a source URL in the card's `sources`.
- No real private residences, no real private people. Archetype NPCs only.
  - Exception: the Painted Ladies appear only as the public streetscape seen from Alamo Square. No house numbers, owners or interiors.
- Every external feed (weather, transit, planes, quakes) must work offline with a fallback; tests block the network.
- No new runtime dependency without a reason that a few lines of code cannot cover.

## Shared contracts

### Settings keys (`game.save.data.settings`)

Every team reads and writes these exact keys; the settings panel (UI team) edits them, then calls `game.save.persist()`.

| Key | Type | Default | Used by |
|---|---|---|---|
| `quality` | `'auto' \| 'low' \| 'medium' \| 'high'` | `'auto'` | renderer (applied on reload; auto is low on phones and tablets, high elsewhere) |
| `units` | `'metric' \| 'imperial'` | `'metric'` | HUD |
| `volMaster`, `volMusic`, `volSfx`, `volVoice` | number 0..1 | 0.8, 0.5, 0.8, 1 | audio, voice chat |
| `muted` | boolean | false | audio |
| `reducedMotion` | boolean | OS setting | camera, UI |
| `turnSpeed` | number 0.5..1.5 | 1 | flight input |
| `timeMode` | `'real' \| 'golden' \| 'noon' \| 'night'` | `'real'` | sky |
| `playerName` | string, max 20 | random "Pilot-1234" | multiplayer |
| `droneColor` | hex string | `'#f2f2ee'` | drone model, multiplayer |
| `showFps` | boolean | false | HUD |
| `aiProxyUrl` | string | `''` | Ask the City (live AI only when set) |

### Game fields other teams may read or set

- `game.waypoint` (`{x,y,z,label} | null`): the HUD guides the player to it. Any panel can set it ("Go there").
- `game.env.wind` (`{x,z}`, m/s): live weather writes it, flight reads it.
- `game.sky.weatherFog` (1 = normal, 3 = thick Karl): only live weather writes it, every frame.
- `game.sky.fogDensity` (default 1): an override for game modes (hide and seek). Save it before writing and restore it after; live weather never touches it. The sky draws `max(fogDensity, weatherFog)` and Karl rolls in with that same value, so neither writer clobbers the other.
- `game.timeScale`, `game.clockOffset`: time-of-day controls for the shared clock, `game.clock()`. `game.date()` is what the sky shows: the shared clock, unless `settings.timeMode` is not `'real'`, in which case the env system holds it at that mode's sun angle on the shared clock's day through `game.timePin` (env-owned, never write it). The player's timeMode wins over `clockOffset` and `timeScale`; it never changes them.
- `game.activities.start(id)`, `.position(def)`, `.locked(def)`, `.nearby`, `.active`.
- `game.toast(text, kind)`, `game.bus.on/emit`.
- `dex:show` event (`{ id }`, declared in `src/ui/panels/ask.ts`): emitted right after something opens the `dex` panel to point at one card. The Dex should scroll to and highlight it.

### Multiplayer (`game.net`)

- `?net=local` swaps the Nostr P2P transport for a BroadcastChannel one, so two tabs of one browser share a room (tests use it).
- `game.net.room`, `.status`, `.visiblePeers()` (`{ id, name, color, pos, yaw, mic }`), `.chat`, `.pings`, `.match`.
- A started match is only an invite for everyone but the host: `match.playing` stays false (no teleport, no activity stop, no panel close) until the player calls `game.net.joinMatch()`. `leaveMatch()` drops out.
- To ping from anywhere (the map, a panel): `game.bus.emit('net:ping-request', { x, z })`. Everyone in the room sees it.
- Events: `net:status`, `net:join`, `net:leave`, `net:chat`, `net:ping`, `net:match` (see `src/net/session.ts`).
- Save flags written by party modes: `flags.mpPlayed`, `flags.mpWins`.
- Device-only settings owned by net: `settings.netId` (16 hex characters, generated once, sent in every `hi`) and `settings.netBlocked` (space-separated `netId`s this player blocked). Blocks match on `netId`, so they survive either side reloading.

### Adding events

Extend the event map with declaration merging in your own file, never by editing `bus.ts`:

```ts
declare module '../core/bus' {
  interface GameEvents {
    'net:join': { id: string; name: string };
  }
}
```

### Styling

Use the CSS variables in `src/ui/styles.css` (`--glass`, `--ink`, `--accent`, `--radius`, `--mono`...). Put team CSS in its own file next to the module and import it from that module (`import './map.css'`). Phone layouts must not overflow horizontally; touch targets are at least 40px.

### Adding requirements

`requirements.json` is the base list. A team adds its own hard requirements as a JSON array in `requirements.d/<team>.json` (same shape: `id`, `owner`, `text`), never by editing the base file. Ids must be unique across all files.

### Naming

Slugs are shared across teams: a landmark model `golden-gate-bridge`, its card `golden-gate-bridge`, its discovery `discover-golden-gate-bridge`. Activity ids are `<kind>-<slug>`.
