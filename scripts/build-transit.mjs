import { mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { toLocal } from '../src/core/geo.ts';

const CACHE = new URL('../.cache/', import.meta.url);
const OUT = new URL('../public/data/transit.json', import.meta.url);

const FEEDS = [
  {
    id: 'muni',
    url: 'https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip',
    agency: 'SFMTA',
    routes: {
      PH: { name: 'Powell-Hyde', mode: 'cable' },
      PM: { name: 'Powell-Mason', mode: 'cable' },
      CA: { name: 'California', mode: 'cable' },
      F: { name: 'F Market & Wharves', mode: 'streetcar' },
      1: { name: '1 California', mode: 'bus' },
      5: { name: '5 Fulton', mode: 'bus' },
      14: { name: '14 Mission', mode: 'bus' },
      22: { name: '22 Fillmore', mode: 'bus' },
      30: { name: '30 Stockton', mode: 'bus' },
      38: { name: '38 Geary', mode: 'bus' },
      39: { name: '39 Coit', mode: 'bus' },
    },
  },
  {
    id: 'ggt',
    url: 'https://realtime.goldengate.org/gtfsstatic/GTFSTransitData.zip',
    agency: 'Golden Gate Ferry',
    routes: {
      'LSSF-271': { name: 'Larkspur Ferry', mode: 'ferry' },
      'SSSF-271': { name: 'Sausalito Ferry', mode: 'ferry' },
      'TBSF-271': { name: 'Tiburon Ferry', mode: 'ferry' },
      'AISF-271': { name: 'Angel Island Ferry', mode: 'ferry' },
    },
  },
  {
    id: 'sfbf',
    url: 'https://gtfs.sanfranciscobayferry.com/gtfs.zip',
    agency: 'San Francisco Bay Ferry',
    routes: {
      11114: { name: 'Oakland & Alameda Ferry', mode: 'ferry' },
      11113: { name: 'Harbor Bay Ferry', mode: 'ferry' },
      11112: { name: 'South San Francisco Ferry', mode: 'ferry' },
      11110: { name: 'Vallejo Ferry', mode: 'ferry' },
      12419: { name: 'Richmond Ferry', mode: 'ferry' },
    },
  },
];

const COLORS = { cable: '#b8312f', streetcar: '#e3a72f', bus: '#d8d3c4', ferry: '#f4f1ea' };
const TOLERANCE = { cable: 1, streetcar: 1.5, bus: 2, ferry: 12 };
const DAYS = { wkd: 3, sat: 6, sun: 0 };

function splitCsv(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') cur += c, i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  const [head, ...rows] = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const cols = splitCsv(head).map((c) => c.trim());
  return rows.map((r) => Object.fromEntries(splitCsv(r).map((v, i) => [cols[i], v.trim()])));
}

async function eachCsv(file, fn) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let cols = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line) continue;
    const v = splitCsv(line);
    if (!cols) cols = Object.fromEntries(v.map((c, i) => [c.trim(), i]));
    else fn(v, cols);
  }
}

const secs = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const parseYmd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));

function activeServices(calendar, dates, day) {
  const key = ymd(day);
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day.getUTCDay()];
  const on = new Set(calendar.filter((c) => c[dow] === '1' && c.start_date <= key && c.end_date >= key).map((c) => c.service_id));
  for (const d of dates.filter((d) => d.date === key)) d.exception_type === '1' ? on.add(d.service_id) : on.delete(d.service_id);
  return on;
}

function referenceDay(calendar, dates, dow, today) {
  const keys = [...calendar.flatMap((c) => [c.start_date, c.end_date]), ...dates.map((d) => d.date)].sort();
  const days = [];
  for (let d = parseYmd(keys[0]); ymd(d) <= keys.at(-1); d = new Date(d.getTime() + 86400000)) {
    if (d.getUTCDay() === dow && activeServices(calendar, dates, d).size) days.push(d);
  }
  return days.find((d) => d >= today) ?? days.at(-1);
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let best = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / len2));
      const d = Math.hypot(pts[i][0] - ax - t * dx, pts[i][1] - az - t * dz);
      if (d > best) (best = d), (idx = i);
    }
    if (best > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function project(pts, x, z) {
  let best = Infinity;
  let along = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const dx = pts[i][0] - ax;
    const dz = pts[i][1] - az;
    const len = Math.hypot(dx, dz);
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len))) : 0;
    const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
    if (d < best) (best = d), (along = acc + t * len);
    acc += len;
  }
  return { along, off: best };
}

