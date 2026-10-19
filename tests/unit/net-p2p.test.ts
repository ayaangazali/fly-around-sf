import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Transport, TransportHandlers } from '../../src/net/transport';
import { JOIN_GRACE_MS, Net, UNREACHABLE_MS } from '../../src/net/session';
import { Voice } from '../../src/net/voice';
import { FakeCtx, netGame } from './net-helpers';

const fake = vi.hoisted(() => ({
  h: null as TransportHandlers | null,
  relays: 0,
  fail: false,
  streams: [] as [unknown, string | undefined][],
  removed: [] as [unknown, string | undefined][],
  sent: [] as [unknown, string | undefined][],
}));

vi.mock('../../src/net/p2p', () => ({
  openP2P: (_room: string, h: TransportHandlers): Transport => {
    if (fake.fail) throw new Error('chunk failed to load');
    fake.h = h;
    return {
      selfId: 'me',
      kind: 'p2p',
      send: (m, to) => void fake.sent.push([m, to]),
      addStream: (s, to) => void fake.streams.push([s, to]),
      removeStream: (s, to) => void fake.removed.push([s, to]),
      relays: () => fake.relays,
      leave: () => undefined,
    };
  },
}));

afterEach(() => {
  vi.useRealTimers();
  fake.h = null;
  fake.relays = 0;
  fake.fail = false;
  fake.streams = [];
  fake.removed = [];
  fake.sent = [];
});

function micVoice(): Voice {
  const ctx = new FakeCtx();
  return new Voice(
    () => ctx as unknown as AudioContext,
    () => ({ getUserMedia: (() => Promise.resolve({ getTracks: () => [], getAudioTracks: () => [] })) as unknown as MediaDevices['getUserMedia'] }),
  );
}

const listener = { pos: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };

