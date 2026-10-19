import type { ActivityDef, ActivityKind, GeoPoint, SolverStep } from '../types';
import type { Game } from '../../game';
import { forwardVector, type Vec3 } from '../../player/flight';
import { sunPosition } from '../../core/sun';
import { clock, isGeo, isRange, meters, report, type MinigameInstance } from '../minigame';

export type TimeOfDay = 'day' | 'golden' | 'night';

export interface PhotoParams {
  subject: GeoPoint & { name: string };
  distance: [number, number];
  altitude?: [number, number];
  center?: number;
  time?: TimeOfDay;
  bearing?: number;
  clear?: number;
  timeLimit: number;
}

export interface Shot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface Check {
  label: string;
  ok: boolean;
  text: string;
  hint: string;
}

export interface Framing {
  dist: number;
  sx: number;
  sy: number;
  off: number;
  inFrame: boolean;
}

const RAD = Math.PI / 180;

export const PHOTO = { fov: 55, aspect: 3 / 2, tiltMin: -1.3, tiltMax: 0.7 };

export const viewfinder = { open: false, tilt: -0.12 };

const TIME_TEXT: Record<TimeOfDay, [string, string]> = {
  day: ['Daylight', 'Come back in full daylight'],
  golden: ['Golden hour', 'Come back when the sun is low'],
  night: ['Night', 'Come back after dark'],
};

export function framing(shot: Shot, s: Vec3): Framing {
  const dx = s.x - shot.x;
  const dy = s.y - shot.y;
  const dz = s.z - shot.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-6;
  const f = forwardVector(shot.yaw);
  const cp = Math.cos(shot.pitch);
  const sp = Math.sin(shot.pitch);
  const ahead = (dx * f.x * cp + dy * sp + dz * f.z * cp) / dist;
  const right = (-dx * f.z + dz * f.x) / dist;
  const up = (-dx * f.x * sp + dy * cp - dz * f.z * sp) / dist;
  const tv = Math.tan((PHOTO.fov / 2) * RAD);
  const sx = ahead > 1e-6 ? right / ahead / (tv * PHOTO.aspect) : Infinity;
  const sy = ahead > 1e-6 ? up / ahead / tv : Infinity;
  return { dist, sx, sy, off: Math.acos(Math.max(-1, Math.min(1, ahead))), inFrame: Math.abs(sx) <= 1 && Math.abs(sy) <= 1 };
}

export function timeMatches(time: TimeOfDay, sunAltDeg: number): boolean {
  return time === 'day' ? sunAltDeg > 10 : time === 'golden' ? sunAltDeg >= -2 && sunAltDeg <= 10 : sunAltDeg < -6;
}

export function scoreShot(p: PhotoParams, shot: Shot, subject: Vec3, sunAltDeg: number, blocked: boolean): { stars: number; checks: Check[]; hint: string; framing: Framing } {
  const fr = framing(shot, subject);
  const [d0, d1] = p.distance;
  const tol = (p.center ?? 7) * RAD;
  const checks: Check[] = [
    { label: 'Distance', ok: fr.dist >= d0 && fr.dist <= d1, text: `${meters(fr.dist)} of ${d0} to ${d1} m`, hint: fr.dist < d0 ? 'Back off a little' : 'Move closer' },
  ];
  if (p.altitude) {
    const [a0, a1] = p.altitude;
    checks.push({ label: 'Altitude', ok: shot.y >= a0 && shot.y <= a1, text: `${Math.round(shot.y)} m of ${a0} to ${a1} m`, hint: shot.y < a0 ? 'Fly higher' : 'Fly lower' });
  }
  checks.push({ label: 'Centered', ok: fr.inFrame && fr.off <= tol, text: `${(fr.off / RAD).toFixed(0)}° off center`, hint: 'Center the subject in the frame' });
  if (p.time) checks.push({ label: TIME_TEXT[p.time][0], ok: timeMatches(p.time, sunAltDeg), text: `sun at ${sunAltDeg.toFixed(0)}°`, hint: TIME_TEXT[p.time][1] });
  const tooFar = fr.dist > d1 * 2;
  const valid = fr.inFrame && !blocked && !tooFar;
  const missed = checks.filter((c) => !c.ok);
  const stars = !valid ? 0 : missed.length === 0 ? 3 : missed.length === 1 ? 2 : 1;
  const hint = !fr.inFrame ? `${p.subject.name} is out of frame` : blocked ? 'Something is in the way' : tooFar ? 'Too far away to count' : missed[0]?.hint ?? 'Perfect shot';
  return { stars, checks, hint, framing: fr };
}

export function subjectPoint(game: Game, p: PhotoParams): Vec3 {
  const { x, z } = game.world.toLocal(p.subject.lat, p.subject.lon);
  return { x, y: game.world.surfaceAt(x, z) + (p.subject.alt ?? 0), z };
}

