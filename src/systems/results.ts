import type { Game, GameSystem } from '../game';
import type { ActivityDef } from '../activities/types';
import { el } from '../ui/panel-host';
import { MEDAL_NAMES, bestMedal, bestOf, formatTime, isMedals, keepBest, medalFor, saveMedal, type MinigameResult } from '../activities/minigame';
import '../ui/minigames.css';

let card: HTMLElement;
let shownAt: { x: number; z: number } | null = null;
let current: ActivityDef | null = null;
let pending: MinigameResult | null = null;
let prevBest: number | undefined;

const SCORED: Record<string, { improved: string; gold: string; text: (v: number) => string }> = {
  photo: { improved: 'New best shot!', gold: 'Gold needs a three star shot', text: (v) => `${'★'.repeat(v)}${'☆'.repeat(3 - v)}` },
  follow: { improved: 'New best formation!', gold: 'Gold needs 75% in close formation', text: (v) => `${v}%` },
};

function hide(): void {
  card.hidden = true;
  shownAt = null;
  current = null;
}

function retry(game: Game): void {
  const def = current;
  if (!def) return;
  hide();
  game.teleport(game.activities.position(def));
  if (game.activities.start(def.id)) game.toast(`${def.title}: go!`);
}

function stat(label: string, value: string): HTMLElement {
  const d = el('div');
  d.append(el('dt', '', label), el('dd', '', value));
  return d;
}

function show(game: Game, def: ActivityDef, r: MinigameResult, won: boolean): void {
  const kind = game.activities.kindOf(def);
  const best = game.save.data.best[def.id];
  const improved = won && saveMedal(game.save, def.id, r.medal);
  const scored = SCORED[def.kind];
  const pointsKey = `points:${def.id}`;
  const hadPoints = bestOf(game.save, pointsKey) > 0;
  const newPoints = won && r.points !== undefined && keepBest(game.save, pointsKey, r.points) && hadPoints;
  const newBest = !scored && won && prevBest !== undefined && best !== undefined && best < prevBest;
  const medals = def.params?.medals;
  card.className = `results ${won ? `results-win medal-${r.medal}` : 'results-fail'}`;
  const badge = el('div', 'results-medal', won ? (r.medal ? '★' : '✓') : '✕');
  badge.setAttribute('aria-hidden', 'true');
  const body = el('div', 'results-body');
  const head = el('p', 'results-kind', `${kind.icon} ${kind.label} · ${def.neighborhood}`);
  const title = el('h3', '', def.title);
  const verdict = el('p', 'results-verdict', won ? (r.medal ? `${MEDAL_NAMES[r.medal]} medal` : 'Complete') : r.fail ?? 'Try again');
  if (r.score) verdict.append(el('span', 'results-score', r.score));
  const stats = el('dl', 'results-stats');
  stats.append(stat('Time', formatTime(r.time)));
  const top = bestMedal(game.save, def.id);
  const points = bestOf(game.save, pointsKey);
  if (scored) stats.append(stat('Best', points ? scored.text(points) : 'none'));
  else stats.append(stat('Best', best !== undefined ? formatTime(best) : 'none'));
  stats.append(stat('Top medal', top ? MEDAL_NAMES[top] : 'none'));
  const notes: string[] = [];
  if (newBest) notes.push('New best time!');
  if (newPoints && scored) notes.push(scored.improved);
  if (improved && r.medal) notes.push(`New ${MEDAL_NAMES[r.medal].toLowerCase()} medal`);
  if (scored && won && r.medal < 3) notes.push(scored.gold);
  if (isMedals(medals) && r.medal < 3) notes.push(`Gold under ${formatTime(medals[0])} · Silver ${formatTime(medals[1])} · Bronze ${formatTime(medals[2])}`);
  const note = el('p', 'results-note', notes.join('  ·  '));
  note.hidden = !notes.length;
  const actions = el('div', 'results-actions');
  const again = el('button', 'results-retry');
  again.append(el('kbd', '', 'F'), ` ${won ? 'Fly it again' : 'Retry'}`);
  again.addEventListener('click', () => retry(game));
  const close = el('button', 'results-close', 'Close');
  close.addEventListener('click', hide);
  actions.append(again, close);
  body.append(head, title, verdict, stats, note, actions);
  card.replaceChildren(badge, body);
  card.hidden = false;
  current = def;
  shownAt = { x: game.flight.pos.x, z: game.flight.pos.z };
}

export const system: GameSystem = {
  id: 'results',
  order: 45,
  init(game) {
    card = el('section', 'results');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.hidden = true;
    game.ui.append(card);
    game.bus.on('activity:start', ({ id }) => {
      hide();
      pending = null;
      prevBest = game.save.data.best[id];
    });
    game.bus.on('minigame:result', (r) => void (pending = r));
    game.bus.on('panel:open', hide);
    game.bus.on('activity:complete', ({ id, time }) => {
      const def = game.activities.defs.get(id);
      if (!def || game.activities.kindOf(def).passive) return;
      const r = pending?.id === id ? pending : { id, time: time ?? 0, medal: medalFor(def.params?.medals, time ?? 0) };
      pending = null;
      show(game, def, r, true);
    });
    game.bus.on('activity:fail', ({ id }) => {
      const def = game.activities.defs.get(id);
      if (!def) return;
      const r = pending?.id === id ? pending : { id, time: 0, medal: 0, fail: 'Out of time' };
      pending = null;
      show(game, def, r, false);
    });
    game.bus.on('interact', () => {
      if (!card.hidden && !game.activities.active && !game.activities.nearby) retry(game);
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'Escape' && !card.hidden && !game.panels.openId) {
          e.stopPropagation();
          hide();
        }
      },
      true,
    );
  },
  update(_dt, game) {
    if (!shownAt) return;
    if (Math.hypot(game.flight.pos.x - shownAt.x, game.flight.pos.z - shownAt.z) > 400) hide();
    else card.classList.toggle('results-busy', !!game.activities.nearby);
  },
};
