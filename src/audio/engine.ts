import type { SaveStore } from '../core/save';
import { busLevels, readMix, type BusLevels } from './mix';
import { Kit } from './synth';

export type BusName = keyof BusLevels;

export interface Graph {
  ctx: AudioContext;
  kit: Kit;
  buses: Record<BusName, GainNode>;
  duck: GainNode;
  musicTone: BiquadFilterNode;
}

export class AudioEngine {
  graph: Graph | null = null;
  private hidden = false;

  constructor(
    private save: SaveStore,
    private make: () => AudioContext = () => new AudioContext({ latencyHint: 'playback' }),
  ) {
    save.onChange(() => this.apply());
  }

  get ctx(): AudioContext | null {
    return this.graph?.ctx ?? null;
  }

  get muted(): boolean {
    return readMix(this.save.data.settings).muted;
  }

  get running(): boolean {
    return this.graph?.ctx.state === 'running';
  }

  unlock(): Graph | null {
    if (!this.graph) {
      let ctx: AudioContext;
      try {
        ctx = this.make();
      } catch {
        return null;
      }
      const master = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(limiter).connect(ctx.destination);
      const bus = () => {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(master);
        return g;
      };
      const buses = { master, music: bus(), sfx: bus(), ambience: bus() };
      master.gain.value = 0;
      const musicTone = ctx.createBiquadFilter();
      musicTone.type = 'lowpass';
      musicTone.frequency.value = 3600;
      const duck = ctx.createGain();
      musicTone.connect(duck).connect(buses.music);
      this.graph = { ctx, kit: new Kit(ctx), buses, duck, musicTone };
    }
    this.apply();
    return this.graph;
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.apply();
  }

  apply(): void {
    const g = this.graph;
    if (!g) return;
    const levels = busLevels(readMix(this.save.data.settings));
    const now = g.ctx.currentTime;
    for (const name of Object.keys(levels) as BusName[]) g.buses[name].gain.setTargetAtTime(levels[name], now, 0.06);
    const sleep = levels.master === 0 || this.hidden;
    if (!sleep && g.ctx.state !== 'running') void g.ctx.resume().catch(() => undefined);
    else if (sleep)
      setTimeout(() => {
        if (this.muted || this.hidden) void g.ctx.suspend().catch(() => undefined);
      }, 400);
  }

  setMuted(muted: boolean): void {
    this.save.data.settings.muted = muted;
    this.save.persist();
  }

  duck(depth: number, hold: number): void {
    const g = this.graph;
    if (!g) return;
    const now = g.ctx.currentTime;
    const p = g.duck.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(depth, now, 0.05);
    p.setTargetAtTime(1, now + hold, 0.5);
  }
}
