import type { Game, GameSystem } from '../game';
import { el } from '../ui/panel-host';
import { forwardVector } from '../player/flight';
import { PHOTO, viewfinder, evaluate, framing, subjectPoint, type PhotoParams, type Check } from '../activities/kinds/photo';
import { addPhoto, ALBUM_MAX } from '../ui/panels/album';
import '../ui/minigames.css';

const RAD = Math.PI / 180;
const THUMB_W = 330;
const THUMB_H = 220;

let ui: {
  root: HTMLElement;
  frame: HTMLElement;
  subject: HTMLElement;
  info: HTMLElement;
  checks: HTMLElement;
  feedback: HTMLElement;
  flash: HTMLElement;
  button: HTMLButtonElement;
  keep: HTMLButtonElement;
};
let live = 0;
let lastInfo = '';
let lastChecks = '';
let feedbackTimer = 0;
let best = 0;

const touch = () => navigator.maxTouchPoints > 0;
const startHint = () => (touch() ? 'Tap 📷 to open the viewfinder' : 'Press P to open the viewfinder');

function challenge(game: Game): PhotoParams | null {
  const a = game.activities.active;
  return a && a.def.kind === 'photo' ? (a.def.params as unknown as PhotoParams) : null;
}

function setOpen(game: Game, open: boolean): void {
  if (viewfinder.open === open) return;
  viewfinder.open = open;
  ui.root.hidden = !open;
  game.ui.classList.toggle('vf-open', open);
  ui.button.setAttribute('aria-pressed', String(open));
  lastInfo = lastChecks = '';
  if (open) {
    aim(game);
    const stale = startHint();
    for (const t of game.ui.querySelectorAll('.toast')) if (t.textContent === stale) t.remove();
    game.toast(touch() ? 'Tap the shutter to shoot, ▲ ▼ to tilt' : 'Viewfinder: P shutter · Z/X or wheel tilt · Esc close', 'info');
  }
}

function aim(game: Game): void {
  const cam = game.camera;
  const f = game.flight;
  const fw = forwardVector(f.yaw);
  cam.position.set(f.pos.x + fw.x * 0.9, f.pos.y + 0.15, f.pos.z + fw.z * 0.9);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(viewfinder.tilt, f.yaw, 0);
  const fov = cam.aspect >= PHOTO.aspect ? PHOTO.fov : (2 * Math.atan((Math.tan((PHOTO.fov / 2) * RAD) * PHOTO.aspect) / cam.aspect)) / RAD;
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();
  game.drone.root.visible = false;
}

function thumbnail(game: Game): string {
  aim(game);
  const markers = game.scene.getObjectByName('markers');
  if (markers) markers.visible = false;
  game.renderer.render(game.scene, game.camera);
  const src = game.renderer.domElement;
  const w = Math.min(src.width, src.height * PHOTO.aspect);
  const h = w / PHOTO.aspect;
  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  c.getContext('2d')?.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, THUMB_W, THUMB_H);
  if (markers) markers.visible = true;
  return c.toDataURL('image/jpeg', 0.7);
}

function placeName(game: Game): string {
  const a = game.activities.active;
  if (a?.def.kind === 'photo') return a.def.title;
  const p = game.flight.pos;
  let best = 900;
  let name = '';
  for (const d of game.activities.list()) {
    const q = game.activities.position(d);
    const dist = Math.hypot(q.x - p.x, q.z - p.z);
    if (dist < best && !d.hidden) {
      best = dist;
      name = d.neighborhood;
    }
  }
  if (name) return `Over ${name}`;
  const g = game.world.toGeo(p.x, p.z);
  return `${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}`;
}

function shoot(game: Game): void {
  const f = game.flight;
  const img = thumbnail(game);
  let scored: { stars: number; best: number; hint: string } | null = null;
  const off = game.bus.on('photo:scored', (s) => void (scored = s));
  game.bus.emit('photo', { x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw, pitch: viewfinder.tilt });
  off();
  const s = scored as { stars: number; best: number; hint: string } | null;
  if (s) best = s.best;
  const res = addPhoto({ t: Date.now(), title: placeName(game), stars: s?.stars ?? 0, img, p: [Math.round(f.pos.x), Math.round(f.pos.y), Math.round(f.pos.z)] });
  ui.flash.classList.remove('go');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('go');
  const saved = res.saved ? `Saved to album ${res.count}/${ALBUM_MAX}${res.dropped ? ', oldest photo replaced' : ''}` : 'Album storage is full or blocked';
  ui.feedback.replaceChildren();
  if (s) ui.feedback.append(el('b', `vf-stars s${s.stars}`, s.stars ? `${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}` : '☆☆☆'));
  ui.feedback.append(el('span', '', s ? s.hint : saved), el('small', '', s ? saved : ''));
  if (s && best > 0 && best < 3) ui.feedback.append(el('small', '', `Best so far ${'★'.repeat(best)}${'☆'.repeat(3 - best)}. ${touch() ? 'Tap ✓ to keep it' : 'Press F to keep it'}, or shoot again`));
  ui.feedback.hidden = false;
  feedbackTimer = 3;
}

function renderChecks(checks: Check[]): void {
  const key = checks.map((c) => `${c.ok}${c.text}`).join('|');
  if (key === lastChecks) return;
  lastChecks = key;
  ui.checks.replaceChildren(
    ...checks.map((c) => {
      const li = el('li', c.ok ? 'ok' : '');
      li.append(el('i', '', c.ok ? '✓' : '·'), el('b', '', c.label), el('span', '', c.text));
      return li;
    }),
  );
}

