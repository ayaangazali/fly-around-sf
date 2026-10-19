import { describe, expect, it } from 'vitest';
import { framing, scoreShot, timeMatches, PHOTO, type PhotoParams, type Shot } from '../../src/activities/kinds/photo';
import { addPhoto, loadAlbum, removePhoto, ALBUM_MAX, type Photo } from '../../src/ui/panels/album';
import { memoryStorage } from './helpers';

const params: PhotoParams = { subject: { lat: 37.8, lon: -122.4, name: 'Coit Tower' }, distance: [100, 300], altitude: [40, 80], center: 6, time: 'golden', timeLimit: 120 };
const subject = { x: 0, y: 50, z: -200 };
const shot = (o: Partial<Shot> = {}): Shot => ({ x: 0, y: 50, z: 0, yaw: 0, pitch: 0, ...o });

describe('photo framing', () => {
  it('[R-PHOTO] a subject straight ahead sits dead center, one behind is out of frame', () => {
    const f = framing(shot(), subject);
    expect(f.dist).toBeCloseTo(200);
    expect(f.sx).toBeCloseTo(0);
    expect(f.sy).toBeCloseTo(0);
    expect(f.off).toBeCloseTo(0);
    expect(f.inFrame).toBe(true);
    expect(framing(shot({ yaw: Math.PI }), subject).inFrame).toBe(false);
  });

  it('[R-PHOTO] screen position follows yaw and tilt with the right signs and frame edges', () => {
    const right = framing(shot({ yaw: 0.2 }), subject);
    expect(right.sx).toBeGreaterThan(0);
    const up = framing(shot({ pitch: -0.2 }), subject);
    expect(up.sy).toBeGreaterThan(0);
    const half = (PHOTO.fov / 2) * (Math.PI / 180);
    expect(framing(shot({ pitch: -half * 0.98 }), subject).inFrame).toBe(true);
    expect(framing(shot({ pitch: -half * 1.05 }), subject).inFrame).toBe(false);
    const hHalf = Math.atan(Math.tan(half) * PHOTO.aspect);
    expect(framing(shot({ yaw: hHalf * 0.98 }), subject).inFrame).toBe(true);
    expect(framing(shot({ yaw: hHalf * 1.05 }), subject).inFrame).toBe(false);
  });

  it('[R-PHOTO] stars: three for a perfect shot, two with one miss, one with more, zero when blocked or off frame', () => {
    expect(scoreShot(params, shot(), subject, 5, false).stars).toBe(3);
    const noon = scoreShot(params, shot(), subject, 50, false);
    expect(noon.stars).toBe(2);
    expect(noon.hint).toContain('sun is low');
    const sloppy = scoreShot(params, shot({ y: 120, yaw: 0.25 }), { ...subject, y: 120 }, 50, false);
    expect(sloppy.stars).toBe(1);
    expect(scoreShot(params, shot(), subject, 5, true).hint).toBe('Something is in the way');
    expect(scoreShot(params, shot(), subject, 5, true).stars).toBe(0);
    const away = scoreShot(params, shot({ yaw: Math.PI }), subject, 5, false);
    expect(away.stars).toBe(0);
    expect(away.hint).toContain('out of frame');
    expect(scoreShot(params, shot({ z: 600 }), subject, 5, false).hint).toBe('Too far away to count');
  });

  it('[R-PHOTO] hints say which way to fix distance and altitude', () => {
    const p = { ...params, time: undefined };
    expect(scoreShot(p, shot({ z: -150 }), subject, 5, false).hint).toBe('Back off a little');
    expect(scoreShot(p, shot({ z: 250 }), subject, 5, false).hint).toBe('Move closer');
    expect(scoreShot({ ...p, distance: [100, 400] }, shot({ y: 20, pitch: Math.atan2(30, 200) }), subject, 5, false).hint).toBe('Fly higher');
    expect(scoreShot({ ...p, distance: [100, 400] }, shot({ y: 95, pitch: -Math.atan2(45, 200) }), subject, 5, false).hint).toBe('Fly lower');
    expect(scoreShot({ ...p, altitude: undefined }, shot(), subject, 5, false).checks.map((c) => c.label)).toEqual(['Distance', 'Centered']);
  });

  it('[R-PHOTO] time of day bands match the sun altitude', () => {
    expect(timeMatches('day', 40)).toBe(true);
    expect(timeMatches('day', 5)).toBe(false);
    expect(timeMatches('golden', 4)).toBe(true);
    expect(timeMatches('golden', 30)).toBe(false);
    expect(timeMatches('night', -12)).toBe(true);
    expect(timeMatches('night', -1)).toBe(false);
  });
});

describe('photo album', () => {
  const photo = (t: number): Photo => ({ t, title: `Shot ${t}`, stars: t % 4, img: `data:image/jpeg;base64,${'A'.repeat(40)}`, p: [1, 2, 3] });

  it('[R-ALBUM] keeps at most 30 photos, dropping the oldest first', () => {
    const s = memoryStorage();
    for (let i = 0; i < ALBUM_MAX; i++) expect(addPhoto(photo(i), s).dropped).toBe(0);
    const r = addPhoto(photo(99), s);
    expect(r).toEqual({ saved: true, dropped: 1, count: ALBUM_MAX });
    const list = loadAlbum(s);
    expect(list).toHaveLength(ALBUM_MAX);
    expect(list[0].t).toBe(1);
    expect(list.at(-1)?.t).toBe(99);
  });

  it('[R-ALBUM] deletes by timestamp and survives corrupt or blocked storage', () => {
    const s = memoryStorage();
    addPhoto(photo(1), s);
    addPhoto(photo(2), s);
    expect(removePhoto(1, s).map((p) => p.t)).toEqual([2]);
    s.setItem('fly-around-sf:album', '{not json');
    expect(loadAlbum(s)).toEqual([]);
    s.setItem('fly-around-sf:album', JSON.stringify([{ t: 1 }, null, photo(3)]));
    expect(loadAlbum(s).map((p) => p.t)).toEqual([3]);
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(addPhoto(photo(4), full).saved).toBe(false);
    expect(loadAlbum(null)).toEqual([]);
  });
});
