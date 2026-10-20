import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import { cleanColor, cleanText, encode, wireVec, LIMITS, makeCode, normalizeCode, parse, RateLimiter, DEFAULT_COLOR, type Mic, type ModeId, type Msg } from './protocol';
import { approach, approachAngle, predict, voiceVolume } from './math';
import { openTransport, randomId, type Transport, type TransportKind } from './transport';
import { Voice, type VoiceResult } from './voice';
import { Match, MODES, type MatchEnv } from './modes';
import { DeviceSync } from './sync';
import { randomPilotName } from '../ui/settings-model';

export type NetStatus = 'off' | 'connecting' | 'online' | 'unreachable';

export interface RemotePeer {
  id: string;
  name: string;
  color: string;
  known: boolean;
  pos: Vec3;
  yaw: number;
  vel: Vec3;
  mic: Mic;
  sample: { p: Vec3; v: Vec3; yaw: number; at: number } | null;
  muted: boolean;
  blocked: boolean;
}

export interface ChatLine {
  id: string;
  name: string;
  color: string;
  text: string;
  self: boolean;
  at: number;
}

export interface PingMark {
  id: string;
  name: string;
  color: string;
  p: Vec3;
  t: number;
}

declare module '../core/bus' {
  interface GameEvents {
    'net:status': { status: NetStatus; room: string | null };
    'net:join': { id: string; name: string };
    'net:leave': { id: string; name: string };
    'net:chat': ChatLine;
    'net:ping': PingMark;
    'net:ping-request': { x: number; z: number; y?: number };
    'net:match': { phase: 'start' | 'done'; mode: ModeId };
  }
}

export const SEND_HZ = 12;
export const PING_SECONDS = 10;
export const UNREACHABLE_MS = 9000;
export const JOIN_GRACE_MS = 30_000;
const CHAT_KEEP = 60;

export class Net {
  room: string | null = null;
  status: NetStatus = 'off';
  transport: Transport | null = null;
  match: Match | null = null;
  readonly peers = new Map<string, RemotePeer>();
  private past = new Map<string, RemotePeer>();
  private warned = new Set<string>();
  readonly chat: ChatLine[] = [];
  readonly pings = new Map<string, PingMark>();
  readonly voice: Voice;
  readonly sync: DeviceSync;
  private limiter = new RateLimiter();
  private chatLimiter = new RateLimiter({ chat: [1, 4] });
  private timers: ReturnType<typeof setInterval>[] = [];
  private joinedAt = 0;
  private ticks = 0;
  private lastHi = '';
  private listeners = new Set<() => void>();
  private streams = new Map<string, MediaStream>();
  private notice = '';

  constructor(
    readonly game: Game,
    readonly kind: TransportKind,
    voice = new Voice(),
  ) {
    this.voice = voice;
    this.sync = new DeviceSync(game, kind);
    const s = game.save.data.settings;
    if (typeof s.playerName !== 'string' || !cleanText(s.playerName, LIMITS.name)) {
      s.playerName = randomPilotName();
      game.save.persist();
    }
    game.save.onChange(() => {
      if (this.transport && this.hiKey() !== this.lastHi) this.sayHi();
    });
    game.bus.on('net:ping-request', ({ x, z, y }) => this.ping({ x, y: y ?? game.world.groundAt(x, z), z }));
  }

  get selfId(): string {
    return this.transport?.selfId ?? 'self';
  }

  get name(): string {
    return cleanText(this.game.save.data.settings.playerName, LIMITS.name) || 'Pilot';
  }

