import './quests.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { Game } from '../../game';
import type { ActivityDef } from '../../activities/types';
import { chapters, objectivePoints, type QuestParams } from '../../activities/kinds/quest';
import { decreeNumber, sfDate, shiftDate } from '../../activities/kinds/daily';
import { nortonSvg } from '../norton';
import { copyShare } from '../quest-dialogue';
import { pointTo } from '../../activities/quest-common';
import { setSetting, settingsOf } from '../settings-model';

type Tab = 'story' | 'daily' | 'riddles' | 'hunts';
const TABS: [Tab, string][] = [
  ['story', '📜 Story'],
  ['daily', '🗓 Daily'],
  ['riddles', '🧩 Riddles'],
  ['hunts', '🪙 Hunts'],
];
let tab: Tab = 'story';

function waypointButton(game: Game, label: string, p: () => { x: number; y: number; z: number }, text = 'Set waypoint'): HTMLButtonElement {
  const b = el('button', 'ql-btn', `📍 ${text}`);
  b.addEventListener('click', () => {
    pointTo(game, p(), label);
    game.toast(`Waypoint set: ${label}`, 'info');
    game.panels.close();
  });
  return b;
}

function distanceText(game: Game, d: ActivityDef): string {
  const q = game.activities.position(d);
  const m = Math.hypot(q.x - game.flight.pos.x, q.z - game.flight.pos.z);
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function story(root: HTMLElement, game: Game): void {
  const list = chapters(game.activities.list());
  const done = list.filter((d) => game.save.isDone(d.id)).length;
  const active = game.activities.active;
  const hero = el('div', 'ql-hero');
  const portrait = el('div', 'ql-portrait');
  portrait.innerHTML = nortonSvg();
  const copy = el('div');
  copy.append(
    el('h3', '', 'The Lost Commit'),
    el('p', '', 'Someone force-pushed over San Francisco’s history and the city is forgetting itself. Emperor Norton I needs a pilot to fly it back together, one chapter at a time.'),
  );
  const bar = el('div', 'ql-progress');
  bar.style.setProperty('--p', String(list.length ? done / list.length : 0));
  bar.append(el('i'), el('span', '', `${done} of ${list.length} chapters restored`));
  copy.append(bar);
  hero.append(portrait, copy);
  root.append(hero);

  const ol = el('ol', 'ql-chapters');
  const current = list.find((d) => !game.save.isDone(d.id));
  for (const d of list) {
    const p = d.params as unknown as QuestParams;
    const isDone = game.save.isDone(d.id);
    const locked = game.activities.locked(d);
    const running = active?.def.id === d.id;
    const saved = game.save.data.flags[`quest:${d.id}`];
    const paused = !running && !isDone && typeof saved === 'number' ? saved : 0;
    const li = el('li', 'ql-chapter');
    li.dataset.activity = d.id;
    li.classList.toggle('done', isDone);
    li.classList.toggle('locked', locked);
    li.classList.toggle('current', d === current);
    const head = el('div', 'ql-chapter-head');
    head.append(
      el('span', 'ql-num', String(p.chapter)),
      el('strong', '', locked ? 'A chapter not yet written' : d.title),
      el('span', 'ql-chip', isDone ? 'Restored ✓' : running ? 'In progress' : locked ? '🔒 Locked' : paused ? `Paused ${paused}/${p.objectives.length}` : 'Ready'),
    );
    li.append(head);
    if (!locked) li.append(el('p', 'ql-meta', `${d.neighborhood} · ${distanceText(game, d)} · ${d.xp ?? 0} XP`));
    if (running && active) {
      const prog = Math.round(active.inst.progress() * p.objectives.length);
      const steps = el('ul', 'ql-objectives');
      p.objectives.forEach((o, i) => {
        if (i > prog) return;
        const s = el('li', i < prog ? 'done' : 'now', `${i < prog ? '✓' : '▸'} ${o.text}`);
        steps.append(s);
      });
      if (prog + 1 < p.objectives.length) steps.append(el('li', 'later', `${p.objectives.length - prog - 1} more to go`));
      li.append(steps);
      const o = p.objectives[prog];
      const row = el('div', 'ql-row');
      if (o && (o.type === 'goto' || o.type === 'read' || o.type === 'collect')) row.append(waypointButton(game, o.text, () => objectivePoints(o, game)[0], 'Guide me'));
      const stop = el('button', 'ql-btn ghost', 'Abandon chapter');
      stop.addEventListener('click', () => {
        game.activities.stop();
        game.panels.close();
        game.toast('Chapter paused. Start it again any time.', 'info');
      });
      row.append(stop);
      li.append(row);
    } else if (d === current && !locked) {
      li.append(el('p', 'ql-blurb', d.blurb));
      if (paused) {
        const steps = el('ul', 'ql-objectives');
        for (const o of p.objectives.slice(0, paused)) steps.append(el('li', 'done', `✓ ${o.text}`));
        li.append(steps);
      }
      const row = el('div', 'ql-row');
      row.append(waypointButton(game, `Chapter ${p.chapter}: ${d.title}`, () => game.activities.position(d), paused ? 'Resume' : 'Set waypoint'));
      row.append(el('span', 'ql-tip', paused ? 'Fly to the beacon and press F to pick up where you left off.' : 'Fly to the beacon and press F to begin.'));
      li.append(row);
    }
    if (isDone) {
      const det = el('details', 'ql-story');
      det.append(el('summary', '', 'Read this chapter again'));
      for (const line of [...p.intro, ...p.objectives.flatMap((o) => [...(o.clue ? [`${o.clue.from}: “${o.clue.text}”`] : []), ...(o.say ?? [])]), ...p.outro]) det.append(el('p', '', line));
      li.append(det);
    }
    ol.append(li);
  }
  root.append(ol);
}

function daily(root: HTMLElement, game: Game): void {
  const def = game.activities.defs.get('daily-clue');
  const date = sfDate(game.date());
  const f = game.save.data.flags;
  const result = f[`daily:${date}`] as string | undefined;
  const card = el('div', 'ql-daily');
  card.append(el('h3', '', `Daily Decree #${decreeNumber(date)}`), el('p', 'ql-meta', `${date} · a new location riddle every midnight, San Francisco time`));
  const stats = el('div', 'ql-stats');
  const streak = f['daily:last'] === date || f['daily:last'] === shiftDate(date, -1) ? Number(f['daily:streak'] ?? 0) : 0;
  for (const [k, v] of [
    ['Streak', `${streak} 🔥`],
    ['Solved', String(f['daily:count'] ?? 0)],
    ['Next decree', untilMidnight(game.date())],
  ]) {
    const s = el('div');
    s.append(el('b', '', v), el('span', '', k));
    stats.append(s);
  }
  card.append(stats);
  if (result) {
    const pre = el('pre', 'ql-share', result);
    const b = el('button', 'ql-btn primary', 'Copy result');
    b.addEventListener('click', () => {
      void copyShare(game, result).then((ok) => {
        if (!ok) getSelection()?.selectAllChildren(pre);
      });
    });
    card.append(el('p', 'ql-done', '✓ Solved today. Come back tomorrow for a new decree.'), pre, b);
  } else if (def) {
    const b = el('button', 'ql-btn primary', game.activities.active?.def.id === def.id ? 'Decree in progress' : '▶ Start today’s decree');
    b.disabled = game.activities.active?.def.id === def.id;
    b.addEventListener('click', () => {
      if (game.activities.start(def.id)) game.panels.close();
    });
    card.append(el('p', '', 'The Emperor issues one riddle a day. Read it, work out the place, and fly there. Hints arrive after one and two minutes. Fewer hints and a straighter flight make a better result to share.'), b);
  }
  root.append(card);
}

function untilMidnight(now: Date): string {
  const sf = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const mins = 24 * 60 - (sf.getHours() * 60 + sf.getMinutes());
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function catalog(root: HTMLElement, game: Game, kind: 'riddle' | 'scavenger', empty: string): void {
  const defs = game.activities
    .list()
    .filter((d) => d.kind === kind)
    .sort((a, b) => Number(game.save.isDone(a.id)) - Number(game.save.isDone(b.id)) || a.neighborhood.localeCompare(b.neighborhood));
  const solved = defs.filter((d) => game.save.isDone(d.id)).length;
  const bar = el('div', 'ql-progress');
  bar.style.setProperty('--p', String(defs.length ? solved / defs.length : 0));
  bar.append(el('i'), el('span', '', `${solved} of ${defs.length} ${empty}`));
  root.append(bar);
  const ul = el('ul', 'ql-catalog');
  for (const d of defs) {
    const li = el('li', 'ql-item');
    li.dataset.activity = d.id;
    const isDone = game.save.isDone(d.id);
    li.classList.toggle('done', isDone);
    const best = game.save.data.best[d.id];
    const text = el('div');
    text.append(el('strong', '', `${isDone ? '✓ ' : ''}${d.title}`), el('span', 'ql-meta', `${d.neighborhood} · ${distanceText(game, d)}${best !== undefined ? ` · best ${best.toFixed(1)}s` : ''}`), el('p', '', d.blurb));
    li.append(text, waypointButton(game, d.title, () => game.activities.position(d), 'Go'));
    ul.append(li);
  }
  root.append(ul);
}

export const panel: Panel = {
  id: 'quests',
  title: 'Quest Log',
  icon: '📜',
  action: 'quests',
  order: 12,
  render(root, game) {
    root.classList.add('ql');
    const bar = el('div', 'ql-tabs');
    bar.setAttribute('role', 'tablist');
    const body = el('div', 'ql-body');
    body.setAttribute('role', 'tabpanel');
    const buttons = TABS.map(([id, label]) => {
      const b = el('button', 'ql-tab', label);
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.addEventListener('click', () => select(id));
      b.addEventListener('keydown', (e) => {
        const i = TABS.findIndex(([t]) => t === id);
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = TABS[(i + step + TABS.length) % TABS.length][0];
        select(next);
        buttons.find((x) => x.dataset.tab === next)?.focus();
      });
      return b;
    });
    const select = (id: Tab) => {
      tab = id;
      for (const b of buttons) {
        const on = b.dataset.tab === id;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      }
      body.replaceChildren();
      body.dataset.tab = id;
      if (id === 'story') story(body, game);
      else if (id === 'daily') daily(body, game);
      else if (id === 'riddles') catalog(body, game, 'riddle', 'riddles solved');
      else catalog(body, game, 'scavenger', 'hunts finished');
    };
    bar.append(...buttons);
    if (!settingsOf(game).sideActivities) {
      const side = el('div', 'ql-row ql-side');
      const on = el('button', 'ql-btn primary', 'Show side activities');
      on.addEventListener('click', () => {
        setSetting(game, 'sideActivities', true);
        game.panels.close();
        game.toast('Side activities are on. Look for beacons around the city', 'info');
      });
      side.append(el('span', 'ql-tip', 'The story, riddles and hunts are side activities. Turn them on to see their beacons and start them with F.'), on);
      root.append(side);
    }
    root.append(bar, body);
    select(tab);
  },
};
