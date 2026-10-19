import type { FeedSpec } from './feed';

export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number;
  lat: number;
  lon: number;
  depth: number;
  url: string;
  km: number;
}

export const SF = { lat: 37.7749, lon: -122.4194 };
export const QUAKE_RADIUS_KM = 100;
export const ALERT_MAG = 2.5;

export const quakeSpec: FeedSpec<Quake[]> = {
  id: 'quakes',
  label: 'Earthquakes',
  url: (now) =>
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${SF.lat}&longitude=${SF.lon}&maxradiuskm=${QUAKE_RADIUS_KM}&orderby=time&limit=20&starttime=${new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10)}`,
  parse: parseQuakes,
  ttl: 2 * 60_000,
  maxAge: 7 * 86400_000,
  minInterval: 2 * 60_000,
  failBackoff: 5 * 60_000,
};

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

export function parseQuakes(json: unknown): Quake[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error('quakes: no features');
  const out: Quake[] = [];
  for (const f of features as { id?: unknown; properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }[]) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (typeof f.id !== 'string' || typeof p.mag !== 'number' || typeof p.time !== 'number' || !Array.isArray(c)) continue;
    const [lon, lat, depth] = c as number[];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const km = haversineKm(SF.lat, SF.lon, lat, lon);
    if (km > QUAKE_RADIUS_KM) continue;
    out.push({ id: f.id, mag: p.mag, place: typeof p.place === 'string' ? p.place : 'Bay Area', time: p.time, lat, lon, depth: Number(depth) || 0, url: typeof p.url === 'string' ? p.url : '', km });
  }
  return out.sort((a, b) => b.time - a.time);
}

export function newQuakes(seen: Set<string>, list: Quake[], since: number): Quake[] {
  const fresh = list.filter((q) => !seen.has(q.id) && q.time >= since);
  for (const q of list) seen.add(q.id);
  return fresh;
}

export function shakeFor(q: Pick<Quake, 'mag' | 'km'>): number {
  return Math.min(2.5, Math.max(0.25, 10 ** (0.5 * q.mag) / (8 + q.km) / 2));
}
