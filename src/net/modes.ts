import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import type { ActivityInstance } from '../activities/types';
import type { ModeId, Msg } from './protocol';
import { distance } from './math';

export const COUNTDOWN = 3;
export const TAG_RADIUS = 8;
export const TAG_COOLDOWN = 3;
export const FIND_RADIUS = 15;
export const HIDE_TIME = 20;
export const FORMATION_RADIUS = 30;
export const SEEKER_FOG = 16;
export const BLIND_FOG = 60;
export const RESULTS_SECONDS = 12;

export interface ModeInfo {
  title: string;
  icon: string;
  blurb: string;
  duration: number;
}

export const MODES: Record<ModeId, ModeInfo> = {
  race: { title: 'Ring race', icon: '🏁', blurb: 'Everyone lines up at the same ring run. Fastest through every ring wins.', duration: 240 },
  tag: { title: 'Drone tag', icon: '🎯', blurb: 'Whoever is IT tags the next drone by flying within 8 m. Most time free wins.', duration: 120 },
  hide: { title: 'Fog hide and seek', icon: '🌫️', blurb: 'Hiders get 20 seconds. The seeker hunts through thick Karl-the-Fog. Last one hidden wins.', duration: 180 },
  formation: { title: 'Formation', icon: '🪿', blurb: 'Follow the leader like a flock of geese. Score every second you stay within 30 m.', duration: 90 },
};

export interface StartSpec {
  id: string;
  mode: ModeId;
  roster: string[];
  duration: number;
  activity: string;
  role: string;
}

export interface MatchEnv {
  game: Game;
  selfId: string;
  send(m: Msg): void;
  present(id: string): boolean;
  pos(id: string): Vec3 | null;
  name(id: string): string;
  color(id: string): string;
}

export interface Standing {
  id: string;
  name: string;
  color: string;
  score: number;
  label: string;
  self: boolean;
}

interface Score {
  s: number;
  x: number;
  d: boolean;
}

export class Match {
  phase: 'countdown' | 'live' | 'done' = 'countdown';
  t = 0;
  role: string;
  tags = 0;
  results: Standing[] | null = null;
  readonly scores = new Map<string, Score>();
  private lastTag = -Infinity;
  private anchor: { p: Vec3; yaw: number } | null;
  private race: { inst: ActivityInstance | null; total: number; def: string } | null = null;
  private fogBefore: number | null = null;
  private sent = '';
  private doneAt = 0;

  constructor(
    readonly spec: StartSpec,
    readonly host: string,
    private env: MatchEnv,
  ) {
    const game = env.game;
    this.role = spec.role;
    for (const id of spec.roster) this.scores.set(id, { s: 0, x: 0, d: false });
    game.activities.stop();
    const f = game.flight;
    this.anchor = { p: { ...f.pos }, yaw: f.yaw };
    if (spec.mode === 'race') {
      const def = game.activities.defs.get(spec.activity);
      const rings = (def?.params as { rings?: { lat: number; lon: number }[] } | undefined)?.rings ?? [];
      if (def) {
        const start = game.activities.position(def);
        const first = rings[0] ? game.world.point({ alt: 25, ...rings[0] }) : start;
        const yaw = Math.atan2(-(first.x - start.x), -(first.z - start.z));
        const i = spec.roster.indexOf(env.selfId);
        const side = (i - (spec.roster.length - 1) / 2) * 6;
        const p = { x: start.x + Math.cos(yaw) * side, y: start.y, z: start.z - Math.sin(yaw) * side };
        this.anchor = { p, yaw };
        game.teleport(p, yaw);
      }
      this.race = { inst: null, total: rings.length, def: spec.activity };
    }
    if (spec.mode === 'hide' && this.self === this.role && game.sky) this.fogBefore = game.sky.fogDensity;
  }

  get self(): string {
    return this.env.selfId;
  }

  get info(): ModeInfo {
    return MODES[this.spec.mode];
  }

  get remaining(): number {
    return Math.max(0, this.spec.duration - Math.max(0, this.t - COUNTDOWN));
  }

  get countdown(): number {
    return Math.max(0, COUNTDOWN - this.t);
  }

  get seeking(): boolean {
    return this.spec.mode === 'hide' && this.phase === 'live' && this.t >= COUNTDOWN + HIDE_TIME;
  }

  get expired(): boolean {
    return this.phase === 'done' && this.t - this.doneAt > RESULTS_SECONDS;
  }

  private me(): Score {
    return this.scores.get(this.self) as Score;
  }

  private players(): string[] {
    return this.spec.roster.filter((id) => this.env.present(id));
  }