  get color(): string {
    return cleanColor(this.game.save.data.settings.droneColor ?? DEFAULT_COLOR);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  private setStatus(status: NetStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.game.bus.emit('net:status', { status, room: this.room });
    this.changed();
  }

  visiblePeers(): RemotePeer[] {
    return [...this.peers.values()].filter((p) => p.known && !p.blocked);
  }

  async create(): Promise<string> {
    const code = makeCode();
    await this.join(code);
    return code;
  }

  async join(raw: string): Promise<boolean> {
    const code = normalizeCode(raw);
    if (!code) return false;
    if (code === this.room && this.transport) return true;
    this.leave();
    this.room = code;
    this.joinedAt = Date.now();
    this.setStatus('connecting');
    try {
      const t = await openTransport(this.kind, `room-${code}`, {
        message: (raw, from) => this.receive(raw, from),
        join: (id) => this.peerJoin(id),
        leave: (id) => this.peerLeave(id),
        stream: (stream, id) => {
          this.streams.set(id, stream);
          if (!this.peers.get(id)?.blocked) this.voice.attach(id, stream);
        },
        error: (peer) => {
          if (this.warned.has(peer)) return;
          this.warned.add(peer);
          setTimeout(() => {
            if (this.room === code && !this.peers.has(peer)) this.game.toast('A friend could not connect directly. Their network may block peer to peer.', 'warn');
          }, JOIN_GRACE_MS);
        },
      });
      if (this.room !== code) {
        t.leave();
        return false;
      }
      this.transport = t;
    } catch {
      this.room = null;
      this.setStatus('unreachable');
      this.notice = 'Multiplayer could not start. Single player keeps working.';
      return false;
    }
    this.sayHi();
    this.timers.push(setInterval(() => this.pulse(), 1000 / SEND_HZ));
    this.timers.push(setInterval(() => this.checkRelays(), 1000));
    this.checkRelays();
    this.changed();
    return true;
  }

  leave(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.match && this.match.phase !== 'done') this.match.finish();
    this.match = null;
    if (this.voice.mic) this.transport?.removeStream(this.voice.mic);
    this.transport?.leave();
    this.transport = null;
    for (const p of this.peers.values()) {
      this.voice.drop(p.id);
      this.past.set(p.id, p);
    }
    this.peers.clear();
    this.streams.clear();
    this.pings.clear();
    const had = this.room !== null;
    this.room = null;
    this.setStatus('off');
    if (had) this.changed();
  }

  shareUrl(): string | null {
    if (!this.room) return null;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', this.room);
    if (this.kind === 'local') url.searchParams.set('net', 'local');
    return url.toString();
  }

