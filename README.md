# Fly Around SF

Fly a tiny drone around a 3D San Francisco built from all 172,368 real buildings in the city's own footprint data, on top of real terrain and bay depth. Collect landmark and startup cards, chase clues, race rings, and fly with friends.

**Play:** https://ayaangazali.github.io/fly-around-sf/

## Controls

| Key | Does |
|---|---|
| W / S | forward / back |
| A / D | turn |
| Q / E | slide sideways |
| Space / Shift | up / down |
| R (hold) | boost |
| F | start the activity you are next to |
| V | camera view |
| Esc | menu |

Gamepads and touch screens work too.

## How it is built and tested

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Every hard requirement in [requirements.json](requirements.json) is tied to tests, and CI publishes the site only when every requirement passes.

## Data

- Buildings: [DataSF Building Footprints](https://data.sf.gov/d/ynuv-fyni) (City and County of San Francisco).
- Terrain and bathymetry: [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen, USGS, NOAA and others).

## Planning notes

`IDEAS.md` (100 ideas) and `QUESTIONS.md` (design questions with chosen defaults) record how the game was scoped. Decisions: stylized low-poly look, cozy exploring with a mystery spine, whole city, drone first, serverless P2P multiplayer with proximity voice, real company names without logos, handwritten lore now with a ready-to-deploy Cloudflare proxy for live AI later.
