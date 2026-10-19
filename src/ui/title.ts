import './title.css';
import type { Game } from '../game';
import { el } from './panel-host';
import { rng } from './card-art';
import { DRONE_COLORS, cleanName, randomPilotName, setSetting, settingsOf } from './settings-model';
import { pilotLevel } from './stats-model';
import { installButton, watchInstall } from './pwa';
import { emptySave } from '../core/save';

export interface Title {
  progress(frac: number, label: string): void;
  ready(game: Game, onStart: () => void): void;
  fail(message: string): void;
  remove(): void;
}

export function skylineSvg(): string {
  const r = rng(1906);
  let city = '';
  let windows = '';
  let x = 560;
  while (x < 1620) {
    const w = 26 + r() * 46;
    const near = Math.abs(x - 1080) < 240;
    const h = (near ? 120 : 50) + r() * (near ? 170 : 110);
    city += `<rect x="${x.toFixed(0)}" y="${(470 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${(h + 10).toFixed(0)}"/>`;
    for (let wy = 470 - h + 10; wy < 460; wy += 14)
      for (let wx = x + 6; wx < x + w - 6; wx += 10)
        if (r() < 0.16) windows += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="4" height="6" style="animation-delay:${(r() * 6).toFixed(2)}s"/>`;
    x += w + 2 + r() * 8;
  }
  const deck = 404;
  const cable = (x1: number, x2: number) => `M${x1} 228 Q${(x1 + x2) / 2} ${deck - 6} ${x2} 228`;
  return `<svg class="title-svg" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs><linearGradient id="tw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb37a" stop-opacity="0.4"/><stop offset="1" stop-color="#0a1420" stop-opacity="0"/></linearGradient></defs>
<path class="t-hills" d="M0 430 C120 380 220 360 330 390 C420 300 520 300 600 380 C700 330 760 300 860 340 C940 250 1000 250 1060 330 C1160 300 1300 330 1400 370 C1480 350 1560 360 1600 380 V600 H0Z"/>
<g class="t-sutro"><path d="M1010 262 L1022 180 L1034 262 M1016 222 L1028 222 M1013 242 L1031 242 M1022 180 V150 M1008 192 H1036 M1012 172 H1032"/></g>
<g class="t-city">${city}<path d="M1180 470 L1196 470 L1188 228Z"/><path d="M1268 470 L1268 214 Q1268 186 1284 182 Q1300 186 1300 214 L1300 470Z"/><rect x="900" y="330" width="16" height="70"/><rect x="884" y="392" width="48" height="80"/></g>
<g class="t-windows">${windows}</g>
<g class="t-bridge"><path d="M-20 ${deck} H560" stroke-width="7"/><path d="M90 470 V214 M150 470 V214 M90 250 H150 M90 300 H150 M90 350 H150 M370 470 V214 M430 470 V214 M370 250 H430 M370 300 H430 M370 350 H430" stroke-width="9"/><path d="${cable(120, 400)} M-20 330 Q60 300 120 228 M400 228 Q480 300 560 ${deck}" stroke-width="3" fill="none"/></g>
<rect class="t-water" x="0" y="468" width="1600" height="140"/>
<g class="t-shimmer">${Array.from({ length: 26 }, (_, i) => `<rect x="${(r() * 1600).toFixed(0)}" y="${(482 + r() * 100).toFixed(0)}" width="${(30 + r() * 90).toFixed(0)}" height="2" style="animation-delay:${(i * 0.37).toFixed(2)}s"/>`).join('')}</g>
<rect x="0" y="468" width="1600" height="60" fill="url(#tw)"/>
</svg>`;
}

const DRONE = `<svg viewBox="0 0 60 24" aria-hidden="true"><rect x="20" y="9" width="20" height="7" rx="3.5" fill="currentColor"/><path d="M8 7 H26 M34 7 H52" stroke="#2b2f36" stroke-width="2"/><rect x="2" y="4" width="14" height="2" rx="1" fill="#e9eef3" opacity="0.7"/><rect x="44" y="4" width="14" height="2" rx="1" fill="#e9eef3" opacity="0.7"/><circle class="blink" cx="22" cy="18" r="1.6" fill="#ff4d4d"/><circle class="blink" cx="38" cy="18" r="1.6" fill="#7dffb0"/></svg>`;

export function mountTitle(root: HTMLElement, room: string | null): Title {
  watchInstall();
  root.className = 'loading title';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Fly Around SF');
  root.innerHTML = '';
  const sky = el('div', 'title-sky');
  sky.innerHTML = `<div class="title-sun"></div>${skylineSvg()}<div class="fog f1"></div><div class="fog f2"></div><div class="fog f3"></div>`;
  const drone = el('div', 'title-drone');
  drone.innerHTML = DRONE;
  sky.append(drone);
  const card = el('main', 'title-card');
  const h1 = el('h1');
  h1.innerHTML = 'Fly Around <em>SF</em>';
  const tag = el('p', 'title-tag', 'All 172,000 buildings of San Francisco. One tiny drone.');
  const prog = el('div', 'title-progress');
  const bar = el('div', 'loading-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Loading the city');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  const fill = el('i', '');
  fill.id = 'loading-bar';
  bar.append(fill);
  const label = el('div', 'loading-label', 'Starting up');
  label.id = 'loading-label';
  label.setAttribute('aria-live', 'polite');
  prog.append(bar, label);
  const menu = el('div', 'title-menu');
  menu.hidden = true;
  const error = el('div', 'loading-error');
  error.id = 'loading-error';
  card.append(h1, tag, prog, menu, error);
  const credit = el('p', 'title-credit', 'Buildings: DataSF footprints with 2010 LiDAR heights. Terrain: AWS Terrain Tiles.');
  root.append(sky, card, credit);

  let done = false;
  return {
    progress(frac, text) {
      const p = Math.round(frac * 100);
      fill.style.width = `${p}%`;
      bar.setAttribute('aria-valuenow', String(p));
      label.textContent = `${text}  ${p}%`;
    },
    fail(message) {
      error.textContent = message;
      label.textContent = 'Something went wrong';
    },
    ready(game, onStart) {
      prog.classList.add('done');
      const s = settingsOf(game);
      const data = game.save.data;
      const returning = Object.keys(data.completed).length > 0 || data.stats.flightTime > 60;
      drone.style.color = s.droneColor;
      let name = cleanName(data.settings.playerName) || randomPilotName();
      let color = s.droneColor;

      const start = () => {
        if (done) return;
        done = true;
        setSetting(game, 'playerName', name);
        setSetting(game, 'droneColor', color);
        root.classList.add('out');
        setTimeout(() => root.remove(), 700);
        onStart();
      };

      const setup = el('div', 'title-setup');
      const nameIn = el('input', 'title-name');
      nameIn.value = name;
      nameIn.maxLength = 20;
      nameIn.setAttribute('aria-label', 'Pilot name');
      nameIn.setAttribute('autocomplete', 'nickname');
      nameIn.spellcheck = false;
      nameIn.addEventListener('input', () => (name = cleanName(nameIn.value) || name));
      nameIn.addEventListener('keydown', (e) => e.key === 'Enter' && start());
      const swatches = el('div', 'swatches');
      swatches.setAttribute('role', 'radiogroup');
      swatches.setAttribute('aria-label', 'Drone color');
      for (const c of DRONE_COLORS) {
        const b = el('button', 'swatch');
        b.style.setProperty('--c', c);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', `Drone color ${c}`);
        b.setAttribute('aria-checked', String(c === color));
        b.addEventListener('click', () => {
          color = c;
          drone.style.color = c;
          for (const o of swatches.children) o.setAttribute('aria-checked', String(o === b));
        });
        swatches.append(b);
      }
      const nameRow = el('label', 'title-field');
      nameRow.append(el('span', '', 'Pilot name'), nameIn);
      const colorRow = el('div', 'title-field');
      colorRow.append(el('span', '', 'Drone color'), swatches);
      setup.append(nameRow, colorRow);

      const buttons = el('div', 'title-buttons');
      const btn = (cls: string, text: string, sub: string, fn: () => void) => {
        const b = el('button', `title-btn ${cls}`);
        b.append(el('b', '', text));
        if (sub) b.append(el('small', '', sub));
        b.addEventListener('click', fn);
        buttons.append(b);
        return b;
      };
      const lvl = pilotLevel(data.xp);
      if (room) btn('primary', 'Join friends', `Room ${room.slice(0, 24)}`, start).dataset.action = 'join';
      if (returning) {
        btn(room ? '' : 'primary', 'Continue', `${s.playerName} · Level ${lvl.level} · ${Object.keys(data.completed).length} done`, start).dataset.action = 'continue';
        const fresh = btn('', 'New pilot', 'Start over on this device', () => {
          if (fresh.dataset.confirm !== '1') {
            fresh.dataset.confirm = '1';
            (fresh.querySelector('small') as HTMLElement).textContent = 'Erases progress here. Tap again';
            return;
          }
          game.save.replace({ ...emptySave(), settings: { ...game.save.data.settings } });
          game.save.data.stats.sessions = 1;
          name = randomPilotName();
          nameIn.value = name;
          setup.hidden = false;
          menu.replaceChildren(setup, buttons);
          buttons.replaceChildren();
          btn('primary', 'Start flying', 'A fresh pilot, a fresh city', start).dataset.action = 'start';
          nameIn.focus();
          nameIn.select();
        });
        fresh.dataset.action = 'new';
        setup.hidden = true;
        const edit = el('button', 'title-edit', 'Change name or color');
        edit.addEventListener('click', () => {
          setup.hidden = false;
          edit.remove();
          nameIn.focus();
        });
        menu.append(buttons, edit, setup);
      } else {
        if (!room) btn('primary', 'Start flying', 'Takes about a minute to learn', start).dataset.action = 'start';
        menu.append(setup, buttons);
      }
      const install = installButton('title-install');
      menu.append(install);
      menu.hidden = false;
      (buttons.querySelector('.primary') as HTMLElement | null)?.focus();
    },
    remove() {
      done = true;
      root.remove();
    },
  };
}
