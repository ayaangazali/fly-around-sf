import type { Game } from '../game';
import { el } from './panel-host';

export class Hud {
  readonly root: HTMLElement;
  private stats: HTMLElement;
  private speed: HTMLElement;
  private alt: HTMLElement;
  private battery: HTMLElement;
  private compass: HTMLElement;
  private status: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  private last = '';

  constructor(private game: Game) {
    this.root = el('div', 'hud');
    this.stats = el('div', 'hud-stats');
    this.speed = el('div', 'hud-stat');
    this.alt = el('div', 'hud-stat');
    this.battery = el('div', 'hud-battery');
    this.battery.append(el('i'));
    this.stats.append(this.speed, this.alt, this.battery);
    this.compass = el('div', 'hud-compass');
    const strip = el('div', 'hud-compass-strip');
    for (let d = -360; d <= 720; d += 15) {
      const t = el('span', d % 90 === 0 ? 'major' : d % 45 === 0 ? 'mid' : 'minor');
      const n = ((d % 360) + 360) % 360;
      t.textContent = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' } as Record<number, string>)[n] ?? '·';
      strip.append(t);
    }
    this.compass.append(strip, el('b'));
    this.status = el('div', 'hud-status');
    this.status.setAttribute('aria-live', 'polite');
    this.prompt = el('button', 'hud-prompt');
    this.prompt.hidden = true;
    this.prompt.addEventListener('click', () => game.interact());
    this.toasts = el('div', 'toasts');
    this.toasts.setAttribute('aria-live', 'polite');
    this.root.append(this.compass, this.status, this.stats, this.prompt, this.toasts);
    game.ui.append(this.root);
    game.bus.on('toast', ({ text, kind }) => this.toast(text, kind ?? 'info'));
  }

  toast(text: string, kind: string): void {
    const t = el('div', `toast toast-${kind}`, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  update(): void {
    const g = this.game;
    const f = g.flight;
    const metric = g.save.data.settings.units !== 'imperial';
    const kmh = Math.hypot(f.vel.x, f.vel.z) * 3.6;
    const agl = g.world ? f.pos.y - g.world.groundAt(f.pos.x, f.pos.z) : 0;
    const speed = metric ? `${kmh.toFixed(0)}<small>km/h</small>` : `${(kmh / 1.609).toFixed(0)}<small>mph</small>`;
    const alt = metric ? `${f.pos.y.toFixed(0)}<small>m</small>` : `${(f.pos.y * 3.281).toFixed(0)}<small>ft</small>`;
    const heading = ((((-f.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const a = g.activities.active;
    const near = g.activities.nearby;
    const key = `${speed}|${alt}|${agl.toFixed(0)}|${f.battery.toFixed(2)}|${heading.toFixed(0)}|${a ? a.inst.hud() : ''}|${near?.id ?? ''}`;
    if (key === this.last) return;
    this.last = key;
    this.speed.innerHTML = `<span>SPD</span>${speed}`;
    this.alt.innerHTML = `<span>ALT</span>${alt}`;
    const bar = this.battery.firstElementChild as HTMLElement;
    bar.style.width = `${(f.battery * 100).toFixed(0)}%`;
    this.battery.classList.toggle('low', f.battery < 0.2);
    this.battery.title = `Battery ${(f.battery * 100).toFixed(0)}%`;
    (this.compass.firstElementChild as HTMLElement).style.transform = `translateX(${-(heading + 360) * (28 / 15)}px)`;
    this.status.textContent = a ? a.inst.hud() : '';
    this.status.hidden = !a;
    this.prompt.hidden = !near || !!a;
    if (near && !a) this.prompt.innerHTML = `<kbd>F</kbd> ${escapeHtml(near.title)}<small>${escapeHtml(near.blurb)}</small>`;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