describe('net session over the P2P transport', () => {
  it('[R-NET-OFFLINE] shows connecting, then unreachable when no relay answers, then recovers', async () => {
    vi.useFakeTimers();
    const game = await netGame();
    const statuses: string[] = [];
    game.bus.on('net:status', ({ status }) => statuses.push(status));
    const net = new Net(game, 'p2p');
    expect(await net.join('QXRK7')).toBe(true);
    expect(net.status).toBe('connecting');
    vi.advanceTimersByTime(UNREACHABLE_MS + 1500);
    expect(net.status).toBe('unreachable');
    fake.relays = 3;
    vi.advanceTimersByTime(1100);
    expect(net.status).toBe('online');
    expect(statuses).toEqual(['connecting', 'unreachable', 'online']);
    for (const id of ['p9', 'p9', 'p8']) fake.h?.error?.(id);
    fake.h?.join('p8');
    vi.advanceTimersByTime(JOIN_GRACE_MS - 1);
    expect(game.toasts).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(game.toasts).toEqual(['A friend could not connect directly. Their network may block peer to peer.']);
    net.leave();
    expect(net.status).toBe('off');
  });

  it('[R-NET-OFFLINE] a failed multiplayer load leaves single player untouched', async () => {
    fake.fail = true;
    const game = await netGame();
    const net = new Net(game, 'p2p');
    expect(await net.join('QXRK8')).toBe(false);
    expect(net.room).toBeNull();
    expect(net.status).toBe('unreachable');
    expect(game.toasts).toEqual([]);
    net.update(1 / 60, listener);
    expect(game.toasts).toEqual(['Multiplayer could not start. Single player keeps working.']);
    net.update(1 / 60, listener);
    expect(game.toasts).toHaveLength(1);
  });

  it('[R-VOICE] audio that arrives before the hello survives, blocking cuts it and unblocking restores it', async () => {
    const game = await netGame();
    const voice = micVoice();
    const net = new Net(game, 'p2p', voice);
    await net.join('VQCE2');
    const h = fake.h!;
    h.join('p1');
    const stream = { id: 's1' } as unknown as MediaStream;
    h.stream?.(stream, 'p1');
    net.update(1 / 60, listener);
    expect(voice.chains.get('p1')?.source).toBeDefined();
    h.message({ t: 'hi', name: 'Pia', color: '#5ec8ff' }, 'p1');
    h.message({ t: 'st', p: [5, 0, 0], v: [0, 0, 0], y: 0, m: 2 }, 'p1');
    for (let i = 0; i < 30; i++) net.update(1 / 60, listener);
    const chain = voice.chains.get('p1')!;
    expect(chain.source).toBeDefined();
    expect(chain.panner.positionX.value).toBeCloseTo(5, 1);
    expect(chain.gain.gain.value).toBeCloseTo(0.8, 2);
    expect(net.visiblePeers()[0].mic).toBe(2);
    net.setBlocked('p1', true);
    expect(voice.chains.has('p1')).toBe(false);
    net.setBlocked('p1', false);
    expect(voice.chains.get('p1')?.source).toBeDefined();
    expect(await net.enableVoice()).toBe('on');
    expect(fake.streams).toHaveLength(1);
    h.join('p2');
    expect(fake.streams.at(-1)?.[1]).toBe('p2');
    net.disableVoice();
    h.leave('p1');
    expect(voice.chains.has('p1')).toBe(false);
    expect(game.toasts.at(-1)).toBe('Pia left');
    net.leave();
  });

  it('[R-NET-SAFE] a block covers your mic, position, chat and pings, survives a reconnect, and a copied name gets an id suffix', async () => {
    const game = await netGame();
    game.save.data.settings.playerName = 'Me';
    const voice = micVoice();
    const net = new Net(game, 'p2p', voice);
    expect(await net.join('BLKAB')).toBe(true);
    const h = fake.h!;
    for (const [id, name] of [['pal', 'Alex'], ['troll', 'Alex'], ['copy', 'Me']]) {
      h.join(id);
      h.message({ t: 'hi', name, color: '#3fa9f5' }, id);
    }
    expect(net.visiblePeers().map((p) => p.name)).toEqual(['Alex', 'Alex (trol)', 'Me (copy)']);
    expect(await net.enableVoice()).toBe('on');
    net.setBlocked('troll', true);
    expect(fake.removed).toEqual([[voice.mic, 'troll']]);
    fake.sent = [];
    net.sendChat('meet me at Coit Tower');
    net.ping({ x: 1, y: 2, z: 3 });
    await new Promise((r) => setTimeout(r, 200));
    const types = (to: string) => fake.sent.filter(([, t]) => t === to).map(([m]) => (m as { t: string }).t);
    expect(types('pal')).toEqual(expect.arrayContaining(['chat', 'ping', 'st']));
    expect(types('troll')).toEqual([]);
    expect(fake.sent.every(([, to]) => to !== undefined)).toBe(true);
    h.leave('troll');
    h.join('troll');
    h.message({ t: 'hi', name: 'Troll', color: '#ff0000' }, 'troll');
    h.message({ t: 'chat', text: 'I am back' }, 'troll');
    expect(net.peers.get('troll')?.blocked).toBe(true);
    expect(net.visiblePeers().map((p) => p.id)).toEqual(['pal', 'copy']);
    expect(net.chat.map((l) => l.text)).toEqual(['meet me at Coit Tower']);
    expect(fake.streams.filter(([, to]) => to === 'troll')).toHaveLength(1);
    net.setBlocked('troll', false);
    expect(fake.streams.at(-1)).toEqual([voice.mic, 'troll']);
    net.leave();
  });

  it('[R-NET-PING] a friend whose link drops and comes back keeps their name, so a ping sent before their next hello still lands', async () => {
    const game = await netGame();
    const net = new Net(game, 'p2p');
    expect(await net.join('PNG22')).toBe(true);
    const h = fake.h!;
    h.join('p1');
    h.message({ t: 'hi', name: 'Ana', color: '#5ec8ff' }, 'p1');
    h.leave('p1');
    h.join('p1');
    h.message({ t: 'ping', p: [10, 2, -30] }, 'p1');
    expect(net.pings.get('p1')).toMatchObject({ name: 'Ana', p: { x: 10, y: 2, z: -30 } });
    expect(game.toasts).toEqual(['Ana joined the room', 'Ana left', 'Ana joined the room']);
    net.leave();
  });
});