  targets(): Vec3[] {
    return this.race?.inst?.targets?.() ?? [];
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.phase === 'done') return;
    const game = this.env.game;
    if (this.phase === 'countdown' && this.t >= COUNTDOWN) this.go();
    const frozen = this.phase === 'countdown' || (this.spec.mode === 'hide' && this.self === this.role && !this.seeking);
    if (frozen && this.anchor) {
      game.flight.pos = { ...this.anchor.p };
      game.flight.vel = { x: 0, y: 0, z: 0 };
      game.flight.yaw = this.anchor.yaw;
    }
    if (this.phase === 'live') this.play(dt);
    if (this.spec.mode === 'hide' && this.fogBefore !== null) game.sky.fogDensity = this.seeking ? SEEKER_FOG : BLIND_FOG;
    if (this.phase === 'live' && (this.t >= COUNTDOWN + this.spec.duration || this.over())) this.finish();
  }

  private go(): void {
    this.phase = 'live';
    const game = this.env.game;
    if (this.race) {
      const def = game.activities.defs.get(this.race.def);
      if (def) this.race.inst = game.activities.kindOf(def).start(def, game);
    }
    game.toast(`${this.info.icon} Go!`, 'reward');
  }

  private play(dt: number): void {
    const me = this.me();
    const mode = this.spec.mode;
    const self = this.self;
    if (mode === 'race' && this.race?.inst && !me.d) {
      const inst = this.race.inst;
      const status = inst.update(dt);
      me.s = Math.round(inst.progress() * this.race.total);
      if (status !== 'running') {
        me.d = true;
        me.x = status === 'done' ? Math.round((inst.elapsed?.() ?? this.t - COUNTDOWN) * 100) / 100 : 0;
        inst.dispose?.();
        this.flushNow();
      }
    } else if (mode === 'tag') {
      if (self !== this.role) me.s += dt;
      else if (this.t - this.lastTag >= TAG_COOLDOWN) {
        const near = this.nearest(this.players().filter((id) => id !== self), TAG_RADIUS);
        if (near) this.claim(near);
      }
    } else if (mode === 'hide') {
      if (self === this.role) {
        if (this.seeking) {
          const hiders = this.players().filter((id) => id !== self && !this.scores.get(id)?.d);
          const near = this.nearest(hiders, FIND_RADIUS);
          if (near) this.claim(near);
        }
        me.s = this.tags * 30;
        me.x = this.tags;
      } else if (this.seeking && !me.d) me.s += dt;
    } else if (mode === 'formation') {
      if (self === this.role) {
        const others = this.spec.roster.filter((id) => id !== self).map((id) => this.scores.get(id)?.s ?? 0);
        me.s = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
      } else {
        const lead = this.env.pos(this.role);
        if (lead && distance(lead, this.env.game.flight.pos) <= FORMATION_RADIUS) me.s += dt;
      }
    }
  }

  private nearest(ids: string[], radius: number): string | null {
    const p = this.env.game.flight.pos;
    let best: string | null = null;
    let bd = radius;
    for (const id of ids) {
      const q = this.env.pos(id);
      if (!q) continue;
      const d = distance(p, q);
      if (d <= bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  private claim(to: string): void {
    const n = this.tags + 1;
    if (this.applyTag(this.self, to, n)) this.env.send({ t: 'tag', id: this.spec.id, to, n });
  }

  private applyTag(from: string, to: string, n: number): boolean {
    if (this.phase === 'done' || n !== this.tags + 1 || from !== this.role || !this.spec.roster.includes(to) || to === from) return false;
    if (this.spec.mode === 'tag') {
      this.role = to;
      this.lastTag = this.t;
      this.tags = n;
      this.env.game.toast(to === this.self ? `${this.env.name(from)} tagged you. You are IT!` : `${this.env.name(from)} tagged ${this.env.name(to)}`, to === this.self ? 'warn' : 'info');
      return true;
    }
    if (this.spec.mode === 'hide') {
      const s = this.scores.get(to);
      if (!s || s.d) return false;
      s.d = true;
      this.tags = n;
      this.env.game.toast(to === this.self ? 'The seeker found you' : `${this.env.name(to)} was found`, to === this.self ? 'warn' : 'info');
      return true;
    }
    return false;
  }

  onMessage(m: Msg, from: string): void {
    if (!this.spec.roster.includes(from)) return;
    if (m.t === 'score' && m.id === this.spec.id && from !== this.self) {
      const prev = this.scores.get(from) as Score;
      this.scores.set(from, { s: m.s, x: m.x, d: prev.d || m.d });
    } else if (m.t === 'tag' && m.id === this.spec.id) this.applyTag(from, m.to, m.n);
    else if (m.t === 'end' && m.id === this.spec.id && from === this.host) this.finish();
  }

  onLeave(id: string): void {
    if (this.phase === 'done' || !this.spec.roster.includes(id)) return;
    if (this.spec.mode === 'tag' && id === this.role) {
      const next = this.players().sort()[0];
      if (next) this.role = next;
    }
  }

  private over(): boolean {
    const players = this.players();
    if (players.length < 2) return true;
    if (this.spec.mode === 'race') return players.every((id) => this.scores.get(id)?.d);
    if (this.spec.mode === 'hide') return !players.includes(this.role) || players.every((id) => id === this.role || this.scores.get(id)?.d);
    if (this.spec.mode === 'formation') return !players.includes(this.role);
    return false;
  }

  flush(): Msg | null {
    const me = this.me();
    const key = `${me.s.toFixed(1)}|${me.x}|${me.d}`;
    if (key === this.sent || this.phase === 'countdown') return null;
    this.sent = key;
    return { t: 'score', id: this.spec.id, s: Math.round(me.s * 100) / 100, x: me.x, d: me.d };
  }

  private flushNow(): void {
    const m = this.flush();
    if (m) this.env.send(m);
  }

  finish(): void {
    if (this.phase === 'done') return;
    this.flushNow();
    this.phase = 'done';
    this.doneAt = this.t;
    this.race?.inst?.dispose?.();
    if (this.fogBefore !== null) this.env.game.sky.fogDensity = this.fogBefore;
    this.fogBefore = null;
    if (this.self === this.host) this.env.send({ t: 'end', id: this.spec.id });
    this.results = this.standings();
    const save = this.env.game.save;
    const rank = this.results.findIndex((r) => r.self) + 1;
    const flags = save.data.flags;
    flags.mpPlayed = Number(flags.mpPlayed ?? 0) + 1;
    if (rank === 1) flags.mpWins = Number(flags.mpWins ?? 0) + 1;
    save.persist();
    this.env.game.toast(`${this.info.title}: you placed ${ordinal(rank)} of ${this.results.length}`, rank === 1 ? 'reward' : 'info');
  }

  standings(): Standing[] {
    const mode = this.spec.mode;
    const total = this.race?.total ?? 0;
    const rows = this.spec.roster.map((id) => {
      const sc = this.scores.get(id) as Score;
      let score = sc.s;
      let label: string;
      if (mode === 'race') {
        const finished = sc.d && sc.s >= total && sc.x > 0;
        score = finished ? 1e5 - sc.x : sc.s;
        label = finished ? `${sc.x.toFixed(2)} s` : sc.d ? 'DNF' : `${sc.s}/${total} rings`;
      } else if (mode === 'tag') label = `${sc.s.toFixed(0)} s free${id === this.role ? ' · IT' : ''}`;
      else if (mode === 'hide') label = id === this.role ? `seeker · ${this.tags} found` : sc.d ? `found at ${sc.s.toFixed(0)} s` : `${sc.s.toFixed(0)} s hidden`;
      else label = id === this.role ? `leader · ${sc.s.toFixed(0)} s avg` : `${sc.s.toFixed(0)} s in formation`;
      return { id, name: this.env.name(id), color: this.env.color(id), score, label, self: id === this.self };
    });
    return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  hint(): string {
    const self = this.self;
    const role = this.role;
    const away = (id: string) => {
      const q = this.env.pos(id);
      return q ? `${Math.round(distance(q, this.env.game.flight.pos))} m` : 'out of sight';
    };
    if (this.phase === 'countdown') return 'Get ready';
    if (this.phase === 'done') return 'Match over';
    switch (this.spec.mode) {
      case 'race':
        return this.me().d ? 'Finished. Waiting for the others' : (this.race?.inst?.hud() ?? 'Fly through the rings');
      case 'tag':
        return self === role ? (this.t - this.lastTag < TAG_COOLDOWN ? 'You are IT. No tag-backs for a moment' : 'You are IT. Fly into someone!') : `${this.env.name(role)} is IT, ${away(role)} away`;
      case 'hide':
        if (self === role) return this.seeking ? `Hunt them down: ${this.tags} found` : `Eyes closed. Hunting starts in ${Math.ceil(COUNTDOWN + HIDE_TIME - this.t)} s`;
        if (this.me().d) return 'Found. Watch the others';
        return this.seeking ? `Stay hidden. Seeker is ${away(role)} away` : `Hide! Seeker opens eyes in ${Math.ceil(COUNTDOWN + HIDE_TIME - this.t)} s`;
      default: {
        if (self === role) return 'You lead. Give the flock a scenic route';
        const q = this.env.pos(role);
        const d = q ? distance(q, this.env.game.flight.pos) : Infinity;
        return d <= FORMATION_RADIUS ? `In formation behind ${this.env.name(role)}` : `Catch up: ${away(role)} to ${this.env.name(role)}`;
      }
    }
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