  async share(): Promise<'shared' | 'copied' | 'manual'> {
    const url = this.shareUrl();
    if (!url) return 'manual';
    const data = { title: 'Fly Around SF', text: `Fly around San Francisco with me. Room ${this.room}`, url };
    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'manual';
      }
    }
    return this.copy(url);
  }

  async copy(text = this.shareUrl() ?? ''): Promise<'copied' | 'manual'> {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'manual';
    }
  }

  private hiKey(): string {
    return `${this.name}|${this.color}`;
  }

  private sayHi(to?: string): void {
    this.lastHi = this.hiKey();
    const hi = { t: 'hi', name: this.name, color: this.color };
    if (to) this.transport?.send(hi, to);
    else this.send(hi);
  }

  private send(msg: unknown): void {
    for (const p of this.peers.values()) if (p.known && !p.blocked) this.transport?.send(msg, p.id);
  }

  private mic(): Mic {
    return this.voice.on ? (this.voice.transmitting ? 2 : 1) : 0;
  }

  private pulse(): void {
    if (!this.transport) return;
    const f = this.game.flight;
    this.send(encode({ t: 'st', p: f.pos, v: f.vel, yaw: f.yaw, mic: this.mic() }));
    if (++this.ticks % (SEND_HZ * 5) === 0) this.sayHi();
    if (this.ticks % 3 === 0 && this.match && this.match.phase !== 'done') {
      const m = this.match.flush();
      if (m) this.send(m);
    }
  }

  private checkRelays(): void {
    if (!this.transport) return;
    if (this.transport.relays() > 0 || this.peers.size > 0) this.setStatus('online');
    else this.setStatus(Date.now() - this.joinedAt > UNREACHABLE_MS ? 'unreachable' : 'connecting');
  }

  private peerJoin(id: string): void {
    if (this.peers.has(id)) return;
    const f = this.game.flight;
    const p: RemotePeer = { id, name: 'Pilot', color: DEFAULT_COLOR, known: false, muted: false, blocked: false, ...this.past.get(id), pos: { ...f.pos }, yaw: 0, vel: { x: 0, y: 0, z: 0 }, mic: 0, sample: null };
    this.peers.set(id, p);
    if (!p.blocked) {
      this.sayHi(id);
      if (p.known) this.greet(p);
    }
    this.checkRelays();
    this.changed();
  }

  private peerLeave(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    this.past.set(id, p);
    this.streams.delete(id);
    this.voice.drop(id);
    this.pings.delete(id);
    this.limiter.forget(id);
    this.match?.onLeave(id);
    if (p.known && !p.blocked) {
      this.game.toast(`${p.name} left`, 'info');
      this.game.bus.emit('net:leave', { id, name: p.name });
    }
    this.changed();
  }

  private receive(raw: unknown, from: string): void {
    const p = this.peers.get(from);
    if (!p || p.blocked) return;
    const m = parse(raw);
    if (!m || !this.limiter.allow(from, m.t, performance.now())) return;
    this.handle(m, p);
  }

  private handle(m: Msg, p: RemotePeer): void {
    switch (m.t) {
      case 'hi': {
        const first = !p.known;
        const taken = m.name === this.name || [...this.peers.values()].some((o) => o !== p && o.known && o.name === m.name);
        p.known = true;
        p.name = taken ? `${m.name} (${p.id.slice(0, 4)})` : m.name;
        p.color = m.color;
        if (first) this.greet(p);
        this.changed();
        return;
      }
      case 'st':
        p.mic = m.mic;
        p.vel = m.v;
        if (!p.sample) {
          p.pos = { ...m.p };
          p.yaw = m.yaw;
        }
        p.sample = { p: m.p, v: m.v, yaw: m.yaw, at: performance.now() };
        return;
      case 'chat':
        if (p.known) this.pushChat({ id: p.id, name: p.name, color: p.color, text: m.text, self: false, at: Date.now() });
        return;
      case 'ping':
        if (p.known) this.addPing({ id: p.id, name: p.name, color: p.color, p: m.p, t: 0 });
        return;
      case 'start':
        if (p.known && m.roster.includes(this.selfId) && m.roster.includes(p.id) && (!this.match || this.match.phase === 'done')) this.begin(m, p.id);
        return;
      default:
        this.match?.onMessage(m, p.id);
    }
  }

  private greet(p: RemotePeer): void {
    if (this.voice.mic) this.transport?.addStream(this.voice.mic, p.id);
    this.game.toast(`${p.name} joined the room`, 'reward');
    this.game.bus.emit('net:join', { id: p.id, name: p.name });
  }

  private pushChat(line: ChatLine): void {
    this.chat.push(line);
    if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP);
    this.game.bus.emit('net:chat', line);
    this.changed();
  }

  sendChat(raw: string): 'ok' | 'empty' | 'slow' | 'offline' {
    const text = cleanText(raw, LIMITS.chat);
    if (!text) return 'empty';
    if (!this.transport) return 'offline';
    if (!this.chatLimiter.allow('self', 'chat', performance.now())) return 'slow';
    this.send({ t: 'chat', text });
    this.pushChat({ id: this.selfId, name: this.name, color: this.color, text, self: true, at: Date.now() });
    return 'ok';
  }

  private addPing(mark: PingMark): void {
    this.pings.set(mark.id, mark);
    this.game.bus.emit('net:ping', mark);
    const s = this.game.save.data.settings;
    const vol = s.muted === true ? 0 : (typeof s.volSfx === 'number' ? s.volSfx : 0.8) * (typeof s.volMaster === 'number' ? s.volMaster : 0.8);
    this.voice.blip(mark.id === this.selfId ? [880, 1320] : [660, 990], vol);
  }

  ping(p: Vec3): void {
    const [x, y, z] = wireVec(p);
    this.send(encode({ t: 'ping', p }));
    this.addPing({ id: this.selfId, name: this.name, color: this.color, p: { x, y, z }, t: 0 });
  }

  setMuted(id: string, muted: boolean): void {
    const p = this.peers.get(id);
    if (p) p.muted = muted;
    this.changed();
  }

  setBlocked(id: string, blocked: boolean): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.blocked = blocked;
    const stream = this.streams.get(id);
    const mic = this.voice.mic;
    if (blocked) {
      this.voice.drop(id);
      this.pings.delete(id);
      if (mic) this.transport?.removeStream(mic, id);
      this.game.toast(`${p.name} is blocked for this session`, 'info');
    } else {
      if (stream) this.voice.attach(id, stream);
      if (mic && p.known) this.transport?.addStream(mic, id);
      this.sayHi(id);
    }
    this.changed();
  }

  async enableVoice(): Promise<VoiceResult> {
    const r = await this.voice.enable();
    const mic = this.voice.mic;
    if (r === 'on' && mic) for (const p of this.peers.values()) if (p.known && !p.blocked) this.transport?.addStream(mic, p.id);
    this.changed();
    return r;
  }

  disableVoice(): void {
    if (this.voice.mic) this.transport?.removeStream(this.voice.mic);
    this.voice.disable();
    this.changed();
  }

  private env(): MatchEnv {
    return {
      game: this.game,
      selfId: this.selfId,
      send: (m) => this.send(m),
      present: (id) => id === this.selfId || !!this.peers.get(id)?.known,
      pos: (id) => (id === this.selfId ? this.game.flight.pos : (this.peers.get(id)?.pos ?? null)),
      name: (id) => (id === this.selfId ? this.name : (this.peers.get(id)?.name ?? 'Pilot')),
      color: (id) => (id === this.selfId ? this.color : (this.peers.get(id)?.color ?? DEFAULT_COLOR)),
    };
  }

  private begin(spec: Msg & { t: 'start' }, host: string): void {
    if (spec.mode === 'race') {
      const def = this.game.activities.defs.get(spec.activity);
      if (!def || def.kind !== 'rings') return;
    }
    this.match = new Match(spec, host, this.env());
    const info = MODES[spec.mode];
    if (host === this.selfId) this.entered();
    else this.game.toast(`${this.peers.get(host)?.name ?? 'A friend'} started ${info.icon} ${info.title}. Press Join to play`, 'info');
    this.changed();
  }

  private entered(): void {
    const m = this.match as Match;
    this.game.panels?.close();
    this.game.bus.emit('net:match', { phase: 'start', mode: m.spec.mode });
    this.game.toast(`${m.info.icon} ${m.info.title} starting`, 'reward');
  }

  joinMatch(): boolean {
    if (!this.match?.enter()) return false;
    this.entered();
    this.changed();
    return true;
  }

  leaveMatch(): void {
    const m = this.match;
    if (!m || m.host === this.selfId) return;
    m.exit();
    this.match = null;
    this.changed();
  }

  startMatch(mode: ModeId, opts: { activity?: string; duration?: number; role?: string } = {}): boolean {
    if (!this.transport) return false;
    if (this.match && this.match.phase !== 'done') return false;
    const others = this.visiblePeers().map((p) => p.id).slice(0, LIMITS.roster - 1);
    if (!others.length) return false;
    const roster = [this.selfId, ...others];
    const role = opts.role && roster.includes(opts.role) ? opts.role : mode === 'tag' || mode === 'hide' ? roster[Math.floor(Math.random() * roster.length)] : this.selfId;
    const spec = {
      t: 'start' as const,
      id: randomId(),
      mode,
      roster,
      duration: Math.min(600, Math.max(20, Math.round(opts.duration ?? MODES[mode].duration))),
      activity: mode === 'race' ? (opts.activity ?? this.raceOptions()[0]?.id ?? '') : '',
      role,
    };
    if (mode === 'race' && !this.game.activities.defs.get(spec.activity)) return false;
    this.send(spec);
    this.begin(spec, this.selfId);
    return !!this.match;
  }

  cancelMatch(): void {
    if (this.match && this.match.phase !== 'done' && this.match.host === this.selfId) this.match.finish();
  }

  raceOptions(): { id: string; title: string; neighborhood: string }[] {
    return this.game.activities
      .list()
      .filter((d) => d.kind === 'rings')
      .map((d) => ({ id: d.id, title: d.title, neighborhood: d.neighborhood }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  update(dt: number, listener?: { pos: Vec3; forward: Vec3; up: Vec3 }): void {
    if (this.notice) this.game.toast(this.notice, 'warn');
    this.notice = '';
    const now = performance.now();
    for (const p of this.peers.values()) {
      if (!p.sample) continue;
      const target = predict(p.sample.p, p.sample.v, (now - p.sample.at) / 1000);
      p.pos = approach(p.pos, target, dt);
      p.yaw = approachAngle(p.yaw, p.sample.yaw, dt);
    }
    for (const [id, mark] of this.pings) if ((mark.t += dt) > PING_SECONDS) this.pings.delete(id);
    const m = this.match;
    if (m) {
      const was = m.phase;
      m.tick(dt);
      if (m.playing && was !== 'done' && m.phase === 'done') {
        this.game.bus.emit('net:match', { phase: 'done', mode: m.spec.mode });
        this.changed();
      }
      if (m.expired || (!m.playing && !m.invited) || (m.phase === 'done' && !m.results)) {
        this.match = null;
        this.changed();
      }
    }
    if (listener) {
      const s = this.game.save.data.settings;
      this.voice.update(
        listener,
        this.visiblePeers().map((p) => ({ id: p.id, pos: p.pos, volume: voiceVolume(s, p.muted) })),
      );
    }
  }
}
