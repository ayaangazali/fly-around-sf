import type { FeedSpec } from './feed';
import { sfTime } from './sf-time';

export interface WeatherSample {
  t: number;
  temp: number;
  code: number;
  lowCloud: number;
  vis: number;
  wind: number;
  dir: number;
  gust: number;
}

const FIELDS = ['temperature_2m', 'weather_code', 'cloud_cover_low', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] as const;
const HOUR = 3600_000;
export const WIND_SCALE = 0.5;
export const MAX_WIND = 7;

export const weatherSpec: FeedSpec<WeatherSample[]> = {
  id: 'weather',
  label: 'Weather',
  url: () => `https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&hourly=${FIELDS.join(',')}&wind_speed_unit=ms&timezone=GMT&past_days=1&forecast_days=2`,
  parse: parseWeather,
  ttl: 20 * 60_000,
  maxAge: 36 * HOUR,
  minInterval: 10 * 60_000,
  failBackoff: 5 * 60_000,
};

export function parseWeather(json: unknown): WeatherSample[] {
  const h = (json as { hourly?: Record<string, unknown> } | null)?.hourly;
  const time = h?.time;
  if (!h || !Array.isArray(time)) throw new Error('weather: no hourly block');
  const cols = FIELDS.map((f) => {
    const c = h[f];
    if (!Array.isArray(c) || c.length !== time.length) throw new Error(`weather: bad ${f}`);
    return c as unknown[];
  });
  const out: WeatherSample[] = [];
  time.forEach((ts, i) => {
    const v = cols.map((c) => c[i]);
    const t = Date.parse(`${String(ts)}Z`);
    if (!Number.isFinite(t) || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) return;
    const [temp, code, lowCloud, vis, wind, dir, gust] = v as number[];
    out.push({ t, temp, code, lowCloud, vis, wind, dir, gust: Math.max(gust, wind) });
  });
  if (!out.length) throw new Error('weather: empty');
  return out.sort((a, b) => a.t - b.t);
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function sampleAt(samples: WeatherSample[], ms: number): WeatherSample | null {
  if (!samples.length || ms < samples[0].t - 3 * HOUR || ms > samples[samples.length - 1].t + 3 * HOUR) return null;
  let i = 0;
  while (i < samples.length - 1 && samples[i + 1].t <= ms) i++;
  const a = samples[i];
  const b = samples[Math.min(i + 1, samples.length - 1)];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (ms - a.t) / (b.t - a.t))) : 0;
  const turn = ((((b.dir - a.dir) % 360) + 540) % 360) - 180;
  return {
    t: ms,
    temp: lerp(a.temp, b.temp, k),
    code: k < 0.5 ? a.code : b.code,
    lowCloud: lerp(a.lowCloud, b.lowCloud, k),
    vis: lerp(a.vis, b.vis, k),
    wind: lerp(a.wind, b.wind, k),
    dir: (((a.dir + turn * k) % 360) + 360) % 360,
    gust: lerp(a.gust, b.gust, k),
  };
}

const MARINE_LAYER = [0, 0.05, 0.1, 0.3, 0.6, 0.9, 1, 1, 0.7, 0.3, 0.1, 0];
const MEAN_TEMP = [11, 12, 13, 13, 14, 15, 15, 16, 17, 16, 13, 11];

export function climate(date: Date): WeatherSample {
  const { month, hour } = sfTime(date);
  const summer = MARINE_LAYER[month - 1];
  const breeze = 0.5 - 0.5 * Math.cos((2 * Math.PI * (hour - 4)) / 24);
  const foggyHours = hour <= 10 || hour >= 19;
  const wind = 2 + (2 + 3 * summer) * breeze;
  const vis = summer > 0.6 && foggyHours ? 1500 : 20000;
  const lowCloud = summer * (foggyHours ? 95 : 35);
  return {
    t: date.getTime(),
    temp: MEAN_TEMP[month - 1] + 2.5 * (breeze - 0.5),
    code: vis < 2000 ? 45 : lowCloud > 80 ? 3 : lowCloud > 30 ? 2 : 1,
    lowCloud,
    vis,
    wind,
    dir: 270 - 20 * (1 - breeze),
    gust: wind * 1.6,
  };
}

export function fogDensity(s: WeatherSample): number {
  const v = Math.log(20000 / Math.min(20000, Math.max(300, s.vis))) / Math.log(20000 / 300);
  const fog = 1 + 2 * v + 0.4 * (s.lowCloud / 100) ** 2;
  return Math.min(3, Math.max(s.code === 45 || s.code === 48 ? 2.6 : 1, fog));
}

export function gustFactor(t: number): number {
  return 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
}

export function windVector(s: WeatherSample, agl: number, t: number): { x: number; z: number } {
  const speed = s.wind + (s.gust - s.wind) * gustFactor(t);
  const height = Math.min(1.6, Math.max(0.6, (Math.max(agl, 2) / 10) ** 0.25));
  const m = Math.min(MAX_WIND, speed * WIND_SCALE * height);
  const to = ((s.dir + 180) * Math.PI) / 180;
  return { x: Math.sin(to) * m, z: -Math.cos(to) * m };
}

export function describe(code: number): { text: string; icon: string } {
  if (code === 0) return { text: 'Clear', icon: '☀️' };
  if (code === 1) return { text: 'Mostly clear', icon: '🌤️' };
  if (code === 2) return { text: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { text: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { text: 'Fog', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: '🌦️' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { text: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { text: 'Snow', icon: '🌨️' };
  if (code >= 95) return { text: 'Thunderstorm', icon: '⛈️' };
  return { text: 'Cloudy', icon: '☁️' };
}

export function fogLabel(density: number): string {
  return density < 1.3 ? 'Clear air' : density < 1.8 ? 'Hazy' : density < 2.4 ? 'Fog rolling in' : 'Karl is here';
}