export function lineBlocked(game: Game, from: Vec3, to: Vec3, clear: number): boolean {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const n = Math.max(4, Math.ceil(d / 20));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (d * (1 - k) < clear) break;
    const q = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
    if (q.y < game.world.surfaceAt(q.x, q.z) || game.world.collide(q, 1)) return true;
  }
  return false;
}

export function sunAltitude(game: Game, g: GeoPoint): number {
  return sunPosition(game.date(), g.lat, g.lon).altitude / RAD;
}

export function evaluate(game: Game, p: PhotoParams, shot: Shot, checkBlocked: boolean) {
  const s = subjectPoint(game, p);
  return scoreShot(p, shot, s, sunAltitude(game, p.subject), checkBlocked && lineBlocked(game, shot, s, p.clear ?? 30));
}

function params(def: ActivityDef): PhotoParams {
  return def.params as unknown as PhotoParams;
}

export const kind: ActivityKind = {
  kind: 'photo',
  label: 'Photo Challenge',
  icon: '📷',
  validate(def) {
    const p = def.params as Partial<PhotoParams> | undefined;
    const errors: string[] = [];
    if (!isGeo(p?.subject) || typeof p.subject.name !== 'string') errors.push('params.subject needs lat, lon and name');
    if (!isRange(p?.distance) || p.distance[0] <= 0) errors.push('params.distance must be [min, max] meters');
    if (p?.altitude !== undefined && !isRange(p.altitude)) errors.push('params.altitude must be [min, max] meters');
    if (p?.center !== undefined && !(p.center >= 1 && p.center <= 25)) errors.push('params.center must be 1..25 degrees');
    if (p?.time !== undefined && !(p.time in TIME_TEXT)) errors.push('params.time must be day, golden or night');
    if (!(typeof p?.timeLimit === 'number' && p.timeLimit > 0)) errors.push('params.timeLimit must be > 0');
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = params(def);
    const subject = subjectPoint(game, p);
    let t = 0;
    let best = 0;
    let keep = false;
    const offShot = game.bus.on('photo', (shot) => {
      const r = evaluate(game, p, shot, true);
      best = Math.max(best, r.stars);
      game.bus.emit('photo:scored', { id: def.id, stars: r.stars, best, hint: r.hint });
    });
    const offKeep = game.bus.on('interact', () => void (keep = best > 0));
    const stars = () => `${'★'.repeat(best)}${'☆'.repeat(3 - best)}`;
    return {
      update(dt) {
        t += dt;
        if (best === 3 || keep || (best > 0 && t > p.timeLimit)) {
          report(game, def, { medal: best, time: t, score: stars(), points: best });
          return 'done';
        }
        if (t > p.timeLimit) {
          report(game, def, { medal: 0, time: t, fail: 'The light changed before you got the shot' });
          return 'failed';
        }
        return 'running';
      },
      progress: () => best / 3,
      hud: () => {
        const f = game.flight.pos;
        const kept = best ? ` · best ${stars()}` : '';
        return `📷 ${p.subject.name} · ${meters(Math.hypot(f.x - subject.x, f.y - subject.y, f.z - subject.z))}${kept} · ${clock(t, p.timeLimit)}`;
      },
      targets: () => [subject],
      elapsed: () => t,
      props: () => [],
      dispose: () => {
        offShot();
        offKeep();
      },
    };
  },
  solve(def, game) {
    const p = params(def);
    const s = subjectPoint(game, p);
    const dist = (p.distance[0] + p.distance[1]) / 2;
    const y = p.altitude ? (p.altitude[0] + p.altitude[1]) / 2 : s.y + dist * 0.3;
    const dy = y - s.y;
    const h = Math.sqrt(Math.max(dist * dist - dy * dy, (dist * 0.4) ** 2));
    const first = p.bearing ?? 0;
    for (let i = 0; i < 24; i++) {
      const b = (first + i * 15) * RAD;
      const pos = { x: s.x + Math.sin(b) * h, y, z: s.z - Math.cos(b) * h };
      if (pos.y < game.world.groundAt(pos.x, pos.z) + 4 || game.world.collide({ ...pos }, 2) || lineBlocked(game, pos, s, p.clear ?? 30)) continue;
      return aim(pos, s);
    }
    return aim({ x: s.x, y: y, z: s.z + h }, s);
  },
};

function aim(pos: Vec3, s: Vec3): SolverStep[] {
  const dx = s.x - pos.x;
  const dz = s.z - pos.z;
  const yaw = Math.atan2(-dx, -dz);
  const tilt = Math.atan2(s.y - pos.y, Math.hypot(dx, dz));
  return [
    { teleport: pos, yaw },
    { call: () => void (viewfinder.tilt = tilt) },
    { action: 'photo' },
    { action: 'photo' },
    { call: (g) => g.interact() },
  ];
}
