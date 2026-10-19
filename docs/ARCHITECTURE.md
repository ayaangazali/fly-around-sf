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

URL flags: `?test` (deterministic, exposes `window.__fly`, no auto sim), `?time=2026-10-19T02:00:00Z`, `?spawn=lat,lon,yaw`, `?quality=low|medium|high`, `?room=CODE`.

## World

- `public/data/city.bin`: all 172,368 DataSF building footprints (2010 LiDAR heights, ground elevation), delta-encoded int16 at 0.5 m. Built by `scripts/build-city.mjs`.
- `public/data/terrain.bin`: 16 m heightmap with bathymetry from AWS terrain tiles (z13). Water is `y < 0`. Built by `scripts/build-terrain.mjs`.
- Local coordinates: meters, `x` east, `z` south (north is `-z`), `y` up. `src/core/geo.ts` converts.
- City meshes are built in a worker (`src/world/city-worker.ts`) in 500 m chunks; the shader adds windows and lights them at night.
- Known data gap: heights are from 2010, so towers built later (Salesforce Tower, 181 Fremont, Park Tower...) are missing or wrong. `R-SKYLINE` tracks the fix.

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
- Every external feed (weather, transit, planes, quakes) must work offline with a fallback; tests block the network.
- No new runtime dependency without a reason that a few lines of code cannot cover.

## Shared contracts

### Settings keys (`game.save.data.settings`)

Every team reads and writes these exact keys; the settings panel (UI team) edits them, then calls `game.save.persist()`.

| Key | Type | Default | Used by |
|---|---|---|---|
| `quality` | `'auto' \| 'low' \| 'medium' \| 'high'` | `'auto'` | renderer (applied on reload) |
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
- `game.sky.fogDensity` (1 = normal, 3 = thick Karl): live weather writes it.
- `game.timeScale`, `game.clockOffset`: time-of-day controls.
- `game.activities.start(id)`, `.position(def)`, `.locked(def)`, `.nearby`, `.active`.
- `game.toast(text, kind)`, `game.bus.on/emit`.

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
