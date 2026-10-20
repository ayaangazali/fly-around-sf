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

const BAR = ['menu', 'map', 'dex', 'friends', 'settings'];

export class PanelHost {
  private panels = new Map<string, Panel>();
  readonly bar: HTMLElement;
  readonly sheet: HTMLElement;
  openId: string | null = null;
  private cleanup: (() => void) | void = undefined;
  private opener: HTMLElement | null = null;

  constructor(private game: Game) {
    this.bar = el('nav', 'menubar');
    this.bar.setAttribute('aria-label', 'Game menu');
    this.sheet = el('section', 'sheet');
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.sheet.hidden = true;
    this.sheet.setAttribute('aria-labelledby', 'sheet-title');
    this.sheet.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Tab') trapTab(this.sheet, e);
    });
    game.ui.append(this.bar, this.sheet);
  }

  register(panels: Panel[]): void {
    for (const p of panels) this.panels.set(p.id, p);
    this.bar.replaceChildren();
    for (const id of BAR) {
      const p = this.panels.get(id);
      if (!p) continue;
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
    const from = document.activeElement as HTMLElement | null;
    const opener = this.openId ? this.opener : from && from !== document.body ? from : null;
    this.opener = null;
    this.close();
    this.opener = opener;
    this.openId = id;
    this.sheet.hidden = false;
    this.sheet.dataset.panel = id;
    const head = el('header', 'sheet-head');
    const h = el('h2');
    h.id = 'sheet-title';
    h.textContent = `${p.icon}  ${p.title}`;
    const x = el('button', 'sheet-close');
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => this.close());
    head.append(h, x);
    const body = el('div', 'sheet-body');
    body.tabIndex = 0;
    body.setAttribute('aria-labelledby', 'sheet-title');
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
    const back = this.opener;
    this.opener = null;
    if (back?.isConnected) back.focus();
  }

  toggle(id: string): void {
    if (this.openId === id) this.close();
    else this.open(id);
  }
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function trapTab(root: HTMLElement, e: KeyboardEvent): void {
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
