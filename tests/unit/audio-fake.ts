import { Kit } from '../../src/audio/synth';

export interface FakeParam {
  value: number;
  log: [string, number, number][];
  setValueAtTime(v: number, t: number): FakeParam;
  linearRampToValueAtTime(v: number, t: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t: number): FakeParam;
  setTargetAtTime(v: number, t: number): FakeParam;
  cancelScheduledValues(t: number): FakeParam;
}

function param(v: number): FakeParam {
  const p = { value: v, log: [] } as unknown as FakeParam;
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime'] as const)
    p[m] = (x: number, t: number) => {
      p.log.push([m, x, t]);
      p.value = x;
      return p;
    };
  p.cancelScheduledValues = (t: number) => (p.log.push(['cancel', 0, t]), p);
  return p;
}

export class FakeNode {
  kind: string;
  gain = param(1);
  frequency = param(440);
  detune = param(0);
  Q = param(1);
  positionX = param(0);
  positionY = param(0);
  positionZ = param(0);
  threshold = param(0);
  knee = param(0);
  ratio = param(0);
  attack = param(0);
  release = param(0);
  type = '';
  buffer: unknown = null;
  loop = false;
  started = 0;
  stopped = 0;
  outputs = new Set<unknown>();
  onended: (() => void) | null = null;
  panningModel = '';
  distanceModel = '';
  refDistance = 1;
  rolloffFactor = 1;

  constructor(kind: string) {
    this.kind = kind;
  }
  connect<T>(n: T): T {
    this.outputs.add(n);
    return n;
  }
  disconnect(): void {
    this.outputs.clear();
  }
  start(): void {
    this.started++;
  }
  stop(): void {
    this.stopped++;
  }
  addEventListener(): void {}
}

export interface FakeCtx {
  currentTime: number;
  sampleRate: number;
  created: number;
  nodes: FakeNode[];
  state: string;
  destination: FakeNode;
  createGain(): FakeNode;
  [k: string]: unknown;
}

export function fakeCtx(): FakeCtx {
  const ctx = {
    currentTime: 0,
    sampleRate: 4000,
    created: 0,
    nodes: [] as FakeNode[],
    state: 'running',
    destination: new FakeNode('destination'),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    resume: async () => void (ctx.state = 'running'),
    suspend: async () => void (ctx.state = 'suspended'),
  } as unknown as FakeCtx;
  return new Proxy(ctx, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k.startsWith('create'))
        return () => {
          t.created++;
          const n = new FakeNode(k.slice(6));
          t.nodes.push(n);
          return n;
        };
      return undefined;
    },
  });
}

export function fakeKit(): { kit: Kit; ctx: FakeCtx } {
  const ctx = fakeCtx();
  return { kit: new Kit(ctx as unknown as BaseAudioContext), ctx };
}
