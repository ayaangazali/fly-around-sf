import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import type { ActivityInstance } from '../activities/types';
import type { ModeId, Msg } from './protocol';
import { distance } from './math';

export const COUNTDOWN = 10;
export const READY = 3;
export const TAG_RADIUS = 8;
export const TAG_COOLDOWN = 3;
export const HEAD_START = 5;
export const NO_TAG_BACK = 10;
export const FIND_RADIUS = 15;
export const HIDE_TIME = 20;
export const FORMATION_RADIUS = 30;
export const SEEKER_FOG = 40;
export const BLIND_FOG = 120;
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
  hide: { title: 'Fog hide and seek', icon: '🌫️', blurb: 'Hiders get 20 seconds. The seeker hunts through thick Karl-the-Fog. Anyone still hidden at the end wins; find them all and the seeker wins.', duration: 180 },
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
  readonly joined: Set<string>;
  private lastTag = -Infinity;
  private taggedBy = '';
  private anchor: { p: Vec3; yaw: number } | null = null;
  private race: { inst: ActivityInstance | null; total: number; def: string } | null = null;
  private fogBefore: number | null = null;
  private sent = '';
  private doneAt = 0;

  constructor(
    readonly spec: StartSpec,
    readonly host: string,
    private env: MatchEnv,
  ) {
    this.role = spec.role;
    this.joined = new Set(host === env.selfId ? [] : [host]);
    for (const id of spec.roster) this.scores.set(id, { s: 0, x: 0, d: false });
    if (host === env.selfId) this.enter();
  }

  get playing(): boolean {
    return this.joined.has(this.self);
  }

  get invited(): boolean {
    return !this.playing && this.phase === 'countdown' && this.countdown > READY;
  }

  enter(): boolean {
    if (this.playing || this.phase !== 'countdown' || (this.self !== this.host && this.countdown <= READY)) return false;
    this.joined.add(this.self);
    this.env.send({ t: 'in', id: this.spec.id, on: true });
    const game = this.env.game;
    game.activities.stop();
    if (this.spec.mode === 'race') {
      const def = game.activities.defs.get(this.spec.activity);
      const rings = (def?.params as { rings?: { lat: number; lon: number }[] } | undefined)?.rings ?? [];
      if (def) {
        const start = game.activities.position(def);
        const first = rings[0] ? game.world.point({ alt: 25, ...rings[0] }) : start;
        const yaw = Math.atan2(-(first.x - start.x), -(first.z - start.z));
        const roster = this.spec.roster;
        const side = (roster.indexOf(this.self) - (roster.length - 1) / 2) * 6;
        const p = { x: start.x + Math.cos(yaw) * side, y: start.y, z: start.z - Math.sin(yaw) * side };
        this.anchor = { p, yaw };
        game.teleport(p, yaw);
      }
      this.race = { inst: null, total: rings.length, def: this.spec.activity };
    }
    return true;
  }

  exit(): void {
    if (!this.playing) return;
    this.joined.delete(this.self);
    this.env.send({ t: 'in', id: this.spec.id, on: false });
    this.race?.inst?.dispose?.();
    this.restoreFog();
  }

  private restoreFog(): void {
    if (this.fogBefore !== null) this.env.game.sky.fogDensity = this.fogBefore;
    this.fogBefore = null;
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
    return this.spec.roster.filter((id) => this.joined.has(id) && this.env.present(id));
  }

  targets(): Vec3[] {
    return this.race?.inst?.targets?.() ?? [];
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.phase === 'done' || !this.playing) return;
    const game = this.env.game;
    if (this.phase === 'countdown' && this.t >= COUNTDOWN && !this.go()) return;
    const frozen = (this.phase === 'countdown' && this.countdown <= READY) || (this.spec.mode === 'hide' && this.self === this.role && !this.seeking);
    if (frozen) {
      this.anchor ??= { p: { ...game.flight.pos }, yaw: game.flight.yaw };
      game.flight.pos = { ...this.anchor.p };
      game.flight.vel = { x: 0, y: 0, z: 0 };
      game.flight.yaw = this.anchor.yaw;
    }
    if (this.phase === 'live') this.play(dt);
    if (this.spec.mode === 'hide' && this.fogBefore !== null) game.sky.fogDensity = this.seeking ? SEEKER_FOG : BLIND_FOG;
    if (this.phase === 'live' && (this.t >= COUNTDOWN + this.spec.duration || this.over())) this.finish();
  }

  private go(): boolean {
    const game = this.env.game;
    const players = this.players();
    if (players.length < 2) {
      game.toast('Nobody joined in time, so the match is off', 'info');
      this.finish();
      return false;
    }
    if (!players.includes(this.role)) this.role = players.sort()[0];
    this.phase = 'live';
    if (this.race) {
      const def = game.activities.defs.get(this.race.def);
      if (def) this.race.inst = game.activities.kindOf(def).start(def, game);
    }
    if (this.spec.mode === 'hide' && this.self === this.role && game.sky) this.fogBefore = game.sky.fogDensity;
    game.toast(`${this.info.icon} Go!`, 'reward');
    return true;
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
      else if (this.tagWait() <= 0) {
        const near = this.nearest(this.players().filter((id) => id !== self && !this.tagBack(id)), TAG_RADIUS);
        if (near) this.claim(near);
      }
    } else if (mode === 'hide') {
      if (self === this.role) {
        if (this.seeking) {
          const hiders = this.players().filter((id) => id !== self && !this.scores.get(id)?.d);
          const near = this.nearest(hiders, FIND_RADIUS);
          if (near) this.claim(near);
        }
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

  private tagWait(): number {
    return Math.max(COUNTDOWN + HEAD_START, this.lastTag + TAG_COOLDOWN) - this.t;
  }

  private tagBack(id: string): boolean {
    return id === this.taggedBy && this.t - this.lastTag < NO_TAG_BACK;
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
      this.taggedBy = from;
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
    if (from === this.self || !this.spec.roster.includes(from) || !('id' in m) || m.id !== this.spec.id) return;
    if (m.t === 'in') {
      if (m.on && this.phase === 'countdown') this.joined.add(from);
      else if (!m.on && this.joined.delete(from)) this.onLeave(from);
    } else if (!this.joined.has(from)) return;
    else if (m.t === 'score') {
      const prev = this.scores.get(from) as Score;
      this.scores.set(from, { s: m.s, x: m.x, d: prev.d || m.d });
    } else if (m.t === 'tag') this.applyTag(from, m.to, m.n);
    else if (m.t === 'end' && from === this.host) {
      if (this.phase === 'countdown' && this.playing) this.env.game.toast(`${this.env.name(from)} called off the match`, 'info');
      this.finish();
    }
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
    const played = this.phase === 'live' && this.playing;
    if (played) this.flushNow();
    this.phase = 'done';
    this.doneAt = this.t;
    this.race?.inst?.dispose?.();
    this.restoreFog();
    if (this.self === this.host) this.env.send({ t: 'end', id: this.spec.id });
    if (!played) return;
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
    const rows = this.spec.roster.filter((id) => this.joined.has(id)).map((id) => {
      const sc = this.scores.get(id) as Score;
      let score = sc.s;
      let label: string;
      if (mode === 'race') {
        const finished = sc.d && sc.s >= total && sc.x > 0;
        score = finished ? 1e5 - sc.x : sc.s;
        label = finished ? `${sc.x.toFixed(2)} s` : sc.d ? 'DNF' : `${sc.s}/${total} rings`;
      } else if (mode === 'tag') label = `${sc.s.toFixed(0)} s free${id === this.role ? ' · IT' : ''}`;
      else if (mode === 'hide') {
        const seeker = id === this.role;
        score = seeker ? 1e5 + this.tags : !sc.d && this.env.present(id) ? 2e5 + sc.s : sc.s;
        label = seeker ? `seeker · ${this.tags} found` : sc.d ? `found at ${sc.s.toFixed(0)} s` : `${sc.s.toFixed(0)} s hidden`;
      }
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
    if (!this.playing) return `${this.env.name(this.host)} invites you. Starts in ${Math.ceil(this.countdown)} s`;
    if (this.phase === 'countdown') return this.countdown > READY ? `Waiting for friends to join: ${this.players().length} of ${this.spec.roster.length} in` : 'Get ready';
    if (this.phase === 'done') return 'Match over';
    switch (this.spec.mode) {
      case 'race':
        return this.me().d ? 'Finished. Waiting for the others' : (this.race?.inst?.hud() ?? 'Fly through the rings');
      case 'tag': {
        if (self !== role) return this.tagWait() > 0 ? `Run! ${this.env.name(role)} can tag in ${Math.ceil(this.tagWait())} s` : `${this.env.name(role)} is IT, ${away(role)} away`;
        if (this.tagWait() > 0) return `You are IT. Tag in ${Math.ceil(this.tagWait())} s`;
        return this.tagBack(this.taggedBy) ? `You are IT. No tag-backs on ${this.env.name(this.taggedBy)} for ${Math.ceil(this.lastTag + NO_TAG_BACK - this.t)} s` : 'You are IT. Fly into someone!';
      }
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