function refresh(game: Game, dt: number): void {
  const p = challenge(game);
  const f = game.flight;
  const shot = { x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw, pitch: viewfinder.tilt };
  const info = `TILT ${(viewfinder.tilt / RAD).toFixed(0)}°  ALT ${f.pos.y.toFixed(0)} m${p ? `  ·  ${p.subject.name}` : ''}`;
  if (info !== lastInfo) ui.info.textContent = lastInfo = info;
  ui.checks.hidden = !p;
  if (p) {
    const fr = framing(shot, subjectPoint(game, p));
    const visible = fr.inFrame;
    ui.subject.hidden = !visible;
    if (visible) {
      ui.subject.style.left = `${(50 + fr.sx * 50).toFixed(2)}%`;
      ui.subject.style.top = `${(50 - fr.sy * 50).toFixed(2)}%`;
    }
    live -= dt;
    if (live <= 0) {
      live = 0.25;
      renderChecks(evaluate(game, p, shot, true).checks);
    }
  } else ui.subject.hidden = true;
}

function build(game: Game): void {
  const root = el('div', 'vf');
  root.hidden = true;
  const frame = el('div', 'vf-frame');
  const subject = el('div', 'vf-subject');
  subject.hidden = true;
  subject.append(el('i'));
  const flash = el('div', 'vf-flash');
  frame.append(el('div', 'vf-thirds'), el('div', 'vf-center'), subject, flash, ...['tl', 'tr', 'bl', 'br'].map((c) => el('b', `vf-corner ${c}`)));
  const info = el('div', 'vf-info');
  const checks = el('ul', 'vf-checks');
  checks.setAttribute('aria-live', 'polite');
  const feedback = el('div', 'vf-feedback');
  feedback.hidden = true;
  feedback.setAttribute('aria-live', 'assertive');
  const bar = el('div', 'vf-bar');
  const btn = (cls: string, text: string, label: string, fn: () => void) => {
    const b = el('button', cls, text);
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  };
  const tilt = (d: number) => () => void (viewfinder.tilt = Math.max(PHOTO.tiltMin, Math.min(PHOTO.tiltMax, viewfinder.tilt + d)));
  bar.append(
    btn('vf-btn', '✕', 'Close viewfinder', () => setOpen(game, false)),
    btn('vf-btn', '▲', 'Tilt up', tilt(0.08)),
    btn('vf-shutter', '', 'Take photo', () => shoot(game)),
    btn('vf-btn', '▼', 'Tilt down', tilt(-0.08)),
    btn('vf-btn', '🖼️', 'Open album', () => {
      setOpen(game, false);
      game.panels.open('album');
    }),
  );
  const keep = btn('vf-btn vf-keep', '✓', 'Keep best shot (F)', () => game.interact());
  keep.hidden = true;
  bar.append(keep);
  frame.append(el('div', 'vf-rec', 'VIEWFINDER'), info, checks);
  root.append(frame, feedback, bar);
  const button = el('button', 'photo-btn', '📷');
  button.setAttribute('aria-label', 'Camera (P)');
  button.setAttribute('aria-pressed', 'false');
  button.title = 'Camera (P)';
  button.addEventListener('click', () => (viewfinder.open ? shoot(game) : setOpen(game, true)));
  game.ui.append(root, button);
  ui = { root, frame, subject, info, checks, feedback, flash, button, keep };
}

export const system: GameSystem = {
  id: 'photo',
  order: 40,
  init(game) {
    viewfinder.open = false;
    build(game);
    const chaseUpdate = game.chase.update.bind(game.chase);
    game.chase.update = (...args) => {
      chaseUpdate(...args);
      if (viewfinder.open) aim(game);
    };
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'Escape' && viewfinder.open) {
          e.stopPropagation();
          e.preventDefault();
          setOpen(game, false);
        }
      },
      true,
    );
    game.canvas.addEventListener(
      'wheel',
      (e) => {
        if (!viewfinder.open) return;
        e.preventDefault();
        viewfinder.tilt = Math.max(PHOTO.tiltMin, Math.min(PHOTO.tiltMax, viewfinder.tilt - e.deltaY * 0.0012));
      },
      { passive: false },
    );
    game.bus.on('panel:open', () => setOpen(game, false));
    game.bus.on('activity:start', ({ id }) => {
      best = 0;
      if (game.activities.defs.get(id)?.kind === 'photo' && !viewfinder.open) game.toast(startHint(), 'info');
    });
    game.bus.on('activity:complete', ({ id }) => {
      if (game.activities.defs.get(id)?.kind === 'photo') setTimeout(() => setOpen(game, false), 900);
    });
  },
  update(dt, game) {
    if (game.input.consume('photo') && !game.panels.openId) {
      if (viewfinder.open) shoot(game);
      else setOpen(game, true);
    }
    if (feedbackTimer > 0 && (feedbackTimer -= dt) <= 0) ui.feedback.hidden = true;
    if (!viewfinder.open) return;
    const held = game.input.held;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((g) => g?.connected);
    const stick = -(pad?.axes[3] ?? 0);
    const dir = (held.has('KeyZ') ? 1 : 0) - (held.has('KeyX') ? 1 : 0) + (Math.abs(stick) > 0.15 ? stick : 0);
    if (dir) viewfinder.tilt = Math.max(PHOTO.tiltMin, Math.min(PHOTO.tiltMax, viewfinder.tilt + dir * 0.8 * dt));
    const keep = !!challenge(game) && best > 0 && best < 3;
    if (ui.keep.hidden === keep) ui.keep.hidden = !keep;
    refresh(game, dt);
  },
};
