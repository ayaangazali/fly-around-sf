export interface SfTime {
  month: number;
  day: number;
  dow: number;
  hour: number;
  secs: number;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });

export function sfTime(d: Date): SfTime {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { month: Number(p.month), day: Number(p.day), dow: DOW[p.weekday], hour, secs: hour * 3600 + Number(p.minute) * 60 + Number(p.second) };
}

export function sfClock(d: Date): string {
  return clock.format(d).replace(/\s?([AP])M/, (_, a: string) => ` ${a.toLowerCase()}m`);
}

export function ago(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function compass(deg: number): string {
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
