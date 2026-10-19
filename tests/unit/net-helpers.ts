import { fakeGame, loadDefs, loadKinds } from './helpers';
import type { Game } from '../../src/game';
import type { Vec3 } from '../../src/player/flight';

export async function netGame(): Promise<Game & { toasts: string[] }> {
  const game = fakeGame() as Game & { toasts: string[] };
  const toasts: string[] = [];
  Object.assign(game, {
    toasts,
    toast: (text: string) => toasts.push(text),
    teleport(p: Vec3, yaw?: number) {
      game.flight.pos = { ...p };
      game.flight.vel = { x: 0, y: 0, z: 0 };
      if (yaw !== undefined) game.flight.yaw = yaw;
    },
    sky: { fogDensity: 1 },
    panels: { close() {}, openId: null },
  });
  game.activities.register(await loadKinds(), loadDefs());
  return game;
}

export async function until(fn: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

export class Param {
  value = 0;
  setTargetAtTime(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
  }
}

export class FakeNode {
  connected: FakeNode[] = [];
  disconnected = false;
  connect(n: FakeNode) {
    this.connected.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class FakeCtx {
  state = 'running';
  currentTime = 0;
  destination = new FakeNode();
  oscillators = 0;
  listener = { positionX: new Param(), positionY: new Param(), positionZ: new Param(), forwardX: new Param(), forwardY: new Param(), forwardZ: new Param(), upX: new Param(), upY: new Param(), upZ: new Param() };
  createGain() {
    return Object.assign(new FakeNode(), { gain: new Param() });
  }
  createPanner() {
    return Object.assign(new FakeNode(), { panningModel: 'equalpower', distanceModel: 'inverse', rolloffFactor: 1, positionX: new Param(), positionY: new Param(), positionZ: new Param() });
  }
  createMediaStreamSource() {
    return new FakeNode();
  }
  createOscillator() {
    this.oscillators++;
    return Object.assign(new FakeNode(), { type: '', frequency: new Param(), start() {}, stop() {} });
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}
