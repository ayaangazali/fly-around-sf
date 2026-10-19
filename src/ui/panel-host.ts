import type { Game } from '../game';
import type { Action } from '../core/input';

export interface Panel {
  id: string;
  title: string;
  icon: string;
  action?: Action;
  order?: number;
  hidden?: boolean;
  render(root: HTMLElement, game: Game): void | (() => void);
}

export class PanelHost {
  private panels = new Map<string, Panel>();
  readonly bar: HTMLElement;
  readonly sheet: HTMLElement;
  openId: string | null = null;
  private cleanup: (() => void) | void = undefined;

  constructor(private game: Game) {
    this.bar = el('nav', 'menubar');
    this.bar.setAttribute('aria-label', 'Game menu');
    this.sheet = el('section', 'sheet');
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.sheet.hidden = true;
    this.sheet.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    game.ui.append(this.bar, this.sheet);
  }

  register(panels: Panel[]): void {
    for (const p of panels) this.panels.set(p.id, p);
    this.bar.replaceChildren();
    for (const p of this.list()) {
      if (p.hidden) continue;
      const b = el('button', 'menubar-btn');
      b.dataset.panel = p.id;
      b.title = p.title;
      b.setAttribute('aria-label', p.title);
      b.textContent = p.icon;
      b.addEventListener('click', () => this.toggle(p.id));
      this.bar.append(b);
    }
  }

  list(): Panel[] {
    return [...this.panels.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  get(id: string): Panel | undefined {
    return this.panels.get(id);
  }

  open(id: string): boolean {
    const p = this.panels.get(id);
    if (!p) return false;
    this.close();
    this.openId = id;
    this.sheet.hidden = false;
    this.sheet.dataset.panel = id;
    const head = el('header', 'sheet-head');
    const h = el('h2');
    h.textContent = `${p.icon}  ${p.title}`;
    const x = el('button', 'sheet-close');
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => this.close());
    head.append(h, x);
    const body = el('div', 'sheet-body');
    this.sheet.replaceChildren(head, body);
    this.cleanup = p.render(body, this.game);
    this.game.input.held.clear();
    this.game.bus.emit('panel:open', { id });
    x.focus();
    return true;
  }

  close(): void {
    if (!this.openId) return;
    const id = this.openId;
    this.cleanup?.();
    this.cleanup = undefined;
    this.openId = null;
    this.sheet.hidden = true;
    this.sheet.replaceChildren();
    this.game.bus.emit('panel:close', { id });
  }

  toggle(id: string): void {
    if (this.openId === id) this.close();
    else this.open(id);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
