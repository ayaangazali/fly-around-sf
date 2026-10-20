import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Transport, TransportHandlers } from '../../src/net/transport';
import { JOIN_GRACE_MS, Net, SPREAD, UNREACHABLE_MS } from '../../src/net/session';
import { DRONE_COLORS } from '../../src/ui/settings-model';
import { Voice } from '../../src/net/voice';
import { CODE_ALPHABET, CODE_LENGTH, makeCode, parse } from '../../src/net/protocol';
import { FakeCtx, netGame } from './net-helpers';
import { memoryStorage } from './helpers';
import { SaveStore } from '../../src/core/save';

const fake = vi.hoisted(() => ({
  h: null as TransportHandlers | null,
  relays: 0,
  fail: false,
  streams: [] as [unknown, string | undefined][],
  removed: [] as [unknown, string | undefined][],
  sent: [] as [unknown, string | undefined][],
  rooms: [] as string[],
}));

vi.mock('../../src/net/p2p', () => ({
  openP2P: (room: string, h: TransportHandlers): Transport => {
    if (fake.fail) throw new Error('chunk failed to load');
    fake.rooms.push(room);
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
  vi.restoreAllMocks();
  fake.rooms = [];
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
    expect(await net.join('QXRK7'.padEnd(16, 'X'))).toBe(true);
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
    expect(await net.join('QXRK8'.padEnd(16, 'X'))).toBe(false);
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
    await net.join('VQCE2'.padEnd(16, 'X'));
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
    expect(fake.streams.at(-1)?.[1]).toBe('p1');
    h.message({ t: 'hi', name: 'Pax', color: '#5ec8ff' }, 'p2');
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
    expect(await net.join('BLKAB'.padEnd(16, 'X'))).toBe(true);
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
    expect(await net.join('PNG22'.padEnd(16, 'X'))).toBe(true);
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

  it('[R-V2-NET-CODES] room and sync codes carry 80 random bits from the crypto source, short codes are refused and the relay room is the whole code', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(CODE_ALPHABET.length ** CODE_LENGTH).toBeGreaterThanOrEqual(2 ** 80);
    expect(new Set(Array.from({ length: 50 }, () => makeCode())).size).toBe(50);
    const game = await netGame();
    const net = new Net(game, 'p2p');
    expect(await net.join('QXRK7')).toBe(false);
    expect(await net.join('QXRK7QXRK7QXRK7')).toBe(false);
    expect(fake.rooms).toEqual([]);
    const code = await net.create();
    expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));
    expect(fake.rooms).toEqual([`room-${code}`]);
    const sync = await net.sync.offer();
    expect(sync).toMatch(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));
    expect(fake.rooms.at(-1)).toBe(`sync-${sync}`);
    expect(await net.sync.receive(sync.slice(0, 8))).toBe(false);
    net.sync.stop();
    net.leave();
  });

  it('[R-V2-NET-SILENT] a peer that never says hi gets only our hello: no position, chat, ping, match or microphone until it announces itself', async () => {
    const game = await netGame();
    const net = new Net(game, 'p2p', micVoice());
    expect(await net.join('SHHHH'.padEnd(16, 'X'))).toBe(true);
    expect(await net.enableVoice()).toBe('on');
    const h = fake.h!;
    h.join('pal');
    h.message({ t: 'hi', name: 'Pal', color: '#3fa9f5' }, 'pal');
    fake.sent = [];
    h.join('lurker');
    net.sendChat('meet at the Ferry Building');
    net.ping({ x: 1, y: 2, z: 3 });
    expect(net.startMatch('tag')).toBe(true);
    await new Promise((r) => setTimeout(r, 250));
    const to = (id: string) => fake.sent.filter(([, t]) => t === id).map(([m]) => (m as { t: string }).t);
    expect(to('pal')).toEqual(expect.arrayContaining(['st', 'chat', 'ping', 'start']));
    expect(to('lurker')).toEqual(['hi']);
    expect(fake.sent.every(([, t]) => t !== undefined)).toBe(true);
    expect(fake.streams.map(([, t]) => t)).toEqual(['pal']);
    expect(net.visiblePeers().map((p) => p.id)).toEqual(['pal']);
    h.message({ t: 'hi', name: 'Lurker', color: '#ff0000' }, 'lurker');
    expect(fake.streams.map(([, t]) => t)).toEqual(['pal', 'lurker']);
    expect(game.toasts).toContain('Lurker joined the room');
    fake.sent = [];
    await new Promise((r) => setTimeout(r, 250));
    expect(to('lurker')).toContain('st');
    net.leave();
  });

  it('[R-V2-NET-BLOCK] a blocked player stays blocked when they reload their tab and after we reload ours', async () => {
    const storage = memoryStorage();
    const game = await netGame();
    Object.assign(game, { save: new SaveStore(storage) });
    const net = new Net(game, 'p2p', micVoice());
    expect(await net.join('BLKRL'.padEnd(16, 'X'))).toBe(true);
    expect(await net.enableVoice()).toBe('on');
    const troll = { t: 'hi', name: 'Troll', color: '#ff0000', uid: '0123456789abcdef' };
    expect(parse(troll)).toEqual(troll);
    expect(parse({ ...troll, uid: '<b>0123456789ab</b>' })).toEqual({ t: 'hi', name: 'Troll', color: '#ff0000' });
    fake.h!.join('tab1');
    fake.h!.message(troll, 'tab1');
    expect(net.visiblePeers().map((p) => p.name)).toEqual(['Troll']);
    net.setBlocked('tab1', true);
    fake.h!.leave('tab1');
    fake.sent = [];
    fake.streams = [];
    game.toasts.length = 0;
    fake.h!.join('tab2');
    fake.h!.message(troll, 'tab2');
    fake.h!.message({ t: 'chat', text: 'B after reload' }, 'tab2');
    await new Promise((r) => setTimeout(r, 200));
    expect(net.peers.get('tab2')?.blocked).toBe(true);
    expect(net.visiblePeers()).toEqual([]);
    expect(net.chat).toEqual([]);
    expect(fake.streams).toEqual([]);
    expect(fake.sent.filter(([, to]) => to === 'tab2').map(([m]) => (m as { t: string }).t)).toEqual(['hi']);
    expect(game.toasts.filter((t) => t.includes('joined'))).toEqual([]);
    net.leave();
    const reloaded = await netGame();
    Object.assign(reloaded, { save: new SaveStore(storage) });
    const again = new Net(reloaded, 'p2p');
    expect(await again.join('BLKRL'.padEnd(16, 'X'))).toBe(true);
    fake.h!.join('tab3');
    fake.h!.message({ ...troll, name: 'Not Troll' }, 'tab3');
    expect(again.peers.get('tab3')).toMatchObject({ known: true, blocked: true });
    expect(again.visiblePeers()).toEqual([]);
    again.setBlocked('tab3', false);
    expect(again.visiblePeers().map((p) => p.name)).toEqual(['Not Troll']);
    expect(new SaveStore(storage).data.settings.netBlocked).toBe('');
    again.leave();
  });

  it('[R-V2-NET-NAMES] a lookalike of your name or a friend name gets the id suffix just like an exact copy', async () => {
    const game = await netGame();
    game.save.data.settings.playerName = 'Pilot-1878';
    const net = new Net(game, 'p2p');
    expect(await net.join('NAMES'.padEnd(16, 'X'))).toBe(true);
    const h = fake.h!;
    const names: [string, string][] = [
      ['ana1', 'Ana'],
      ['cyri', '\u0420\u0456lot-1878'],
      ['bold', '\u{1d40f}ilot\u20101878'],
      ['caps', 'PiIot 1878'],
      ['grek', '\u0391n\u03b1'],
      ['paul', 'Paula'],
    ];
    for (const [id, name] of names) {
      h.join(id);
      h.message({ t: 'hi', name, color: '#f2f2ee' }, id);
    }
    expect(net.visiblePeers().map((p) => p.name)).toEqual(['Ana', '\u0420\u0456lot-1878 (cyri)', '\u{1d40f}ilot\u20101878 (bold)', 'PiIot 1878 (caps)', '\u0391n\u03b1 (grek)', 'Paula']);
    net.leave();
  });

  it('[R-V2-NET-SPAWN] pilots stacked on one spot spread apart once, only the larger id moves, and new pilots get a random swatch color', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const game = await netGame();
    delete game.save.data.settings.droneColor;
    const net = new Net(game, 'p2p');
    expect(game.save.data.settings.droneColor).toBe(DRONE_COLORS.at(-1));
    expect(await net.join('SPAWN'.padEnd(16, 'X'))).toBe(true);
    const h = fake.h!;
    const here = () => ({ ...game.flight.pos });
    const at = (p: { x: number; y: number; z: number }) => [p.x, p.y, p.z];
    const start = here();
    h.join('zz');
    h.message({ t: 'hi', name: 'Zed', color: '#ff7eb6' }, 'zz');
    h.message({ t: 'st', p: at(start), v: [0, 0, 0], y: 0, m: 0 }, 'zz');
    expect(here()).toEqual(start);
    h.join('aa');
    h.message({ t: 'hi', name: 'Abe', color: '#5ec8ff' }, 'aa');
    h.message({ t: 'st', p: at(start), v: [0, 0, 0], y: 0, m: 0 }, 'aa');
    expect(Math.hypot(here().x - start.x, here().z - start.z)).toBeCloseTo(SPREAD, 5);
    expect(here().y).toBe(start.y);
    const moved = here();
    h.message({ t: 'st', p: at(moved), v: [0, 0, 0], y: 0, m: 0 }, 'aa');
    h.join('ab');
    h.message({ t: 'hi', name: 'Bea', color: '#7de0a6' }, 'ab');
    game.flight.vel = { x: 30, y: 0, z: 0 };
    h.message({ t: 'st', p: at(moved), v: [0, 0, 0], y: 0, m: 0 }, 'ab');
    expect(here()).toEqual(moved);
    net.leave();
  });
});
