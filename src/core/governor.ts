export interface Rung {
  pixelRatio: number;
  shadow: boolean;
  far: number;
}

export const RUNGS: readonly Rung[] = [
  { pixelRatio: 2, shadow: true, far: 14000 },
  { pixelRatio: 1.5, shadow: true, far: 10000 },
  { pixelRatio: 1, shadow: false, far: 6000 },
  { pixelRatio: 0.75, shadow: false, far: 4000 },
];

export const GOVERNOR = { windowMs: 2000, minFrames: 3, slowMs: 28, fastMs: 18, holdMs: 30000 };

export class Governor {
  private frames: number[] = [];
  private start = -1;
  private until = new Map<number, number>();
  private strikes = new Map<number, number>();

  constructor(
    public rung: number,
    readonly top: number,
    readonly bottom = RUNGS.length - 1,
  ) {}

  sample(ms: number, now: number): boolean {
    if (this.start < 0) this.start = now;
    this.frames.push(ms);
    if (now - this.start < GOVERNOR.windowMs) return false;
    const n = this.frames.length;
    const median = this.frames.sort((a, b) => a - b)[n >> 1];
    this.frames = [];
    this.start = -1;
    if (n < GOVERNOR.minFrames) return false;
    if (median > GOVERNOR.slowMs && this.rung < this.bottom) {
      const strikes = (this.strikes.get(this.rung) ?? 0) + 1;
      this.strikes.set(this.rung, strikes);
      this.until.set(this.rung, now + GOVERNOR.holdMs * 2 ** (strikes - 1));
      this.rung++;
      return true;
    }
    if (median < GOVERNOR.fastMs && this.rung > this.top && now >= (this.until.get(this.rung - 1) ?? 0)) {
      this.rung--;
      return true;
    }
    return false;
  }
}
