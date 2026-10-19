import { describe, it, expect } from 'vitest';
import { voiceGain, voiceVolume, VOICE_FAR, VOICE_NEAR, predict, approach, approachAngle, rayToGround, MAX_EXTRAPOLATE, SNAP_DISTANCE } from '../../src/net/math';
import { Voice } from '../../src/net/voice';
import { FakeCtx, type FakeNode as Node } from './net-helpers';

function track() {
  return { enabled: true, stopped: false, stop() {
    this.stopped = true;
  } };
}

function voice(media?: () => Promise<unknown>) {
  const ctx = new FakeCtx();
  const t = track();
  const stream = { getTracks: () => [t], getAudioTracks: () => [t] };
  const v = new Voice(
    () => ctx as unknown as AudioContext,
    () => ({ getUserMedia: (media ?? (() => Promise.resolve(stream))) as unknown as MediaDevices['getUserMedia'] }),
  );
  return { v, ctx, t, stream };
}

const listener = { pos: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };

describe('proximity voice', () => {
  it('[R-VOICE] gain is full up close, falls smoothly with distance and is silent past range', () => {
    expect(voiceGain(0, 0.8)).toBe(0.8);
    expect(voiceGain(VOICE_NEAR, 1)).toBe(1);
    expect(voiceGain(VOICE_FAR, 1)).toBe(0);
    expect(voiceGain(5000, 1)).toBe(0);
    expect(voiceGain(Number.NaN, 1)).toBe(0);
    expect(voiceGain(10, 0)).toBe(0);
    let prev = 2;
    for (let d = VOICE_NEAR; d < VOICE_FAR; d += 10) {
      const g = voiceGain(d, 1);
      expect(g).toBeLessThan(prev + 1e-12);
      prev = g;
    }
    expect(voiceGain((VOICE_NEAR + VOICE_FAR) / 2, 1)).toBeCloseTo(0.25, 5);
  });

  it('[R-VOICE] voice volume follows volVoice, volMaster, global mute and per-peer mute', () => {
    expect(voiceVolume({})).toBeCloseTo(0.8);
    expect(voiceVolume({ volVoice: 0.5, volMaster: 1 })).toBe(0.5);
    expect(voiceVolume({ volVoice: 3, volMaster: -1 })).toBe(0);
    expect(voiceVolume({ muted: true })).toBe(0);
    expect(voiceVolume({}, true)).toBe(0);
  });

  it('[R-VOICE] one HRTF panner per peer sits at the drone, mute silences it, dropping disconnects it', async () => {
    const { v, ctx } = voice();
    expect(await v.enable()).toBe('on');
    v.update(listener, [
      { id: 'a', pos: { x: 5, y: 0, z: 0 }, volume: 0.8 },
      { id: 'b', pos: { x: 0, y: 0, z: -200 }, volume: 0.8 },
    ]);
    expect(v.chains.size).toBe(2);
    const a = v.chains.get('a')!;
    const b = v.chains.get('b')!;
    expect(a.panner.panningModel).toBe('HRTF');
    expect(a.panner.rolloffFactor).toBe(0);
    expect(a.panner.positionX.value).toBe(5);
    expect(b.panner.positionZ.value).toBe(-200);
    expect(a.gain.gain.value).toBeCloseTo(0.8);
    expect(b.gain.gain.value).toBeCloseTo(voiceGain(200, 0.8));
    expect(b.gain.gain.value).toBeLessThan(a.gain.gain.value);
    expect(ctx.listener.forwardZ.value).toBe(-1);
    v.update(listener, [{ id: 'a', pos: { x: 5, y: 0, z: 0 }, volume: 0 }]);
    expect(a.gain.gain.value).toBe(0);
    expect(v.chains.get('b')).toBe(b);
    v.drop('b');
    expect(v.chains.has('b')).toBe(false);
    expect((b.gain as unknown as Node).disconnected).toBe(true);
  });

  it('[R-VOICE] incoming streams connect into the peer chain and replace an older source', () => {
    const { v } = voice();
    const s1 = {} as MediaStream;
    v.attach('a', s1);
    const first = v.chains.get('a')!.source as unknown as Node;
    expect(first.connected[0]).toBe(v.chains.get('a')!.gain);
    v.attach('a', s1);
    expect(first.disconnected).toBe(true);
    expect(v.chains.size).toBe(1);
    v.drop('a');
    v.drop('missing');
    expect(v.chains.size).toBe(0);
  });

  it('[R-VOICE] push to talk only opens the microphone while talking; open mic keeps it on', async () => {
    const { v, t } = voice();
    await v.enable();
    expect(v.on).toBe(true);
    expect(t.enabled).toBe(false);
    v.setTalking(true);
    expect(t.enabled).toBe(true);
    expect(v.transmitting).toBe(true);
    v.setTalking(false);
    expect(t.enabled).toBe(false);
    v.setMode('open');
    expect(t.enabled).toBe(true);
    expect(await v.enable()).toBe('on');
    v.disable();
    expect(t.stopped).toBe(true);
    expect(v.on).toBe(false);
    expect(v.transmitting).toBe(false);
  });

  it('[R-VOICE] microphone failures map to clear reasons', async () => {
    const fail = (name: string) => () => Promise.reject(Object.assign(new Error(name), { name }));
    expect(await voice(fail('NotAllowedError')).v.enable()).toBe('denied');
    expect(await voice(fail('NotFoundError')).v.enable()).toBe('missing');
    expect(await voice(fail('AbortError')).v.enable()).toBe('failed');
    const none = new Voice(() => new FakeCtx() as unknown as AudioContext, () => undefined);
    expect(await none.enable()).toBe('unsupported');
  });

  it('[R-NET-PING] the ping chime plays only on a running context with volume', () => {
    const { v, ctx } = voice();
    v.blip([440], 1);
    expect(ctx.oscillators).toBe(0);
    v.audio();
    v.blip([440, 660], 1);
    expect(ctx.oscillators).toBe(2);
    v.blip([440], 0);
    expect(ctx.oscillators).toBe(2);
    v.close();
    expect(v.ctx).toBeNull();
  });
});

