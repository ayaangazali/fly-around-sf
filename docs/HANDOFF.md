# Handoff: Fly Around SF

Paused 2026-10-20 by the owner. This file is the starting point for the next agent.

## State

- Live: https://ayaangazali.github.io/fly-around-sf/ (deployed from `main` at 54abae1, CI green, 100/100 requirements).
- `main` is the v1 game: whole-city drone flight, 658 activities in 19 kinds, 228 cards, 27 hand-built landmarks, P2P multiplayer with proximity voice, phone and iPad support, save sync.
- CI (`.github/workflows/ci.yml`): unit job, six lite e2e shards plus full-city and full-perf jobs, ledger job (`scripts/check-ledger.mjs`), Pages deploy only when everything passes. About 35 minutes.
- Run locally: `pnpm install`, `pnpm dev`. Tests: `pnpm test:coverage`, `E2E_CITY_RADIUS=3000 pnpm e2e`, `pnpm ledger`. Architecture and rules: `docs/ARCHITECTURE.md`.

## What to do next: v2

The owner playtested the live build and wants a redesign. Read `docs/v2/owner-feedback.md` first: it has the verbatim feedback and the binding decisions. In short:

1. Zero drift at rest. Root cause: `stepFlight` in `src/player/flight.ts` adds wind to the target velocity.
2. Much faster flight: cruise >= 60 m/s (now 30), boost >= 150 m/s (now 62), supersonic >= 343 m/s, and warp (light speed) from the map.
3. One main objective, the Founder Trail: about 18 verified priority places in order. Land at each to get its card and a clue to the next stop. The HUD always shows the one current objective.
4. Side activities stay but are hidden by default (Settings > Show side activities). Card popups only for trail stops.
5. The tutorial: at most 5 steps, each completing from real key presses. The owner got stuck on the climb-then-descend step.
6. The map must work on the full city.
7. Buildings need color and realism. Trail stops need dedicated models with name signs (no logos). YC is at Pier 70, the buildings on 20th Street just east of the RH gallery.
8. Smooth on a laptop: an adaptive quality governor and LOD.
9. Two critical multiplayer security bugs: a silent peer that never says hi still gets mic, position and chat; room codes can be recovered from public relay traffic.

### Work in progress branches (unmerged, unverified)

Each branch starts from 54abae1. Agents were stopped mid-task, so the last commit on a branch may be a `WIP` commit. Review, finish, test and merge them one at a time.

| Branch | Scope |
|---|---|
| `v2/facts` | Verified trail stop research and content fact fixes |
| `v2/flight` | Drift fix, speed tiers, supersonic, warp handler, camera, gamepad |
| `v2/objective` | `trail` activity kind, HUD objective widget, `sideActivities` setting, card policy |
| `v2/ui` | Tutorial rewrite, slimmer menubar, a11y and touch fixes |
| `v2/map` | Map fix, trail stops on the map, Warp button |
| `v2/world` | City color and realism, LOD |
| `v2/buildings` | Trail stop models and signs (barely started) |
| `v2/perf` | Adaptive quality, per-frame CPU cuts, laptop perf test |
| `v2/net` | Multiplayer security fixes |

### Contracts the branches code against

- Trail activities use kind id `trail` with `params.order` (1..N). The current objective is the first not-done trail def by order.
- Setting `sideActivities` (boolean, default false), read with `settingsOf(game).sideActivities`.
- Bus event `'warp': { x: number; z: number; label: string }` (local meters). The map emits it; flight handles it.
- Trail stop buildings: `src/world/landmarks/trail-<stop id>.ts`, one per stop, exporting `landmark`.

### Acceptance criteria for v2 (the owner's complaints as tests)

- A1 HOLD: 15 s with no input on the real game loop with live wind moves the drone less than 1 m.
- A2 SPEED: cruise >= 60, boost >= 150, supersonic >= 343 m/s reachable within 5 s, with visible speed feedback.
- A3 WARP: warp from the map to any trail stop arrives within 3 s and within 60 m.
- A4 ONBOARD: the tutorial completes with real key presses and taps only, in at most 5 steps, ending at trail stop 1.
- A5 OBJECTIVE: exactly one objective always on the HUD with n/N, distance and arrow; the whole trail is finishable.
- A6 QUIET: by default no side-activity beacons, and no non-trail card popups on a 5 km downtown flight.
- A7 MAP: the map opens within 1 s on the full city and shows the city, the player, trail stops and the objective.
- A8 COLOR: varied realistic building colors and roofs (before and after screenshots).
- A9 PRIORITY: every trail stop has a recognizable model and a sign readable from 300 m.
- A10 SMOOTH: full city, auto quality, 4x CPU throttle: median frame time at most 33 ms, no frame over 200 ms during 30 s of supersonic flight.

### Other open findings

`docs/v2/review-findings.json` holds 57 findings from the last review round, grouped by team (facts, net, flight, objective, ui, map, world, buildings). Each has evidence, a file hint and a fix hint. Some may already be fixed on the branches above.

## Rules

- Commits as `ayaangazali <ayaangazali.work@gmail.com>`. No em dashes in shipped text. Real names, own art, no logos.
- Every hard requirement needs a test whose title carries `[R-ID]`; the ledger fails CI otherwise.
- Keep the initial JS under 450 KB gzip (about 420 KB now).
