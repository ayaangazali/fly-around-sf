import { describe, it, expect, afterEach } from 'vitest';
import { Net } from '../../src/net/session';
import { LocalTransport, openTransport } from '../../src/net/transport';
import { netGame, until } from './net-helpers';

const open: Net[] = [];

async function pair(room = 'RYM2') {
  const ga = await netGame();
  const gb = await netGame();
  ga.save.data.settings.playerName = 'Ana';
  ga.save.data.settings.droneColor = '#5ec8ff';
  gb.save.data.settings.playerName = 'Ben';
  const a = new Net(ga, 'local');
  const b = new Net(gb, 'local');
  open.push(a, b);
  expect(await a.join(room)).toBe(true);
  expect(await b.join(room.toLowerCase())).toBe(true);
  await until(() => a.visiblePeers().length === 1 && b.visiblePeers().length === 1);
  return { a, b, ga, gb };
}

afterEach(() => {
  for (const n of open.splice(0)) n.leave();
});

describe('net session over the local transport', () => {
  it('[R-NET-SYNC] peers introduce themselves and see each other move smoothly', async () => {
    const { a, b, ga, gb } = await pair();
    expect(b.visiblePeers()[0]).toMatchObject({ name: 'Ana', color: '#5ec8ff' });
    expect(a.visiblePeers()[0].name).toBe('Ben');
    expect(gb.toasts).toContain('Ana joined the room');
    expect(a.status).toBe('online');
    ga.flight.pos = { x: 120, y: 60, z: -40 };
    ga.flight.vel = { x: 0, y: 0, z: 0 };
    const peer = () => b.visiblePeers()[0];
    await until(() => peer().sample?.p.x === 120);
    for (let i = 0; i < 120; i++) b.update(1 / 60);
    expect(Math.hypot(peer().pos.x - 120, peer().pos.y - 60, peer().pos.z + 40)).toBeLessThan(0.5);
    ga.flight.pos = { x: 125, y: 60, z: -40 };
    await until(() => peer().sample?.p.x === 125);
    b.update(1 / 60);
    expect(peer().pos.x).toBeGreaterThan(120);
    expect(peer().pos.x).toBeLessThan(125);
  });

  it('[R-NET-SYNC] a renamed pilot re-announces and a leaving pilot is removed with a toast', async () => {
    const { a, b, ga, gb } = await pair('RYM3');
    ga.save.data.settings.playerName = 'Ana B';
    ga.save.persist();
    await until(() => b.visiblePeers()[0]?.name === 'Ana B');
    a.leave();
    await until(() => b.peers.size === 0);
    expect(gb.toasts).toContain('Ana B left');
    expect(a.room).toBeNull();
    expect(a.status).toBe('off');
  });

  it('[R-NET-CHAT] chat reaches the other player, is capped and rate limited', async () => {
    const { a, b } = await pair('RYM4');
    expect(a.sendChat(`<script>${'y'.repeat(300)}`)).toBe('ok');
    await until(() => b.chat.length === 1);
    expect(b.chat[0]).toMatchObject({ name: 'Ana', self: false });
    expect(b.chat[0].text).toHaveLength(140);
    expect(a.chat[0].self).toBe(true);
    const results = [1, 2, 3, 4, 5].map((i) => a.sendChat(`m${i}`));
    expect(results.filter((r) => r === 'ok').length).toBe(3);
    expect(results).toContain('slow');
    expect(a.sendChat('')).toBe('empty');
    const solo = new Net(await netGame(), 'local');
    expect(solo.sendChat('hello')).toBe('offline');
  });

  it('[R-NET-PING] a ping is shared, expires after its lifetime and map requests ping too', async () => {
    const { a, b, ga } = await pair('RYM5');
    a.ping({ x: 10.123, y: 2, z: -30 });
    await until(() => b.pings.has(a.selfId));
    expect(b.pings.get(a.selfId)?.p).toEqual({ x: 10.12, y: 2, z: -30 });
    expect(a.pings.get(a.selfId)?.p).toEqual({ x: 10.12, y: 2, z: -30 });
    for (let i = 0; i < 11; i++) b.update(1);
    expect(b.pings.size).toBe(0);
    ga.bus.emit('net:ping-request', { x: 500, z: 500 });
    await until(() => b.pings.has(a.selfId));
    expect(b.pings.get(a.selfId)?.p).toEqual({ x: 500, y: 0, z: 500 });
  });

  it('[R-NET-SAFE] blocking hides a peer and drops their messages; muting is local', async () => {
    const { a, b } = await pair('RYM6');
    const id = b.visiblePeers()[0].id;
    b.setBlocked(id, true);
    expect(b.visiblePeers()).toHaveLength(0);
    a.sendChat('hello?');
    a.ping({ x: 0, y: 0, z: 0 });
    await new Promise((r) => setTimeout(r, 120));
    expect(b.chat).toHaveLength(0);
    expect(b.pings.size).toBe(0);
    b.setBlocked(id, false);
    b.setMuted(id, true);
    expect(b.visiblePeers()[0].muted).toBe(true);
    b.setMuted('nobody', true);
    b.setBlocked('nobody', true);
  });

  it('[R-NET-SAFE] forged and oversized messages from a peer are ignored', async () => {
    const { a, b } = await pair('RYM7');
    const t = a.transport!;
    t.send({ t: 'chat', text: 'x'.repeat(5000) });
    t.send({ t: 'hi', name: '', color: 'red' });
    t.send({ t: 'st', p: ['a', 0, 0], v: [0, 0, 0], y: 0 });
    t.send('raw string');
    await new Promise((r) => setTimeout(r, 120));
    expect(b.chat).toHaveLength(0);
    expect(b.visiblePeers()[0].name).toBe('Ana');
  });

  it('[R-SHARE] the share link carries the room code and keeps the local test transport', async () => {
    const g = globalThis as unknown as { location?: unknown };
    const before = g.location;
    g.location = new URL('https://example.github.io/fly-around-sf/?test&room=OLD#x');
    try {
      const n = new Net(await netGame(), 'local');
      open.push(n);
      expect(n.shareUrl()).toBeNull();
      expect(await n.join('bad')).toBe(false);
      const code = await n.create();
      expect(code).toMatch(/^[A-Z2-9]{5}$/);
      expect(n.shareUrl()).toBe(`https://example.github.io/fly-around-sf/?room=${code}&net=local`);
      expect(await n.join(code)).toBe(true);
    } finally {
      g.location = before;
    }
  });

  it('[R-NET-MODES] matches need a friend and start for everyone in the room', async () => {
    const solo = new Net(await netGame(), 'local');
    expect(solo.startMatch('tag')).toBe(false);
    const { a, b } = await pair('RYM8');
    expect(a.raceOptions().map((r) => r.id)).toContain('rings-marina-warmup');
    expect(a.startMatch('race', { activity: 'nope' })).toBe(false);
    expect(a.startMatch('tag', { role: b.selfId, duration: 30 })).toBe(true);
    expect(a.startMatch('formation')).toBe(false);
    await until(() => !!b.match);
    expect(b.match?.role).toBe(b.selfId);
    expect(b.match?.host).toBe(a.selfId);
    b.cancelMatch();
    expect(b.match?.phase).toBe('countdown');
    a.cancelMatch();
    expect(a.match?.phase).toBe('done');
    await until(() => b.match?.phase === 'done');
    for (let i = 0; i < 14; i++) a.update(1);
    expect(a.match).toBeNull();
  });

  it('[R-NET-SYNC] the local transport ignores its own echoes, other targets and junk', async () => {
    const seen: unknown[] = [];
    const joins: string[] = [];
    const t1 = new LocalTransport('JUNK', { message: (m) => seen.push(m), join: (id) => joins.push(id), leave: () => undefined }, 64);
    const ch = new BroadcastChannel('fly-around-sf:JUNK');
    ch.postMessage('not json');
    ch.postMessage(42);
    ch.postMessage(JSON.stringify({ k: 'msg', from: t1.selfId, d: 'echo' }));
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'zz', to: 'someone-else', d: 'nope' }));
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'zz', d: 'x'.repeat(500) }));
    ch.postMessage(JSON.stringify({ k: 'msg', from: 'zz', d: 'ok' }));
    await until(() => seen.length === 1);
    expect(seen).toEqual(['ok']);
    expect(joins).toEqual(['zz']);
    expect(t1.relays()).toBe(1);
    t1.addStream();
    t1.removeStream();
    ch.close();
    t1.leave();
    const t2 = await openTransport('local', 'JUNK2', { message: () => undefined, join: () => undefined, leave: () => undefined });
    expect(t2.kind).toBe('local');
    t2.leave();
  });
});
