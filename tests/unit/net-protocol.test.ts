import { describe, it, expect } from 'vitest';
import { cleanColor, cleanText, CODE_ALPHABET, encode, LIMITS, makeCode, normalizeCode, parse, RateLimiter, wrapAngle } from '../../src/net/protocol';

describe('net protocol', () => {
  it('[R-SHARE] room codes use an unambiguous alphabet and normalize user input', () => {
    let i = 0;
    const seq = [0, 0.5, 0.999];
    const code = makeCode(6, () => seq[i++ % seq.length]);
    expect(code).toHaveLength(6);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    expect(normalizeCode(' k7qd-5 ')).toBe('K7QD5');
    expect(normalizeCode('abc')).toBeNull();
    expect(normalizeCode('O0I1L')).toBeNull();
    expect(normalizeCode('ABCDEFGHJ')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
    expect(normalizeCode(makeCode())).not.toBeNull();
  });

  it('[R-NET-CHAT] chat text is trimmed, stripped of control and bidi characters, and capped at 140', () => {
    expect(cleanText('  hi\u0000 there\u202e  ', 140)).toBe('hi there');
    expect(cleanText('a\nb\tc', 140)).toBe('a b c');
    expect(cleanText(7, 140)).toBe('');
    expect(cleanText(`x${'\u0336'.repeat(19)}`, 20)).toBe('x\u0336\u0336');
    expect(cleanText('Cafe\u0301', 20)).toBe('Caf\u00e9');
    const long = '🌁'.repeat(200);
    expect(Array.from(cleanText(long, LIMITS.chat))).toHaveLength(140);
    const m = parse({ t: 'chat', text: `<b>${'x'.repeat(500)}` });
    expect(m?.t === 'chat' && m.text.length).toBe(140);
    expect(m?.t === 'chat' && m.text.startsWith('<b>')).toBe(true);
    expect(parse({ t: 'chat', text: '   ' })).toBeNull();
    expect(parse({ t: 'chat' })).toBeNull();
  });

  it('[R-NET-SYNC] presence messages are validated and every number is clamped', () => {
    const st = parse(encode({ t: 'st', p: { x: 1.234, y: 20, z: -3 }, v: { x: 1, y: 0, z: 2 }, yaw: 1.5, mic: 2 }));
    expect(st).toEqual({ t: 'st', p: { x: 1.23, y: 20, z: -3 }, v: { x: 1, y: 0, z: 2 }, yaw: 1.5, mic: 2 });
    const wild = parse({ t: 'st', p: [1e9, -1e9, 5], v: [999, -999, 0], y: 10, m: 7 });
    expect(wild).toEqual({ t: 'st', p: { x: LIMITS.coord, y: LIMITS.altMin, z: 5 }, v: { x: LIMITS.speed, y: -LIMITS.speed, z: 0 }, yaw: wrapAngle(10), mic: 0 });
    expect(parse({ t: 'st', p: [1, 2], v: [0, 0, 0], y: 0 })).toBeNull();
    expect(parse({ t: 'st', p: [1, 2, NaN], v: [0, 0, 0], y: 0 })).toBeNull();
    expect(parse({ t: 'st', p: [1, 2, 3], v: [0, 0, 0], y: 'x' })).toBeNull();
    expect(parse({ t: 'st', p: [1, 2, 3], v: 'fast', y: 0 })).toBeNull();
    expect(parse({ t: 'hi', name: '  Ana\u0007  ', color: '#AABBCC' })).toEqual({ t: 'hi', name: 'Ana', color: '#aabbcc' });
    expect(parse({ t: 'hi', name: 'x'.repeat(50), color: 'red; background:url(x)' })).toEqual({ t: 'hi', name: 'x'.repeat(20), color: '#f2f2ee' });
    expect(parse({ t: 'hi', name: '' })).toBeNull();
    expect(cleanColor('#123456')).toBe('#123456');
    expect(cleanColor(null)).toBe('#f2f2ee');
  });

  it('[R-NET-PING] ping messages carry a clamped position', () => {
    expect(parse(encode({ t: 'ping', p: { x: 10, y: 5, z: -20 } }))).toEqual({ t: 'ping', p: { x: 10, y: 5, z: -20 } });
    expect(parse({ t: 'ping', p: [0, 99999, 0] })).toEqual({ t: 'ping', p: { x: 0, y: LIMITS.altMax, z: 0 } });
    expect(parse({ t: 'ping', p: null })).toBeNull();
  });

  it('[R-NET-MODES] match messages reject bad rosters, roles, ids and counters', () => {
    const ok = { t: 'start', id: 'm1', mode: 'tag', roster: ['a', 'b'], duration: 9999, activity: 5, role: 'a' };
    expect(parse(ok)).toEqual({ t: 'start', id: 'm1', mode: 'tag', roster: ['a', 'b'], duration: 600, activity: '', role: 'a' });
    expect(parse({ ...ok, duration: 1 })).toMatchObject({ duration: 20 });
    expect(parse({ ...ok, mode: 'chess' })).toBeNull();
    expect(parse({ ...ok, roster: ['a'] })).toBeNull();
    expect(parse({ ...ok, roster: ['a', 'a'] })).toBeNull();
    expect(parse({ ...ok, roster: Array.from({ length: 13 }, (_, i) => `p${i}`), role: 'p0' })).toBeNull();
    expect(parse({ ...ok, role: 'z' })).toBeNull();
    expect(parse({ ...ok, id: '' })).toBeNull();
    expect(parse({ ...ok, duration: '60' })).toBeNull();
    expect(parse({ t: 'score', id: 'm1', s: -5, x: 1e12, d: 1 })).toEqual({ t: 'score', id: 'm1', s: 0, x: LIMITS.score, d: false });
    expect(parse({ t: 'score', id: 'm1', s: 'a', x: 0 })).toBeNull();
    expect(parse({ t: 'tag', id: 'm1', to: 'b', n: 1 })).toEqual({ t: 'tag', id: 'm1', to: 'b', n: 1 });
    expect(parse({ t: 'tag', id: 'm1', to: 'b', n: 1.5 })).toBeNull();
    expect(parse({ t: 'tag', id: 'm1', to: 'b', n: 0 })).toBeNull();
    expect(parse({ t: 'end', id: 'm1' })).toEqual({ t: 'end', id: 'm1' });
    expect(parse({ t: 'end' })).toBeNull();
  });

  it('[R-SYNC-DEVICES] save transfer messages only accept url-safe codes within the size limit', () => {
    expect(parse({ t: 'save', code: 'eyJ2IjoxfQ' })).toEqual({ t: 'save', code: 'eyJ2IjoxfQ' });
    expect(parse({ t: 'save', code: '<script>' })).toBeNull();
    expect(parse({ t: 'save', code: 'a'.repeat(LIMITS.save + 1) })).toBeNull();
    expect(parse({ t: 'ack', added: 3.4 })).toEqual({ t: 'ack', added: 3 });
    expect(parse({ t: 'ack' })).toBeNull();
    expect(parse({ t: 'in', id: 'm1', on: 'yes' })).toEqual({ t: 'in', id: 'm1', on: false });
    expect(parse({ t: 'in', id: 'm1', on: true })).toEqual({ t: 'in', id: 'm1', on: true });
    expect(parse({ t: 'in' })).toBeNull();
    expect(parse({ t: 'claim', key: 'AB2C' })).toEqual({ t: 'claim', key: 'AB2C' });
    expect(parse({ t: 'claim', key: 'ab<c' })).toBeNull();
    expect(parse({ t: 'claim', key: 'A'.repeat(9) })).toBeNull();
  });

  it('[R-NET-SAFE] unknown, malformed and non-object messages are dropped', () => {
    for (const bad of [null, undefined, 3, 'hi', [], { t: 'eval', code: 'alert(1)' }, { t: '__proto__' }]) expect(parse(bad)).toBeNull();
  });

  it('[R-NET-CHAT] the rate limiter caps bursts per peer and type, then refills over time', () => {
    const r = new RateLimiter();
    const sent = Array.from({ length: 10 }, () => r.allow('p', 'chat', 0)).filter(Boolean).length;
    expect(sent).toBe(4);
    expect(r.allow('q', 'chat', 0)).toBe(true);
    expect(r.allow('p', 'st', 0)).toBe(true);
    expect(r.allow('p', 'chat', 500)).toBe(false);
    expect(r.allow('p', 'chat', 1100)).toBe(true);
    expect(r.allow('p', 'nope', 0)).toBe(false);
    r.forget('p');
    expect(r.allow('p', 'chat', 1200)).toBe(true);
  });
});