describe('remote motion smoothing', () => {
  it('[R-NET-SYNC] extrapolates with velocity for a short, bounded time', () => {
    const p = { x: 0, y: 10, z: 0 };
    const v = { x: 10, y: 0, z: -5 };
    expect(predict(p, v, 0.1)).toEqual({ x: 1, y: 10, z: -0.5 });
    expect(predict(p, v, 5)).toEqual({ x: 10 * MAX_EXTRAPOLATE, y: 10, z: -5 * MAX_EXTRAPOLATE });
    expect(predict(p, v, -1)).toEqual(p);
  });

  it('[R-NET-SYNC] eases toward the target, converges, and snaps on teleports', () => {
    let cur = { x: 0, y: 0, z: 0 };
    const target = { x: 20, y: 5, z: 0 };
    cur = approach(cur, target, 1 / 60);
    expect(cur.x).toBeGreaterThan(0);
    expect(cur.x).toBeLessThan(20);
    for (let i = 0; i < 120; i++) cur = approach(cur, target, 1 / 60);
    expect(cur.x).toBeCloseTo(20, 3);
    expect(approach({ x: 0, y: 0, z: 0 }, { x: SNAP_DISTANCE + 1, y: 0, z: 0 }, 1 / 60).x).toBe(SNAP_DISTANCE + 1);
    const yaw = approachAngle(3.1, -3.1, 1);
    expect(Math.abs(Math.atan2(Math.sin(yaw - -3.1), Math.cos(yaw - -3.1)))).toBeLessThan(0.01);
  });

  it('[R-NET-PING] the look ray lands on the ground or a roof ahead', () => {
    const flat = rayToGround({ x: 0, y: 40, z: 0 }, { x: 0, y: -1, z: -1 }, () => 0);
    expect(flat.y).toBe(0);
    expect(flat.z).toBeLessThan(-35);
    const roof = rayToGround({ x: 0, y: 40, z: 0 }, { x: 0, y: -0.2, z: -1 }, (_x, z) => (z < -50 ? 60 : 0));
    expect(roof.y).toBe(60);
    const sky = rayToGround({ x: 0, y: 40, z: 0 }, { x: 0, y: 1, z: 0 }, () => 0);
    expect(sky).toEqual({ x: 0, y: 0, z: 0 });
  });
});
