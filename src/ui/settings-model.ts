import type { Game } from '../game';
import type { SaveData } from '../core/save';
import { sunPosition } from '../core/sun';
import { ORIGIN } from '../core/geo';

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';
export type TimeMode = 'real' | 'golden' | 'noon' | 'night';

export interface Settings {
  quality: QualitySetting;
  units: 'metric' | 'imperial';
  volMaster: number;
  volMusic: number;
  volSfx: number;
  volVoice: number;
  muted: boolean;
  reducedMotion: boolean;
  turnSpeed: number;
  timeMode: TimeMode;
  playerName: string;
  droneColor: string;
  showFps: boolean;
  aiProxyUrl: string;
  minimap: boolean;
  sideActivities: boolean;
}

export type SettingKey = keyof Settings;

declare module '../core/bus' {
  interface GameEvents {
    'settings:change': { key: SettingKey; value: Settings[SettingKey] };
  }
}

export const DEFAULTS: Omit<Settings, 'playerName' | 'reducedMotion'> = {
  quality: 'auto',
  units: 'metric',
  volMaster: 0.8,
  volMusic: 0.5,
  volSfx: 0.8,
  volVoice: 1,
  muted: false,
  turnSpeed: 1,
  timeMode: 'real',
  droneColor: '#f2f2ee',
  showFps: false,
  aiProxyUrl: '',
  minimap: true,
  sideActivities: false,
};

export const DRONE_COLORS = ['#f2f2ee', '#ff6a3d', '#ffc15e', '#7de0a6', '#5fb4ff', '#b48cff', '#ff7eb6', '#2b2f36'];

const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T => (opts.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) : '';
}

export function cleanColor(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}

export function randomPilotName(rand = Math.random): string {
  return `Pilot-${String(Math.floor(rand() * 9000) + 1000)}`;
}

export function readSettings(save: SaveData, osReducedMotion = false): Settings {
  const s = save.settings;
  return {
    quality: oneOf(s.quality, ['auto', 'low', 'medium', 'high'], DEFAULTS.quality),
    units: oneOf(s.units, ['metric', 'imperial'], DEFAULTS.units),
    volMaster: num(s.volMaster, 0, 1, DEFAULTS.volMaster),
    volMusic: num(s.volMusic, 0, 1, DEFAULTS.volMusic),
    volSfx: num(s.volSfx, 0, 1, DEFAULTS.volSfx),
    volVoice: num(s.volVoice, 0, 1, DEFAULTS.volVoice),
    muted: bool(s.muted, DEFAULTS.muted),
    reducedMotion: bool(s.reducedMotion, osReducedMotion),
    turnSpeed: num(s.turnSpeed, 0.5, 1.5, DEFAULTS.turnSpeed),
    timeMode: oneOf(s.timeMode, ['real', 'golden', 'noon', 'night'], DEFAULTS.timeMode),
    playerName: cleanName(s.playerName) || 'Pilot',
    droneColor: cleanColor(s.droneColor) ?? DEFAULTS.droneColor,
    showFps: bool(s.showFps, DEFAULTS.showFps),
    aiProxyUrl: typeof s.aiProxyUrl === 'string' && /^https:\/\/\S+$/.test(s.aiProxyUrl) ? s.aiProxyUrl : '',
    minimap: bool(s.minimap, DEFAULTS.minimap),
    sideActivities: bool(s.sideActivities, DEFAULTS.sideActivities),
  };
}

export function sanitize<K extends SettingKey>(key: K, value: Settings[K]): Settings[K] {
  if (key === 'playerName') return (cleanName(value) || randomPilotName()) as Settings[K];
  const out = readSettings({ settings: { [key]: value } } as unknown as SaveData)[key];
  if (key === 'aiProxyUrl' && value !== '' && out === '') throw new Error('Use an https:// address');
  return out;
}

const STEP = 5 * 60_000;
const DEG = Math.PI / 180;

export function timeModeOffset(mode: TimeMode, now: number, altitude = (t: number) => sunPosition(new Date(t), ORIGIN.lat, ORIGIN.lon).altitude): number {
  if (mode === 'real') return 0;
  let best = 0;
  let bestScore = Infinity;
  for (let o = -12 * 3_600_000; o <= 12 * 3_600_000; o += STEP) {
    const a = altitude(now + o);
    let score: number;
    if (mode === 'noon') score = -a;
    else if (mode === 'night') score = a < -18 * DEG ? Math.abs(o) : Infinity;
    else score = a > 2 * DEG && a < 5 * DEG && altitude(now + o + STEP) < a ? Math.abs(o) : Infinity;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function osReducedMotion(): boolean {
  return !!reducedQuery?.matches;
}

export function settingsOf(game: Game): Settings {
  return readSettings(game.save.data, osReducedMotion());
}

const appliedOffset = new WeakMap<Game, number>();

export function applySettings(game: Game, keys?: SettingKey[]): void {
  const s = settingsOf(game);
  const has = (k: SettingKey) => !keys || keys.includes(k);
  if (has('turnSpeed')) game.env.turnRate = s.turnSpeed;
  if (has('timeMode')) {
    const prev = appliedOffset.get(game) ?? 0;
    const next = timeModeOffset(s.timeMode, game.date().getTime() - prev);
    game.clockOffset += next - prev;
    appliedOffset.set(game, next);
  }
  if (has('droneColor')) {
    const hull = game.drone.body.children[0] as { material?: { color?: { set(c: string): void } } } | undefined;
    hull?.material?.color?.set(s.droneColor);
  }
  if (has('reducedMotion') && typeof document !== 'undefined') document.documentElement.classList.toggle('reduce-motion', s.reducedMotion);
}

export function setSetting<K extends SettingKey>(game: Game, key: K, value: Settings[K]): Settings[K] {
  const clean = sanitize(key, value);
  game.save.data.settings[key] = clean;
  game.save.persist();
  applySettings(game, [key]);
  game.bus.emit('settings:change', { key, value: clean });
  return clean;
}
