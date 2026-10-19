import type { Game } from '../game';
import type { ActivityDef } from '../activities/types';
import type { TriviaParams } from '../activities/kinds/trivia';
import type { TourStop } from '../activities/kinds/tour';
import { el } from './panel-host';
import './places.css';

export interface TriviaView {
  tick(frac: number): void;
  reveal(chosen: number, answer: number): void;
  close(won: boolean): void;
}

export interface TourView {
  arrive(i: number): void;
  close(): void;
}

const hasDom = (game: Game) => typeof document !== 'undefined' && !!game.ui;

function fadeOut(node: HTMLElement, after: number): void {
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 450);
  }, after);
}

export function showTrivia(game: Game, def: ActivityDef, p: TriviaParams, limit: number, onPick: (i: number) => void): TriviaView | null {
  if (!hasDom(game)) return null;
  document.querySelector('.trivia')?.remove();
  const root = el('section', 'trivia');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'trivia-q');
  root.dataset.activity = def.id;
  const timer = el('div', 'trivia-timer');
  const bar = el('i');
  timer.append(bar);
  timer.title = `${limit} seconds`;
  const kicker = el('p', 'trivia-kicker');
  kicker.append(el('b', 'trivia-badge', '?'), el('span', undefined, `Trivia · ${def.neighborhood}`));
  const title = el('p', 'trivia-title', def.title);
  const q = el('h3', 'trivia-q', p.question);
  q.id = 'trivia-q';
  const grid = el('div', 'trivia-options');
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const buttons: HTMLButtonElement[] = [];
  order.forEach((oi, slot) => {
    const b = el('button', 'trivia-opt');
    b.type = 'button';
    b.dataset.option = String(oi);
    b.append(el('kbd', undefined, String(slot + 1)), el('span', undefined, p.options[oi]));
    b.addEventListener('click', () => onPick(oi));
    buttons[oi] = b;
    grid.append(b);
  });
  const result = el('div', 'trivia-result');
  result.setAttribute('aria-live', 'polite');
  const hint = el('p', 'trivia-hint');
  hint.append(el('kbd', undefined, '1'), ' to ', el('kbd', undefined, '4'), ' or tap an answer');
  root.append(timer, kicker, title, q, grid, hint, result);
  const onKey = (e: KeyboardEvent) => {
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (!m || game.panels.openId) return;
    e.preventDefault();
    onPick(order[Number(m[1]) - 1]);
  };
  window.addEventListener('keydown', onKey);
  game.ui.append(root);
  let answered = false;
  return {
    tick(frac) {
      bar.style.transform = `scaleX(${frac.toFixed(4)})`;
      root.classList.toggle('urgent', frac < 0.25);
    },
    reveal(chosen, answer) {
      answered = true;
      window.removeEventListener('keydown', onKey);
      const won = chosen === answer;
      root.classList.add('answered', won ? 'right' : 'wrong');
      buttons.forEach((b, i) => {
        b.disabled = true;
        b.classList.toggle('is-answer', i === answer);
        b.classList.toggle('is-chosen', i === chosen);
      });
      const head = won ? 'Correct!' : `${chosen < 0 ? "Time's up." : 'Not quite.'} It was ${p.options[answer]}.`;
      result.replaceChildren(el('strong', undefined, head), el('p', undefined, p.explain));
      if (!won) result.append(el('small', undefined, 'Press F or tap the prompt to try again.'));
      hint.remove();
    },
    close(won) {
      window.removeEventListener('keydown', onKey);
      if (!answered) root.remove();
      else fadeOut(root, won ? 2600 : 6000);
    },
  };
}

function speak(game: Game, text: string): void {
  if (game.opts.test || typeof speechSynthesis === 'undefined') return;
  const s = game.save.data.settings;
  const volume = Number(s.volMaster ?? 0.8) * Number(s.volVoice ?? 1);
  if (s.muted || !(volume > 0)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.volume = Math.min(1, volume);
  u.lang = 'en-US';
  speechSynthesis.speak(u);
}

export function showTour(game: Game, def: ActivityDef, stops: TourStop[]): TourView | null {
  if (!hasDom(game)) return null;
  document.querySelector('.tour')?.remove();
  const root = el('aside', 'tour');
  root.setAttribute('aria-live', 'polite');
  root.dataset.activity = def.id;
  const dots = el('ol', 'tour-dots');
  for (const s of stops) {
    const li = el('li');
    li.title = s.name;
    dots.append(li);
  }
  const kicker = el('p', 'tour-kicker');
  const name = el('h3', 'tour-name');
  const line = el('p', 'tour-line');
  const next = el('p', 'tour-next');
  const body = el('div', 'tour-body');
  body.append(kicker, name, line, next);
  root.append(dots, body);
  const render = (k: string, n: string, l: string, nx: string, done: number) => {
    kicker.textContent = k;
    name.textContent = n;
    line.textContent = l;
    next.textContent = nx;
    [...dots.children].forEach((d, i) => {
      d.classList.toggle('done', i < done);
      d.classList.toggle('current', i === done);
    });
    body.classList.remove('swap');
    void body.offsetWidth;
    body.classList.add('swap');
  };
  render(`Guided tour · ${stops.length} stops`, def.title, def.blurb, `First stop: ${stops[0].name}`, 0);
  game.ui.append(root);
  let arrived = 0;
  return {
    arrive(i) {
      arrived = i + 1;
      const s = stops[i];
      const last = arrived === stops.length;
      render(`Stop ${arrived} of ${stops.length}`, s.name, s.line, last ? 'Tour complete' : `Next: ${stops[arrived].name}`, arrived);
      root.classList.toggle('complete', last);
      speak(game, s.line);
    },
    close() {
      if (arrived < stops.length) {
        if (!game.opts.test && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        root.remove();
      } else fadeOut(root, 8000);
    },
  };
}
