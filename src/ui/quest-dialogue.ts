import './quest-dialogue.css';
import type { Game } from '../game';
import { NORTON, type Line, type QuestInstance } from '../activities/quest-common';
import { el } from './panel-host';
import { nortonSvg } from './norton';

const CHARS_PER_SECOND = 48;

export function reducedMotion(game: Game): boolean {
  const s = game.save.data.settings.reducedMotion;
  return s === undefined ? typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches : !!s;
}

export async function copyShare(game: Game, share: string): Promise<boolean> {
  const text = `${share}\n${location.origin}${location.pathname}`;
  try {
    await navigator.clipboard.writeText(text);
    game.toast('Result copied. Paste it anywhere.', 'reward');
    return true;
  } catch {
    return false;
  }
}

export class QuestDialogue {
  readonly root = el('section', 'qd');
  private portrait = el('div', 'qd-portrait');
  private who = el('div', 'qd-who');
  private typed = el('span', 'qd-typed');
  private full = el('span', 'sr-only');
  private share = el('div', 'qd-share');
  private count = el('span', 'qd-count');
  private next = el('button', 'qd-next');
  private queue: Line[] = [];
  private line: Line | null = null;
  private shown = 0;
  private hold = 0;
  private last = 0;
  private hover = false;
  private raf = 0;
  private total = 0;

  constructor(private game: Game) {
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Story dialogue');
    this.typed.setAttribute('aria-hidden', 'true');
    this.full.setAttribute('aria-live', 'polite');
    const text = el('p', 'qd-text');
    text.append(this.typed, this.full);
    this.next.innerHTML = 'Next <kbd>F</kbd>';
    this.next.addEventListener('click', (e) => {
      e.stopPropagation();
      this.advance();
    });
    const skip = el('button', 'qd-skip', 'Skip');
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    const foot = el('div', 'qd-foot');
    foot.append(this.count, skip, this.next);
    const body = el('div', 'qd-body');
    body.append(this.who, text, this.share, foot);
    this.root.append(this.portrait, body);
    this.share.addEventListener('click', (e) => e.stopPropagation());
    this.root.addEventListener('click', () => this.advance());
    this.root.addEventListener('pointerenter', () => (this.hover = true));
    this.root.addEventListener('pointerleave', () => (this.hover = false));
    game.ui.append(this.root);
    game.bus.on('quest:say', ({ lines }) => this.push(lines));
    game.bus.on('interact', () => this.advance());
    game.bus.on('panel:open', () => this.root.classList.add('paused'));
    game.bus.on('panel:close', () => this.root.classList.remove('paused'));
  }

  get visible(): boolean {
    return !!this.line;
  }

  get text(): string {
    return this.line?.text ?? '';
  }

  push(lines: Line[]): void {
    this.queue.push(...lines);
    this.total += lines.length;
    if (!this.line) this.show();
  }

  advance(): void {
    if (!this.line) return;
    if (this.shown < this.line.text.length) this.shown = this.line.text.length;
    else this.show();
    this.paint();
  }

  skip(): void {
    this.queue = [];
    this.show();
  }

