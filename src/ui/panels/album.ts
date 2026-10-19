import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import '../minigames.css';

export interface Photo {
  t: number;
  title: string;
  stars: number;
  img: string;
  p: [number, number, number];
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'fly-around-sf:album';
export const ALBUM_MAX = 30;

function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAlbum(s: Store | null = storage()): Photo[] {
  try {
    const raw = JSON.parse(s?.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.img === 'string' && typeof p.t === 'number') : [];
  } catch {
    return [];
  }
}

function write(list: Photo[], s: Store | null): boolean {
  try {
    s?.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addPhoto(photo: Photo, s: Store | null = storage()): { saved: boolean; dropped: number; count: number } {
  const list = [...loadAlbum(s), photo];
  const dropped = Math.max(0, list.length - ALBUM_MAX);
  list.splice(0, dropped);
  const saved = write(list, s);
  return { saved, dropped, count: list.length };
}

export function removePhoto(t: number, s: Store | null = storage()): Photo[] {
  const list = loadAlbum(s).filter((p) => p.t !== t);
  write(list, s);
  return list;
}

const stars = (n: number) => (n > 0 ? `${'★'.repeat(n)}${'☆'.repeat(3 - n)}` : '');
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const panel: Panel = {
  id: 'album',
  title: 'Photo album',
  icon: '🖼️',
  order: 30,
  render(root, game) {
    const show = () => {
      const photos = loadAlbum().reverse();
      root.replaceChildren();
      const head = el('p', 'album-summary', `${photos.length} of ${ALBUM_MAX} photos. Press P to open the viewfinder, P again to take the shot.`);
      root.append(head);
      if (!photos.length) {
        const empty = el('div', 'album-empty');
        empty.append(el('strong', '', 'No photos yet'), el('p', '', 'Photo challenges (📷 beacons) score your framing from one to three stars. Free shots land here too.'));
        root.append(empty);
        return;
      }
      const grid = el('ul', 'album-grid');
      for (const p of photos) {
        const li = el('li', 'album-item');
        const b = el('button', 'album-thumb');
        b.setAttribute('aria-label', `Open photo: ${p.title}`);
        const img = el('img');
        img.src = p.img;
        img.alt = p.title;
        b.append(img);
        b.addEventListener('click', () => open(p));
        li.append(b, el('strong', '', p.title), el('span', 'album-meta', `${when(p.t)}${p.stars ? `  ${stars(p.stars)}` : ''}`));
        grid.append(li);
      }
      root.append(grid);
    };
    const open = (p: Photo) => {
      root.replaceChildren();
      const view = el('figure', 'album-view');
      const img = el('img');
      img.src = p.img;
      img.alt = p.title;
      const cap = el('figcaption');
      cap.append(el('strong', '', p.title), el('span', 'album-meta', `${when(p.t)}${p.stars ? `  ${stars(p.stars)}` : ''}`));
      view.append(img, cap);
      const bar = el('div', 'album-actions');
      const back = el('button', 'album-btn', '← All photos');
      back.addEventListener('click', show);
      const go = el('button', 'album-btn', 'Fly back here');
      go.addEventListener('click', () => {
        game.waypoint = { x: p.p[0], y: p.p[1], z: p.p[2], label: p.title };
        game.toast(`Waypoint set: ${p.title}`, 'info');
        game.panels.close();
      });
      const save = el('a', 'album-btn', 'Download');
      save.href = p.img;
      save.download = `fly-around-sf-${p.t}.jpg`;
      const del = el('button', 'album-btn album-del', 'Delete');
      del.addEventListener('click', () => {
        removePhoto(p.t);
        show();
      });
      bar.append(back, go, save, del);
      root.append(view, bar);
      back.focus();
    };
    show();
  },
};
