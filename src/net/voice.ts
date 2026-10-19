import type { Vec3 } from '../player/flight';
import { voiceGain } from './math';

export type VoiceResult = 'on' | 'denied' | 'missing' | 'unsupported' | 'failed';
export type VoiceMode = 'ptt' | 'open';

export interface PeerChain {
  gain: GainNode;
  panner: PannerNode;
  source?: MediaStreamAudioSourceNode;
  sink?: HTMLAudioElement;
}

export interface Listener {
  pos: Vec3;
  forward: Vec3;
  up: Vec3;
}

export interface VoicePeer {
  id: string;
  pos: Vec3;
  volume: number;
}

type MediaSource = Pick<MediaDevices, 'getUserMedia'> | undefined;

export class Voice {
  ctx: AudioContext | null = null;
  mic: MediaStream | null = null;
  mode: VoiceMode = 'ptt';
  talking = false;
  readonly chains = new Map<string, PeerChain>();

  constructor(
    private makeContext: () => AudioContext = () => new AudioContext(),
    private media: () => MediaSource = () => (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined),
  ) {}

  get on(): boolean {
    return !!this.mic;
  }

  get transmitting(): boolean {
    return this.on && (this.mode === 'open' || this.talking);
  }

  audio(): AudioContext {
    if (!this.ctx) this.ctx = this.makeContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  async enable(): Promise<VoiceResult> {
    if (this.mic) return 'on';
    const media = this.media();
    if (!media?.getUserMedia) return 'unsupported';
    try {
      this.audio();
      this.mic = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      const name = (e as { name?: string }).name;
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'failed';
    }
    this.applyTrack();
    return 'on';
  }

  disable(): void {
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.talking = false;
  }

  setMode(mode: VoiceMode): void {
    this.mode = mode;
    this.applyTrack();
  }

  setTalking(on: boolean): void {
    if (on === this.talking) return;
    this.talking = on;
    this.applyTrack();
  }

  private applyTrack(): void {
    const live = this.transmitting;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = live));
  }

  ensure(id: string): PeerChain {
    let c = this.chains.get(id);
    if (c) return c;
    const ctx = this.ctx ?? this.audio();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(panner).connect(ctx.destination);
    c = { gain, panner };
    this.chains.set(id, c);
    return c;
  }

  attach(id: string, stream: MediaStream): void {
    const c = this.ensure(id);
    c.source?.disconnect();
    c.source = this.audio().createMediaStreamSource(stream);
    c.source.connect(c.gain);
    if (typeof Audio !== 'undefined') {
      c.sink ??= new Audio();
      c.sink.muted = true;
      c.sink.srcObject = stream;
      void c.sink.play().catch(() => undefined);
    }
  }

  drop(id: string): void {
    const c = this.chains.get(id);
    if (!c) return;
    c.source?.disconnect();
    c.gain.disconnect();
    c.panner.disconnect();
    if (c.sink) c.sink.srcObject = null;
    this.chains.delete(id);
  }

  update(listener: Listener, peers: VoicePeer[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const l = ctx.listener;
    const { pos: p, forward: f, up: u } = listener;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02);
      l.upY.setTargetAtTime(u.y, t, 0.02);
      l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    const live = new Set<string>();
    for (const peer of peers) {
      live.add(peer.id);
      const c = this.ensure(peer.id);
      const d = Math.hypot(peer.pos.x - p.x, peer.pos.y - p.y, peer.pos.z - p.z);
      c.gain.gain.setTargetAtTime(voiceGain(d, peer.volume), t, 0.05);
      c.panner.positionX.setTargetAtTime(peer.pos.x, t, 0.02);
      c.panner.positionY.setTargetAtTime(peer.pos.y, t, 0.02);
      c.panner.positionZ.setTargetAtTime(peer.pos.z, t, 0.02);
    }
    for (const id of [...this.chains.keys()]) if (!live.has(id)) this.drop(id);
  }

  close(): void {
    this.disable();
    for (const id of [...this.chains.keys()]) this.drop(id);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  blip(freqs: number[], volume: number): void {
    if (!this.ctx || this.ctx.state !== 'running' || volume <= 0) return;
    const ctx = this.ctx;
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18 * volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
  }
}
