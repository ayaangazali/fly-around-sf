export type TransportKind = 'local' | 'p2p';

export interface TransportHandlers {
  message(raw: unknown, from: string): void;
  join(peer: string): void;
  leave(peer: string): void;
  stream?(stream: MediaStream, peer: string): void;
  error?(peer: string): void;
}

export interface Transport {
  readonly selfId: string;
  readonly kind: TransportKind;
  send(msg: unknown, to?: string): void;
  addStream(stream: MediaStream, to?: string): void;
  removeStream(stream: MediaStream, to?: string): void;
  relays(): number;
  leave(): void;
}

const BEAT_MS = 1000;
const EXPIRE_BEATS = 30;

export function randomId(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class LocalTransport implements Transport {
  readonly selfId = randomId();
  readonly kind = 'local';
  private ch: BroadcastChannel;
  private seen = new Map<string, number>();
  private beats = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    room: string,
    private h: TransportHandlers,
    private maxBytes: number,
  ) {
    this.ch = new BroadcastChannel(`fly-around-sf:${room}`);
    this.ch.onmessage = (e: MessageEvent) => this.receive(e.data);
    this.post({ k: 'hello' });
    this.timer = setInterval(() => {
      this.post({ k: 'beat' });
      this.beats++;
      for (const [id, at] of this.seen) if (this.beats - at > EXPIRE_BEATS) this.drop(id);
    }, BEAT_MS);
  }

  private post(env: Record<string, unknown>): void {
    this.ch.postMessage(JSON.stringify({ ...env, from: this.selfId }));
  }

  private drop(id: string): void {
    if (this.seen.delete(id)) this.h.leave(id);
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string' || raw.length > this.maxBytes + 256) return;
    let env: { k?: unknown; from?: unknown; to?: unknown; d?: unknown };
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    const from = env.from;
    if (typeof from !== 'string' || from.length > 64 || from === this.selfId) return;
    if (env.to !== undefined && env.to !== this.selfId) return;
    if (env.k === 'bye') return this.drop(from);
    const fresh = !this.seen.has(from);
    this.seen.set(from, this.beats);
    if (fresh) {
      if (env.k === 'hello') this.post({ k: 'beat', to: from });
      this.h.join(from);
    }
    if (env.k === 'msg') this.h.message(env.d, from);
  }

  send(msg: unknown, to?: string): void {
    this.post(to ? { k: 'msg', d: msg, to } : { k: 'msg', d: msg });
  }

  addStream(): void {}

  removeStream(): void {}

  relays(): number {
    return 1;
  }

  leave(): void {
    clearInterval(this.timer);
    this.post({ k: 'bye' });
    this.ch.close();
    this.seen.clear();
  }
}

export async function openTransport(kind: TransportKind, room: string, h: TransportHandlers, maxBytes = 4096): Promise<Transport> {
  if (kind === 'local') return new LocalTransport(room, h, maxBytes);
  const { openP2P } = await import('./p2p');
  return openP2P(room, h, maxBytes);
}
