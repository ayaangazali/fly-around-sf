import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { toLocal, EXTENT } from '../src/core/geo.ts';

const CACHE = new URL('../.cache/', import.meta.url);
const DATA = new URL('../public/data/', import.meta.url);
const Q = 2;
const LIMIT = 15000;

export const SOURCES = {
  streets: 'https://data.sf.gov/d/3psu-pn9h',
  parks: 'https://data.sf.gov/d/gtr9-ntp6',
  trees: 'https://data.sf.gov/d/tkzw-k3nq',
  landcover: 'https://www.openstreetmap.org/copyright',
  stars: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50',
  embarcaderoPalms: 'https://www.cbsnews.com/sanfrancisco/news/diseased-palm-trees-along-san-franciscos-embarcadero-to-undergo-costly-removal-replacement/',
};

async function cached(name, load) {
  const file = new URL(name, CACHE);
  if (existsSync(file)) return readFile(file);
  const buf = Buffer.from(await load());
  await writeFile(file, buf);
  return buf;
}

async function get(url, init) {
  const res = await fetch(url, { headers: { 'User-Agent': 'fly-around-sf-build/1.0', Accept: '*/*' }, ...init });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

async function socrata(id, params, name) {
  const rows = [];
  for (let offset = 0; ; offset += 50000) {
    const q = new URLSearchParams({ ...params, $limit: '50000', $offset: String(offset), $order: ':id' });
    const page = JSON.parse(await cached(`${name}-${offset}.json`, () => get(`https://data.sf.gov/resource/${id}.json?${q}`)));
    rows.push(...page);
    if (page.length < 50000) return rows;
  }
}

const local = ([lon, lat]) => {
  const { x, z } = toLocal(lat, lon);
  return [x, z];
};
const inside = ([x, z]) => Math.abs(x) < LIMIT && Math.abs(z) < LIMIT;

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - dz * (a[0] - p[0])) / len;
}

function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) [max, idx] = [d, i];
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol));
}

function quantize(pts) {
  const q = pts.map(([x, z]) => [Math.round(x * Q), Math.round(z * Q)]);
  return q.filter((p, i) => i === 0 || p[0] !== q[i - 1][0] || p[1] !== q[i - 1][1]);
}