async function loadFeed(feed, today) {
  const zip = new URL(`gtfs-${feed.id}.zip`, CACHE);
  const dir = new URL(`gtfs-${feed.id}/`, CACHE);
  if (!existsSync(zip)) {
    const res = await fetch(feed.url);
    if (!res.ok) throw new Error(`${feed.url}: HTTP ${res.status}`);
    await writeFile(zip, new Uint8Array(await res.arrayBuffer()));
  }
  if (!existsSync(new URL('trips.txt', dir))) execFileSync('unzip', ['-o', '-q', zip.pathname, '-d', dir.pathname]);
  const file = (n) => new URL(n, dir).pathname;
  const calendar = existsSync(file('calendar.txt')) ? readCsv(file('calendar.txt')) : [];
  const dates = existsSync(file('calendar_dates.txt')) ? readCsv(file('calendar_dates.txt')) : [];
  const services = Object.fromEntries(
    Object.entries(DAYS).map(([k, dow]) => {
      const day = referenceDay(calendar, dates, dow, today);
      console.log(`${feed.id} ${k}: ${ymd(day)}`);
      return [k, activeServices(calendar, dates, day)];
    }),
  );
  const trips = new Map();
  for (const t of readCsv(file('trips.txt'))) if (feed.routes[t.route_id]) trips.set(t.trip_id, { ...t, start: Infinity, end: -Infinity, stops: [] });
  await eachCsv(file('stop_times.txt'), (v, c) => {
    const t = trips.get(v[c.trip_id]);
    if (!t) return;
    const dep = secs(v[c.departure_time] || v[c.arrival_time]);
    const arr = secs(v[c.arrival_time] || v[c.departure_time]);
    t.start = Math.min(t.start, dep);
    t.end = Math.max(t.end, arr);
    t.stops.push(v[c.stop_id]);
  });
  const shapeIds = new Set([...trips.values()].map((t) => t.shape_id));
  const raw = new Map();
  await eachCsv(file('shapes.txt'), (v, c) => {
    const id = v[c.shape_id];
    if (!shapeIds.has(id)) return;
    if (!raw.has(id)) raw.set(id, []);
    raw.get(id).push([Number(v[c.shape_pt_sequence]), Number(v[c.shape_pt_lat]), Number(v[c.shape_pt_lon])]);
  });
  const stops = new Map(readCsv(file('stops.txt')).map((s) => [s.stop_id, s]));
  return { trips, raw, stops, services };
}

const sources = FEEDS.map((f) => f.url);
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
await mkdir(CACHE, { recursive: true });
const routes = [];
const stopNames = [];
const nameIndex = new Map();
const nameId = (n) => {
  if (!nameIndex.has(n)) nameIndex.set(n, stopNames.push(n) - 1);
  return nameIndex.get(n);
};

for (const feed of FEEDS) {
  const { trips, raw, stops, services } = await loadFeed(feed, today);
  for (const [routeId, meta] of Object.entries(feed.routes)) {
    const routeTrips = [...trips.values()].filter((t) => t.route_id === routeId && Number.isFinite(t.start));
    const used = new Map();
    const shapes = [];
    const shapeIndex = (id, sample) => {
      if (used.has(id)) return used.get(id);
      const pts = simplify(
        raw
          .get(id)
          .sort((a, b) => a[0] - b[0])
          .map(([, lat, lon]) => {
            const p = toLocal(lat, lon);
            return [p.x, p.z];
          }),
        TOLERANCE[meta.mode],
      ).map(([x, z]) => [Math.round(x), Math.round(z)]);
      const stopList = [];
      for (const sid of sample.stops) {
        const s = stops.get(sid);
        if (!s) continue;
        const p = toLocal(Number(s.stop_lat), Number(s.stop_lon));
        const { along, off } = project(pts, p.x, p.z);
        if (off < 80) stopList.push(nameId(s.stop_name.replace(/\s+/g, ' ')), Math.round(along));
      }
      shapes.push({ pts: pts.flat(), stops: stopList });
      used.set(id, shapes.length - 1);
      return shapes.length - 1;
    };
    const days = {};
    for (const [day, on] of Object.entries(services)) {
      const blocks = new Map();
      for (const t of routeTrips.filter((t) => on.has(t.service_id)).sort((a, b) => a.start - b.start)) {
        const key = t.block_id || t.trip_id;
        if (!blocks.has(key)) blocks.set(key, []);
        blocks.get(key).push(shapeIndex(t.shape_id, t), t.start, Math.max(60, t.end - t.start));
      }
      days[day] = [...blocks.values()].sort((a, b) => a[1] - b[1]);
    }
    const count = Object.values(days).reduce((n, b) => n + b.reduce((m, x) => m + x.length / 3, 0), 0);
    console.log(`${routeId} ${meta.name}: ${shapes.length} shapes, ${count} trips, ${days.wkd.length} weekday vehicles`);
    routes.push({ id: routeId, name: meta.name, mode: meta.mode, agency: feed.agency, color: COLORS[meta.mode], shapes, days });
  }
}

const out = { v: 1, generated: today.toISOString().slice(0, 10), sources, stopNames, routes };
await writeFile(OUT, JSON.stringify(out));
console.log(`wrote ${OUT.pathname}: ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
