import './map.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { ActivityDef } from '../../activities/types';
import { drawMap, baseMap } from '../map-base';
import { clampView, formatDistance, MAX_SCALE, headingDeg, panBy, toScreen, toWorld, zoomAt, type MapView } from '../map-view';
import { kindColor, mappable } from '../map-style';
import { setWaypoint } from '../waypoint';
import { setSetting, settingsOf } from '../settings-model';

const hiddenKinds = new Set<string>();
let showDone = true;
let saved: Pick<MapView, 'cx' | 'cz' | 'scale'> | null = null;

export const panel: Panel = {
  id: 'map',
  title: 'Map',
  icon: '🗺️',
  action: 'map',
  order: 5,
  render(root, game) {
    root.classList.add('map-body');
    const defs = game.activities.list().filter((d) => mappable(game, d));
    const imperial = settingsOf(game).units === 'imperial';
    const base = baseMap(game);
    const p = game.flight.pos;

    const filters = el('div', 'map-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter activities by kind');
    const kinds = [...new Set(defs.map((d) => d.kind))].sort();
    const chip = (label: string, pressed: boolean, color: string, onToggle: (on: boolean) => void) => {
      const b = el('button', 'chip');
      b.style.setProperty('--c', color);
      b.setAttribute('aria-pressed', String(pressed));
      b.innerHTML = label;
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        onToggle(on);
        redraw();
      });
      return b;
    };
    for (const k of kinds) {
      const kind = game.activities.kinds.get(k);
      const all = defs.filter((d) => d.kind === k);
      const done = all.filter((d) => game.save.isDone(d.id)).length;
      const b = chip(`<i>${kind?.icon ?? '•'}</i>${kind?.label ?? k}<small>${done}/${all.length}</small>`, !hiddenKinds.has(k), kindColor(k), (on) => (on ? hiddenKinds.delete(k) : hiddenKinds.add(k)));
      b.dataset.kind = k;
      filters.append(b);
    }
    const doneChip = chip('<i>✓</i>Show done', showDone, '#7de0a6', (on) => (showDone = on));
    doneChip.classList.add('chip-done');
    const minimapChip = chip('<i>◉</i>Minimap', settingsOf(game).minimap, '#9fd0ff', (on) => setSetting(game, 'minimap', on));
    filters.append(doneChip, minimapChip);

    const wrap = el('div', 'map-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label', 'Map. Drag or use arrow keys to pan, scroll or plus and minus to zoom.');
    const canvas = el('canvas', 'map-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Map of San Francisco with terrain and every building');
    const layer = el('div', 'map-markers');
    const me = el('div', 'map-me');
    me.setAttribute('aria-hidden', 'true');
    const wpPin = el('div', 'map-wp');
    wpPin.setAttribute('aria-hidden', 'true');
    const pin = el('div', 'map-pin');
    pin.hidden = true;
    const scaleBar = el('div', 'map-scale');
    const tools = el('div', 'map-tools');
    const tool = (text: string, label: string, fn: () => void) => {
      const b = el('button', 'map-tool', text);
      b.setAttribute('aria-label', label);
      b.title = label;
      b.addEventListener('click', fn);
      tools.append(b);
      return b;
    };
    const card = el('div', 'map-card');
    card.hidden = true;
    card.setAttribute('aria-live', 'polite');
    wrap.append(canvas, layer, wpPin, pin, me, scaleBar, tools, card);
    const summary = el('p', 'map-summary');
    const doneCount = defs.filter((d) => game.save.isDone(d.id)).length;
    summary.textContent = `${doneCount} of ${defs.length} places done. Tap a marker for details and to set a waypoint.`;
    root.append(filters, wrap, summary);

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let view: MapView = { cx: saved?.cx ?? p.x, cz: saved?.cz ?? p.z, scale: saved?.scale ?? 0.3, w: 1, h: 1 };
    let frame = 0;
    const markers = new Map<string, HTMLButtonElement>();
    const spots = defs.map((d) => game.activities.position(d));
    const fan = new Map(defs.map((d, i) => [d.id, spots.slice(0, i).filter((q) => Math.hypot(q.x - spots[i].x, q.z - spots[i].z) < 30 / MAX_SCALE).length]));
    for (const d of defs) {
      const kind = game.activities.kindOf(d);
      const b = el('button', 'map-marker');
      b.dataset.activity = d.id;
      b.style.setProperty('--c', kindColor(d.kind));
      b.append(el('span', '', kind.icon));
      const done = game.save.isDone(d.id);
      const locked = game.activities.locked(d);
      b.classList.toggle('done', done);
      b.classList.toggle('locked', locked);
      b.setAttribute('aria-label', `${d.title}, ${kind.label}, ${done ? 'done' : locked ? 'locked' : 'not done yet'}`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        select(d);
      });
      layer.append(b);
      markers.set(d.id, b);
    }

    const draw = () => {
      frame = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!drawMap(ctx, game, view, dpr)) redraw();
      const pos = (x: number, z: number) => {
        const s = toScreen(view, x, z);
        return `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
      };
      for (const d of defs) {
        const b = markers.get(d.id) as HTMLButtonElement;
        const q = game.activities.position(d);
        const s = toScreen(view, q.x, q.z);
        const show = !hiddenKinds.has(d.kind) && (showDone || !game.save.isDone(d.id)) && s.sx > -20 && s.sy > -20 && s.sx < view.w + 20 && s.sy < view.h + 20;
        b.hidden = !show;
        const n = fan.get(d.id)!;
        const a = (n * Math.PI) / 3;
        if (show) b.style.translate = `${(s.sx + (n && 30 * Math.cos(a))).toFixed(1)}px ${(s.sy + (n && 30 * Math.sin(a))).toFixed(1)}px`;
      }
      me.style.transform = `${pos(game.flight.pos.x, game.flight.pos.z)} rotate(${headingDeg(game.flight.yaw)}deg)`;
      wpPin.hidden = !game.waypoint;
      if (game.waypoint) wpPin.style.transform = pos(game.waypoint.x, game.waypoint.z);
      if (pinAt) pin.style.transform = pos(pinAt.x, pinAt.z);
      const meters = niceLength(110 / view.scale);
      scaleBar.style.width = `${meters * view.scale}px`;
      scaleBar.textContent = formatDistance(meters, imperial);
    };
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const update = (next: MapView) => {
      view = next;
      saved = { cx: view.cx, cz: view.cz, scale: view.scale };
      redraw();
    };

    tool('+', 'Zoom in', () => update(zoomAt(view, 1.6, view.w / 2, view.h / 2, base.extent)));
    tool('−', 'Zoom out', () => update(zoomAt(view, 1 / 1.6, view.w / 2, view.h / 2, base.extent)));
    tool('◎', 'Center on my drone', () => update(clampView({ ...view, cx: game.flight.pos.x, cz: game.flight.pos.z }, base.extent)));
    tool('⤢', 'Show the whole city', () => update(clampView({ ...view, cx: (base.extent.minX + base.extent.maxX) / 2, cz: (base.extent.minZ + base.extent.maxZ) / 2, scale: Math.min(view.w / (base.extent.maxX - base.extent.minX), view.h / (base.extent.maxZ - base.extent.minZ)) }, base.extent)));

    let pinAt: { x: number; z: number } | null = null;
    const showCard = (title: string, meta: string, body: HTMLElement[], target: { x: number; y: number; z: number } | null, id?: string) => {
      card.hidden = false;
      card.replaceChildren();
      if (id) card.dataset.activity = id;
      else delete card.dataset.activity;
      const h = el('h3', '', title);
      const m = el('p', 'map-card-meta', meta);
      const actions = el('div', 'map-card-actions');
      if (target) {
        const go = el('button', 'btn primary', 'Set waypoint');
        go.addEventListener('click', () => {
          setWaypoint(game, target, title);
          game.panels.close();
        });
        actions.append(go);
      }
      const close = el('button', 'btn', 'Close');
      close.addEventListener('click', () => {
        card.hidden = true;
        pinAt = null;
        pin.hidden = true;
        wrap.focus();
      });
      actions.append(close);
      card.append(h, m, ...body, actions);
      (card.querySelector('.btn.primary') as HTMLElement | null)?.focus();
    };
    const select = (d: ActivityDef) => {
      pinAt = null;
      pin.hidden = true;
      const kind = game.activities.kindOf(d);
      const q = game.activities.position(d);
      const dist = formatDistance(Math.hypot(q.x - game.flight.pos.x, q.z - game.flight.pos.z), imperial);
      const done = game.save.isDone(d.id);
      const locked = game.activities.locked(d);
      const status = el('p', `map-card-status ${done ? 'done' : locked ? 'locked' : 'ready'}`);
      if (done) status.textContent = `Done${game.save.data.best[d.id] ? `. Best ${game.save.data.best[d.id].toFixed(1)}s` : ''}`;
      else if (locked) status.textContent = `Locked. First: ${(d.requires ?? []).filter((r) => !game.save.isDone(r)).map((r) => game.activities.defs.get(r)?.title ?? r).join(', ')}`;
      else status.textContent = kind.passive ? 'Fly close to discover it' : 'Fly there and press F to start';
      showCard(d.title, `${kind.icon} ${kind.label} · ${d.neighborhood} · ${dist}`, [el('p', 'map-card-blurb', d.blurb), status], q, d.id);
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    wrap.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button, .map-card')) return;
      wrap.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    wrap.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const now = local(e);
      pointers.set(e.pointerId, now);
      if (pointers.size === 1) {
        moved += Math.hypot(now.x - prev.x, now.y - prev.y);
        update(panBy(view, now.x - prev.x, now.y - prev.y, base.extent));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        moved += 10;
        if (pinch > 0) update(zoomAt(view, dist / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2, base.extent));
        pinch = dist;
      }
    });
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      pinch = 0;
      if (pointers.size === 0 && moved < 6 && e.type === 'pointerup') {
        const w = toWorld(view, local(e).x, local(e).y);
        pinAt = w;
        pin.hidden = false;
        const g = game.world.toGeo(w.x, w.z);
        const y = game.world.groundAt(w.x, w.z) + 30;
        redraw();
        showCard('Dropped pin', `${g.lat.toFixed(4)}, ${g.lon.toFixed(4)} · ${formatDistance(Math.hypot(w.x - game.flight.pos.x, w.z - game.flight.pos.z), imperial)} away`, [], { x: w.x, y, z: w.z });
      }
    };
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
    wrap.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const at = local(e);
        update(zoomAt(view, Math.exp(-e.deltaY * 0.0015), at.x, at.y, base.extent));
      },
      { passive: false },
    );
    wrap.addEventListener('keydown', (e) => {
      const stepPx = 80;
      const moves: Record<string, [number, number]> = { ArrowLeft: [stepPx, 0], ArrowRight: [-stepPx, 0], ArrowUp: [0, stepPx], ArrowDown: [0, -stepPx] };
      if (moves[e.key]) update(panBy(view, ...moves[e.key], base.extent));
      else if (e.key === '+' || e.key === '=') update(zoomAt(view, 1.4, view.w / 2, view.h / 2, base.extent));
      else if (e.key === '-') update(zoomAt(view, 1 / 1.4, view.w / 2, view.h / 2, base.extent));
      else return;
      e.preventDefault();
    });

    const fit = () => {
      const w = wrap.clientWidth || 600;
      const h = wrap.clientHeight || 400;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      update(clampView({ ...view, w, h }, base.extent));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  },
};

function niceLength(m: number): number {
  const p = 10 ** Math.floor(Math.log10(m));
  return [5, 2, 1].map((k) => k * p).find((v) => v <= m) ?? p;
}