function clipRing(ring, minX, minZ, maxX, maxZ) {
  const edges = [
    [(p) => p[0] >= minX, (a, b) => [minX, a[1] + ((b[1] - a[1]) * (minX - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= maxX, (a, b) => [maxX, a[1] + ((b[1] - a[1]) * (maxX - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= minZ, (a, b) => [a[0] + ((b[0] - a[0]) * (minZ - a[1])) / (b[1] - a[1]), minZ]],
    [(p) => p[1] <= maxZ, (a, b) => [a[0] + ((b[0] - a[0]) * (maxZ - a[1])) / (b[1] - a[1]), maxZ]],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      if (inside(a)) {
        out.push(a);
        if (!inside(b)) out.push(cut(a, b));
      } else if (inside(b)) out.push(cut(a, b));
    }
    if (out.length < 3) return null;
  }
  return out;
}

function writeInts(name, magic, count, ints) {
  const buf = new ArrayBuffer(8 + ints.length * 2);
  new Uint8Array(buf, 0, 4).set([...magic].map((c) => c.charCodeAt(0)));
  new DataView(buf).setUint32(4, count, true);
  new Int16Array(buf, 8).set(ints);
  return writeFile(new URL(name, DATA), new Uint8Array(buf)).then(() => buf.byteLength);
}

const BOULEVARDS = new Set(['MARKET ST', 'VAN NESS AVE', 'SOUTH VAN NESS AVE', 'THE EMBARCADERO', 'GEARY BLVD', '19TH AVE', 'GREAT HWY', 'SUNSET BLVD', 'PARK PRESIDIO BLVD', 'DOLORES ST', 'OCTAVIA BLVD']);
const SKIP_LAYERS = new Set(['PAPER', 'PAPER_FWYS', 'PAPER_WATER', 'PSEUDO', 'UPROW', 'PRIVATE_PARKING']);

function streetClass(r) {
  const code = Number(r.classcode);
  if (r.layer === 'STREETS_PEDESTRI') return 0;
  if (code === 1 || code === 6) return code;
  if (BOULEVARDS.has(r.streetname)) return 7;
  return code >= 2 && code <= 5 ? code : 5;
}

async function buildStreets() {
  const rows = await socrata('3psu-pn9h', { $select: 'cnn,streetname,classcode,layer,f_node_cnn,t_node_cnn,line', $where: 'active=true' }, 'streets');
  const segs = [];
  for (const r of rows) {
    if (!r.line || SKIP_LAYERS.has(r.layer)) continue;
    const pts = r.line.coordinates.map(local);
    if (pts.length < 2 || !pts.every(inside)) continue;
    segs.push({ name: r.streetname ?? '', cls: streetClass(r), a: r.f_node_cnn, b: r.t_node_cnn, pts, used: false });
  }
  const byNode = new Map();
  for (const s of segs) for (const n of [s.a, s.b]) byNode.set(`${s.name}|${s.cls}|${n}`, [...(byNode.get(`${s.name}|${s.cls}|${n}`) ?? []), s]);
  const next = (s, node) => (byNode.get(`${s.name}|${s.cls}|${node}`) ?? []).find((o) => !o.used && o !== s && (byNode.get(`${s.name}|${s.cls}|${node}`) ?? []).length === 2);
  const lines = [];
  for (const s of segs) {
    if (s.used) continue;
    s.used = true;
    let pts = [...s.pts];
    let head = s.a;
    let tail = s.b;
    for (let o = next(s, tail), last = s; o; last = o, o = next(last, tail)) {
      o.used = true;
      const fwd = o.a === tail;
      pts = pts.concat((fwd ? o.pts : [...o.pts].reverse()).slice(1));
      tail = fwd ? o.b : o.a;
    }
    for (let o = next(s, head), last = s; o; last = o, o = next(last, head)) {
      o.used = true;
      const fwd = o.b === head;
      pts = (fwd ? o.pts : [...o.pts].reverse()).slice(0, -1).concat(pts);
      head = fwd ? o.a : o.b;
    }
    const q = quantize(simplify(pts, 0.5));
    if (q.length >= 2) lines.push({ cls: s.cls, name: s.name, q, pts });
  }
  const ints = [];
  for (const l of lines) {
    ints.push(l.cls, l.q.length);
    let px = 0;
    let pz = 0;
    for (const [x, z] of l.q) {
      ints.push(x - px, z - pz);
      [px, pz] = [x, z];
    }
  }
  const bytes = await writeInts('streets.bin', 'SFS1', lines.length, ints);
  const km = lines.reduce((s, l) => s + l.pts.slice(1).reduce((d, p, i) => d + Math.hypot(p[0] - l.pts[i][0], p[1] - l.pts[i][1]), 0), 0) / 1000;
  console.log(`streets: ${segs.length} segments -> ${lines.length} polylines, ${km.toFixed(0)} km, ${bytes} bytes`);
  return lines;
}

const GRASS = 1;
const WOOD = 2;
const SCRUB = 3;
const SAND = 4;
const LAKE = 5;

function osmClass(t) {
  if (t.natural === 'wood' || t.landuse === 'forest') return WOOD;
  if (t.natural === 'scrub' || t.natural === 'heath' || t.natural === 'grassland') return SCRUB;
  if (t.natural === 'beach' || t.natural === 'sand') return SAND;
  if (t.natural === 'water' && t.water !== 'river' && t.water !== 'canal') return LAKE;
  return GRASS;
}

function assemble(ways) {
  const open = ways.map((w) => w.map((p) => [...p]));
  const rings = [];
  while (open.length) {
    let ring = open.shift();
    let grew = true;
    while (grew && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
      grew = false;
      const end = ring.at(-1);
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        const same = (a, b) => a[0] === b[0] && a[1] === b[1];
        if (same(w[0], end)) ring = ring.concat(w.slice(1));
        else if (same(w.at(-1), end)) ring = ring.concat([...w].reverse().slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function polyArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a / 2);
}

async function buildGreen() {
  const bbox = '37.695,-122.53,37.84,-122.33';
  const query = `[out:json][timeout:180];(
    way["natural"~"^(wood|scrub|heath|grassland|beach|sand|water)$"](${bbox});
    relation["natural"~"^(wood|scrub|heath|grassland|beach|sand|water)$"](${bbox});
    way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|village_green)$"](${bbox});
    relation["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"](${bbox});
    way["leisure"~"^(park|golf_course|garden|pitch)$"](${bbox});
    relation["leisure"~"^(park|golf_course|garden)$"](${bbox});
  );out geom;`;
  const osm = JSON.parse(await cached('osm-green.json', () => get('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) })));
  const polys = [];
  const toLocalRing = (geom) => geom.map((g) => local([g.lon, g.lat]));
  for (const el of osm.elements) {
    const t = el.tags ?? {};
    if (t.surface === 'artificial_turf' || (t.leisure === 'pitch' && t.surface && t.surface !== 'grass')) continue;
    const cls = osmClass(t);
    let outer = [];
    let inner = [];
    if (el.type === 'way' && el.geometry) outer = [toLocalRing(el.geometry)];
    else if (el.type === 'relation') {
      const members = el.members.filter((m) => m.type === 'way' && m.geometry);
      outer = assemble(members.filter((m) => m.role !== 'inner').map((m) => toLocalRing(m.geometry)));
      inner = assemble(members.filter((m) => m.role === 'inner').map((m) => toLocalRing(m.geometry)));
    }
    if (cls === LAKE && outer.reduce((a, r) => a + polyArea(r), 0) > 4e6) continue;
    for (const o of outer) polys.push({ cls, rings: [o, ...inner.filter((r) => r.length && pointInRing(r[0], o))] });
  }
  const parks = await socrata('gtr9-ntp6', { $select: 'property_name,propertytype,shape' }, 'parks');
  let rpd = 0;
  for (const p of parks) {
    if (!p.shape || /Library|Family Camp|Non-Park|Concession/.test(p.propertytype ?? '')) continue;
    for (const poly of p.shape.coordinates) {
      polys.push({ cls: GRASS, rings: poly.map((r) => r.map(local)) });
      rpd++;
    }
  }
  const order = [GRASS, SCRUB, WOOD, SAND, LAKE];
  polys.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
  const ints = [];
  let count = 0;
  const m = 200;
  for (const p of polys) {
    const clipped = p.rings.map((r) => {
      const c = clipRing(r, EXTENT.minX - m, EXTENT.minZ - m, EXTENT.maxX + m, EXTENT.maxZ + m);
      const q = c && quantize(simplify([...c, c[0]], 1)).slice(0, -1);
      return q && q.length >= 3 ? q : null;
    });
    if (!clipped[0] || polyArea(clipped[0]) < 40 * Q * Q) continue;
    const rings = clipped.filter(Boolean);
    ints.push(p.cls, rings.length);
    for (const r of rings) {
      ints.push(r.length);
      let px = 0;
      let pz = 0;
      for (const [x, z] of r) {
        ints.push(x - px, z - pz);
        [px, pz] = [x, z];
      }
    }
    count++;
  }
  const bytes = await writeInts('green.bin', 'SFG1', count, ints);
  const tally = Object.fromEntries(order.map((c) => [c, polys.filter((p) => p.cls === c).length]));
  console.log(`green: ${osm.elements.length} OSM elements + ${rpd} RPD polygons -> ${count} polygons ${JSON.stringify(tally)}, ${bytes} bytes`);
}

function pointInRing([x, z], ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export const TREE = { broadleaf: 0, conifer: 1, eucalyptus: 2, palm: 3 };
export const TINT = { green: 0, dark: 1, purple: 2, cherry: 3, gray: 4, fallRed: 5, fallYellow: 6, jacaranda: 7, redBloom: 8 };

function treeKind(species) {
  const s = species.toLowerCase();
  if (/palm|phoenix|washingtonia|syagrus|trachycarpus|archontophoenix|brahea|butia|chamaerops|cordyline|dracaena|livistona/.test(s)) return TREE.palm;
  if (/eucalyptus|corymbia/.test(s)) return TREE.eucalyptus;
  if (/cupressus|pinus|juniper|sequoia|cedrus|araucaria|podocarpus|afrocarpus|cryptomeria|thuja|chamaecyparis|abies|picea|taxus|cypress|pine/.test(s)) return TREE.conifer;
  return TREE.broadleaf;
}

function treeTint(species) {
  const s = species.toLowerCase();
  if (/prunus cerasifera|purple|copper beech/.test(s)) return TINT.purple;
  if (/prunus serrulata|kwanzan|flowering cherry|ornamental cherry|malus|crabapple/.test(s)) return TINT.cherry;
  if (/jacaranda/.test(s)) return TINT.jacaranda;
  if (/metrosideros|callistemon|corymbia ficifolia|erythrina|bottlebrush/.test(s)) return TINT.redBloom;
  if (/liquidambar|pistacia|acer |pyrus calleryana|crataegus|nyssa|quercus rubra|lagerstroemia/.test(s)) return TINT.fallRed;
  if (/ginkgo|platanus|ulmus|betula|fraxinus|tilia|gleditsia|zelkova|celtis|populus|robinia/.test(s)) return TINT.fallYellow;
  if (/olea|eucalyptus|acacia|melaleuca|leptospermum|olive|agonis|maytenus/.test(s)) return TINT.gray;
  if (/magnolia|ficus|pittosporum|laurus|lophostemon|tristaniopsis|myoporum|schinus|quercus agrifolia|arbutus/.test(s)) return TINT.dark;
  return TINT.green;
}

function treeHeight(kind, dbhInches) {
  const d = Number.isFinite(dbhInches) && dbhInches > 0 ? Math.min(60, dbhInches) : 8;
  if (kind === TREE.palm) return Math.min(18, 5 + d * 0.45);
  if (kind === TREE.eucalyptus) return Math.min(30, 7 + d * 0.6);
  if (kind === TREE.conifer) return Math.min(24, 5 + d * 0.5);
  return Math.min(16, 3.5 + d * 0.38);
}

function embarcaderoPalms(lines) {
  const parts = lines.filter((l) => l.name === 'THE EMBARCADERO' && l.cls === 7);
  const market = toLocal(37.7955, -122.3937);
  const north = parts.flatMap((l) => l.pts).filter(([x, z]) => z < market.z + 40);
  if (!north.length) return [];
  north.sort((a, b) => a[0] - b[0]);
  const path = [north[0]];
  const rest = north.slice(1);
  while (rest.length) {
    const last = path.at(-1);
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (Math.hypot(rest[i][0] - last[0], rest[i][1] - last[1]) < Math.hypot(rest[best][0] - last[0], rest[best][1] - last[1])) best = i;
    path.push(rest.splice(best, 1)[0]);
  }
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lens.at(-1);
  const out = [];
  for (let k = 0; k < 222; k++) {
    const d = ((k + 0.5) / 222) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const t = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    out.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]);
  }
  return out;
}

async function buildTrees(lines) {
  const rows = await socrata('tkzw-k3nq', { $select: 'species,latitude,longitude,mapdbh', $where: 'latitude IS NOT NULL' }, 'trees');
  const trees = [];
  for (const r of rows) {
    const sp = r.species ?? '';
    if (/planting site|^none|stump|vacant/i.test(sp)) continue;
    const p = local([Number(r.longitude), Number(r.latitude)]);
    if (!Number.isFinite(p[0]) || p[0] < EXTENT.minX || p[0] > EXTENT.maxX || p[1] < EXTENT.minZ || p[1] > EXTENT.maxZ) continue;
    const kind = treeKind(sp);
    trees.push({ p, kind, h: treeHeight(kind, Number(r.mapdbh)), tint: treeTint(sp) });
  }
  const palms = embarcaderoPalms(lines);
  for (const p of palms) trees.push({ p, kind: TREE.palm, h: 13, tint: TINT.green });
  trees.sort((a, b) => a.p[0] - b.p[0]);
  const n = trees.length;
  const buf = new ArrayBuffer(8 + n * 7 + ((8 + n * 4) % 2));
  new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x54, 0x52]);
  new DataView(buf).setUint32(4, n, true);
  const xz = new Int16Array(buf, 8, n * 2);
  const meta = new Uint8Array(buf, 8 + n * 4, n * 3);
  trees.forEach((t, i) => {
    xz[i * 2] = Math.round(t.p[0] * Q);
    xz[i * 2 + 1] = Math.round(t.p[1] * Q);
    meta[i] = t.kind;
    meta[n + i] = Math.round(t.h * 4);
    meta[2 * n + i] = t.tint;
  });
  await writeFile(new URL('trees.bin', DATA), new Uint8Array(buf));
  const kinds = Object.keys(TREE).map((k) => `${k}=${trees.filter((t) => t.kind === TREE[k]).length}`).join(' ');
  console.log(`trees: ${rows.length} rows -> ${n} trees (${kinds}), embarcadero palms=${palms.length}, ${buf.byteLength} bytes`);
}

async function buildStars() {
  const raw = gunzipSync(await cached('bsc5.gz', () => get('https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz'))).toString('latin1');
  const stars = [];
  for (const line of raw.split('\n')) {
    const vmag = Number(line.slice(102, 107));
    if (line.length < 107 || !line.slice(75, 77).trim() || !Number.isFinite(vmag) || line.slice(102, 107).trim() === '' || vmag > 5) continue;
    const ra = ((Number(line.slice(75, 77)) + Number(line.slice(77, 79)) / 60 + Number(line.slice(79, 83)) / 3600) * 15 * Math.PI) / 180;
    const dec = ((line[83] === '-' ? -1 : 1) * (Number(line.slice(84, 86)) + Number(line.slice(86, 88)) / 60 + Number(line.slice(88, 90)) / 3600) * Math.PI) / 180;
    const bv = line.slice(109, 114).trim() ? Number(line.slice(109, 114)) : 0.6;
    stars.push([ra, dec, vmag, bv]);
  }
  const buf = new ArrayBuffer(8 + stars.length * 16);
  new Uint8Array(buf, 0, 4).set([0x53, 0x46, 0x53, 0x54]);
  new DataView(buf).setUint32(4, stars.length, true);
  new Float32Array(buf, 8).set(stars.flat());
  await writeFile(new URL('stars.bin', DATA), new Uint8Array(buf));
  console.log(`stars: ${stars.length} brighter than magnitude 5, ${buf.byteLength} bytes`);
}

await mkdir(CACHE, { recursive: true });
const lines = await buildStreets();
await buildGreen();
await buildTrees(lines);
await buildStars();
