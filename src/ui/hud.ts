import type { Game } from '../game';
import { el } from './panel-host';

export class Hud {
  readonly root: HTMLElement;
  private stats: HTMLElement;
  private speed: HTMLElement;
  private alt: HTMLElement;
  private compass: HTMLElement;
  private status: HTMLElement;
  private prompt: HTMLElement;
  private next: HTMLElement;
  private toasts: HTMLElement;
  private last = '';
  readonly widgets: { update(): void }[] = [];
  readonly muted = new Set<string>();

  constructor(private game: Game) {
    this.root = el('div', 'hud');
    this.stats = el('div', 'hud-stats');
    this.speed = el('div', 'hud-stat');
    this.alt = el('div', 'hud-stat');
    this.stats.append(this.speed, this.alt);
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
    this.next = el('button', 'hud-prompt-next', '▸');
    this.next.hidden = true;
    this.next.setAttribute('aria-label', 'Next activity here');
    this.next.addEventListener('click', () => game.activities.cycleNearby());
    const row = el('div', 'hud-prompt-row');
    row.append(this.prompt, this.next);
    this.toasts = el('div', 'toasts');
    this.toasts.setAttribute('aria-live', 'polite');
    this.root.append(this.compass, this.status, this.stats, row, this.toasts);
    game.ui.append(this.root);
    game.bus.on('toast', ({ text, kind }) => this.toast(text, kind ?? 'info'));
  }

  toast(text: string, kind: string): void {
    if (this.muted.delete(text)) return;
    const t = el('div', `toast toast-${kind}`, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    const life = kind === 'warn' ? 6000 : 2600;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 600);
  }

  update(): void {
    for (const w of this.widgets) w.update();
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
    const key = `${speed}|${alt}|${agl.toFixed(0)}|${heading.toFixed(0)}|${a ? a.inst.hud() : ''}|${near?.id ?? ''}|${g.activities.nearbyList.length}`;
    if (key === this.last) return;
    this.last = key;
    this.speed.innerHTML = `<span>SPD</span>${speed}`;
    this.alt.innerHTML = `<span>ALT</span>${alt}`;
    (this.compass.firstElementChild as HTMLElement).style.transform = `translateX(${-(heading + 360) * (28 / 15)}px)`;
    this.status.textContent = a ? a.inst.hud() : '';
    this.status.hidden = !a;
    this.prompt.hidden = !near || !!a;
    const many = g.activities.nearbyList.length;
    this.next.hidden = this.prompt.hidden || many < 2;
    if (near && !a) {
      const more = many > 1 ? `<span class="hud-prompt-more">${g.activities.nearbyList.indexOf(near) + 1} of ${many} here<span class="hud-prompt-key"> · <kbd>C</kbd> next</span></span>` : '';
      this.prompt.innerHTML = `<kbd>F</kbd> ${escapeHtml(near.title)}<small>${escapeHtml(near.blurb)}</small>${more}`;
    }
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