  private show(): void {
    this.line = this.queue.shift() ?? null;
    cancelAnimationFrame(this.raf);
    if (!this.line) {
      this.root.hidden = true;
      this.total = 0;
      return;
    }
    const l = this.line;
    const norton = l.who === NORTON;
    this.root.hidden = false;
    this.root.classList.toggle('clue', !norton);
    this.root.classList.remove('enter');
    void this.root.offsetWidth;
    this.root.classList.add('enter');
    this.portrait.innerHTML = norton ? nortonSvg() : '<span aria-hidden="true">📜</span>';
    this.who.textContent = l.who;
    this.full.textContent = l.text;
    this.shown = reducedMotion(this.game) ? l.text.length : 0;
    this.hold = l.share ? 30 : Math.min(12, Math.max(3.5, 1.5 + l.text.length / 20));
    this.share.replaceChildren();
    this.share.hidden = !l.share;
    if (l.share) {
      const pre = el('pre', 'qd-share-text', l.share);
      const copy = el('button', 'qd-copy', 'Copy result');
      copy.addEventListener('click', (e) => {
        e.stopPropagation();
        void copyShare(this.game, l.share as string).then((ok) => {
          if (!ok) {
            getSelection()?.selectAllChildren(pre);
            this.game.toast('Copy blocked by the browser. The result is selected: press Ctrl+C or Cmd+C.', 'warn');
          }
        });
      });
      this.share.append(pre, copy);
      void copyShare(this.game, l.share);
    }
    this.count.textContent = this.total > 1 ? `${this.total - this.queue.length}/${this.total}` : '';
    this.last = performance.now();
    this.paint();
    const frame = (now: number) => {
      this.tick(Math.min(0.5, (now - this.last) / 1000));
      this.last = now;
      if (this.line) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private tick(dt: number): void {
    const l = this.line;
    if (!l || this.root.classList.contains('paused')) return;
    if (this.shown < l.text.length) {
      this.shown = Math.min(l.text.length, this.shown + CHARS_PER_SECOND * dt);
      this.paint();
    } else if (!this.hover && (this.hold -= dt) <= 0) this.show();
  }

  private paint(): void {
    const l = this.line;
    if (!l) return;
    const done = this.shown >= l.text.length;
    this.typed.textContent = l.text.slice(0, Math.floor(this.shown));
    this.root.classList.toggle('typing', !done);
    this.next.innerHTML = done && !this.queue.length ? 'Close <kbd>F</kbd>' : 'Next <kbd>F</kbd>';
  }
}

export class QuestTracker {
  readonly root = el('aside', 'qt');
  private icon = el('span', 'qt-icon');
  private title = el('strong', 'qt-title');
  private text = el('p', 'qt-text');
  private hint = el('p', 'qt-hint');
  private heat = el('div', 'qt-heat');
  private heatLabel = el('span');
  private abandon = el('button', 'qt-abandon', '✕');
  id: string | null = null;
  private confirmUntil = 0;

  constructor(game: Game) {
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Current objective');
    this.text.setAttribute('aria-live', 'polite');
    this.abandon.setAttribute('aria-label', 'Abandon this activity');
    this.abandon.title = 'Abandon';
    this.abandon.addEventListener('click', () => {
      if (performance.now() < this.confirmUntil) {
        game.activities.stop();
        game.toast('Abandoned. It will be waiting when you come back.', 'info');
        this.hide();
        return;
      }
      this.confirmUntil = performance.now() + 3000;
      this.abandon.textContent = 'Abandon?';
      setTimeout(() => (this.abandon.textContent = '✕'), 3000);
    });
    this.heat.append(el('i'), this.heatLabel);
    const head = el('div', 'qt-head');
    head.append(this.icon, this.title, this.abandon);
    this.root.append(head, this.text, this.hint, this.heat);
    game.ui.append(this.root);
    game.bus.on('quest:objective', (o) => {
      this.id = o.id;
      this.icon.textContent = o.icon;
      this.title.textContent = o.title;
      this.text.textContent = o.text;
      this.hint.textContent = o.hint ? `💡 ${o.hint}` : '';
      this.hint.hidden = !o.hint;
      this.root.hidden = false;
      this.root.classList.remove('bump');
      void this.root.offsetWidth;
      this.root.classList.add('bump');
    });
  }

  hide(): void {
    this.id = null;
    this.root.hidden = true;
  }

  update(activeId: string | null, inst: QuestInstance | null): void {
    if (!this.id) return;
    if (activeId !== this.id || !inst) return this.hide();
    const h = inst.heat?.();
    this.heat.hidden = h === undefined;
    if (h === undefined) return;
    const trend = inst.trend?.() ?? 'steady';
    this.heat.style.setProperty('--heat', h.toFixed(3));
    this.heat.style.setProperty('--beat', `${(1.6 - h * 1.35).toFixed(2)}s`);
    this.heat.dataset.trend = trend;
    this.heatLabel.textContent = trend === 'warmer' ? 'Warmer' : trend === 'colder' ? 'Colder' : h > 0.9 ? 'Burning hot' : h > 0.6 ? 'Warm' : h > 0.25 ? 'Lukewarm' : 'Cold';
  }
}
