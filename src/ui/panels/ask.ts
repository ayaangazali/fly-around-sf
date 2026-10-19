import * as THREE from 'three';
import './ask.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { Game } from '../../game';
import { loadCards, type CardDef } from '../../content/types';
import { answerOffline, bestQuote, contextFor, entriesFrom, formatDistance, nearest, search, whatIsThat, type Answer, type LoreEntry, type Sighting } from '../../ai/lore';
import { askLive, proxyUrl } from '../../ai/live';

declare module '../../core/bus' {
  interface GameEvents {
    'dex:show': { id: string };
    'ask:answer': { question: string; entry: string | null; mode: 'offline' | 'live' | 'fallback' };
  }
}

interface Exchange {
  question: string;
  sighting: Sighting | null;
  answer: Answer;
  live: string | null;
  mode: 'offline' | 'live' | 'fallback' | 'pending';
}

const thread: Exchange[] = [];
const MAX_THREAD = 20;
const MAX_QUESTION = 300;

function liveUrl(game: Game): string | null {
  return proxyUrl(game.save.data.settings.aiProxyUrl, import.meta.env.VITE_AI_PROXY_URL as string | undefined);
}

function cameraPose(game: Game) {
  const dir = game.camera.getWorldDirection(new THREE.Vector3());
  const flat = Math.hypot(dir.x, dir.z) > 1e-3;
  return { x: game.flight.pos.x, z: game.flight.pos.z, yaw: flat ? Math.atan2(-dir.x, -dir.z) : game.flight.yaw };
}

export const panel: Panel & { cards: CardDef[] | null } = {
  id: 'ask',
  title: 'Ask the City',
  icon: '💬',
  action: 'ask',
  order: 40,
  cards: null,
  render(root, game) {
    const entries = entriesFrom(
      panel.cards ?? loadCards(),
      game.activities.list().filter((d) => game.activities.kinds.get(d.kind)?.passive),
    );
    const imperial = game.save.data.settings.units === 'imperial';
    const pos = () => ({ x: game.flight.pos.x, z: game.flight.pos.z });
    let disposed = false;

    const mode = el('p', 'ask-mode');
    const drawMode = () => {
      const url = liveUrl(game);
      mode.replaceChildren(el('span', `ask-dot ${url ? 'live' : ''}`), el('span', '', url ? 'Live guide on, with the archive as backup' : `Archive mode · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} of handwritten lore`));
    };
    drawMode();

    const look = el('button', 'ask-look');
    look.type = 'button';
    look.dataset.ask = 'look';
    look.append(el('span', 'ask-look-icon', '⌖'), el('span', 'ask-look-text', 'What is that?'), el('small', '', 'Names the place your camera faces'));

    const form = el('form', 'ask-form');
    const input = el('input', 'ask-input');
    input.type = 'text';
    input.name = 'question';
    input.maxLength = MAX_QUESTION;
    input.autocomplete = 'off';
    input.enterKeyHint = 'send';
    input.placeholder = 'Ask about any place in the city';
    input.setAttribute('aria-label', 'Your question for the city');
    const send = el('button', 'ask-send', 'Ask');
    send.type = 'submit';
    form.append(input, send);

    const chips = el('div', 'ask-chips');
    const list = el('ol', 'ask-thread');
    list.setAttribute('aria-live', 'polite');

    const drawChips = () => {
      chips.replaceChildren();
      if (thread.length) return;
      const near = nearest(entries, pos(), 3);
      const qs = near.length ? near.map((e) => `What is ${e.name}?`) : entries.slice(0, 3).map((e) => `What is ${e.name}?`);
      for (const q of qs) {
        const c = el('button', 'ask-chip', q);
        c.type = 'button';
        c.addEventListener('click', () => ask(q));
        chips.append(c);
      }
    };

    const entryCard = (e: LoreEntry, x: Exchange) => {
      const box = el('div', 'ask-entry');
      const head = el('div', 'ask-entry-head');
      head.append(el('strong', '', e.name), el('span', 'ask-tag', e.category), el('span', 'ask-hood', e.neighborhood));
      box.append(head);
      if (x.mode !== 'live') box.append(el('blockquote', 'ask-quote', x.answer.quote));
      if (x.mode !== 'live' && e.blurb && e.blurb !== x.answer.quote) box.append(el('p', 'ask-blurb', e.blurb));
      const actions = el('div', 'ask-actions');
      if (e.card && game.panels.get('dex')) {
        const dex = el('button', 'ask-act', 'Open in Dex');
        dex.type = 'button';
        dex.dataset.ask = 'dex';
        dex.addEventListener('click', () => {
          game.panels.open('dex');
          game.bus.emit('dex:show', { id: e.card as string });
        });
        actions.append(dex);
      }
      if (e.at && game.world) {
        const go = el('button', 'ask-act', 'Go there');
        go.type = 'button';
        go.dataset.ask = 'go';
        go.addEventListener('click', () => {
          const p = game.world.point({ ...e.at!, alt: e.at!.alt ?? 40 });
          game.waypoint = { ...p, label: e.name };
          game.toast(`Waypoint set: ${e.name}`);
          game.panels.close();
        });
        actions.append(go);
      }
      if (e.sources.length) {
        const src = el('details', 'ask-sources');
        src.append(el('summary', '', `Sources (${e.sources.length})`));
        const ul = el('ul');
        for (const s of e.sources) {
          const a = el('a', '', new URL(s).hostname.replace(/^www\./, ''));
          a.href = s;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          const li = el('li');
          li.append(a);
          ul.append(li);
        }
        src.append(ul);
        actions.append(src);
      }
      if (actions.childElementCount) box.append(actions);
      return box;
    };

    const drawThread = () => {
      list.replaceChildren();
      for (const x of thread) {
        const li = el('li', `ask-x ask-${x.mode}`);
        li.dataset.mode = x.mode;
        const q = el('p', 'ask-q');
        if (x.sighting?.ahead) q.append(el('span', 'ask-q-label', 'You pointed at'), el('span', '', ` ${x.sighting.entry.name} · ${formatDistance(x.sighting.dist, imperial)} ahead`));
        else q.append(el('span', 'ask-q-label', 'You asked'), el('span', '', ` ${x.question}`));
        const a = el('div', 'ask-a');
        if (x.mode === 'pending') {
          a.append(el('p', 'ask-lead', 'The Emperor is consulting his ledger'), el('div', 'ask-shimmer'));
        } else {
          const badge = x.mode === 'live' ? 'Live guide' : x.mode === 'fallback' ? 'Archive (live guide unreachable)' : 'Archive';
          a.append(el('span', `ask-badge ${x.mode}`, badge));
          if (x.mode === 'live' && x.live) a.append(el('p', 'ask-live', x.live));
          else a.append(el('p', 'ask-lead', x.answer.lead));
          if (x.answer.entry) a.append(entryCard(x.answer.entry, x));
          else if (x.mode !== 'live') a.append(el('p', 'ask-quote plain', x.answer.quote));
          if (x.answer.related.length) {
            const rel = el('div', 'ask-related');
            rel.append(el('span', '', x.answer.entry ? 'Also try' : 'Nearby'));
            for (const r of x.answer.related) {
              const c = el('button', 'ask-chip small', r.name);
              c.type = 'button';
              c.addEventListener('click', () => ask(`What is ${r.name}?`));
              rel.append(c);
            }
            a.append(rel);
          }
        }
        li.append(q, a);
        list.append(li);
      }
      drawChips();
    };

    const settle = async (x: Exchange, matches: LoreEntry[]) => {
      const url = liveUrl(game);
      if (url) {
        x.mode = 'pending';
        drawThread();
        try {
          const place = nearest(entries, pos(), 1)[0]?.name;
          x.live = await askLive(url, { question: x.question, place, context: contextFor(matches) });
          x.mode = 'live';
        } catch {
          x.mode = 'fallback';
        }
      } else x.mode = 'offline';
      game.bus.emit('ask:answer', { question: x.question, entry: x.answer.entry?.id ?? null, mode: x.mode as 'offline' | 'live' | 'fallback' });
      if (!disposed) drawThread();
    };

    const push = (x: Exchange) => {
      thread.unshift(x);
      thread.length = Math.min(thread.length, MAX_THREAD);
    };

    const ask = (raw: string) => {
      const question = raw.trim().slice(0, MAX_QUESTION);
      if (!question) return;
      const answer = answerOffline(question, entries, pos());
      const x: Exchange = { question, sighting: null, answer, live: null, mode: 'offline' };
      push(x);
      input.value = '';
      const matches = search(question, entries, pos()).map((m) => m.entry);
      void settle(x, matches.length ? matches : answer.related);
    };

    look.addEventListener('click', () => {
      const s = whatIsThat(entries, cameraPose(game));
      if (!s) {
        const empty = answerOffline('', []);
        push({ question: 'What is that?', sighting: null, answer: entries.length ? { ...empty, lead: 'Even an Emperor has gaps in his ledger.', quote: 'None of the places in the archive have a location yet.' } : empty, live: null, mode: 'offline' });
        drawThread();
        return;
      }
      const target = s.entry;
      const away = `${formatDistance(s.dist, imperial)} ${s.side === 'behind' ? 'behind you' : s.side === 'ahead' ? 'ahead' : `to your ${s.side}`}`;
      const answer: Answer = {
        entry: target,
        lead: s.ahead ? `That is ${target.name}.` : `Nothing I know is straight ahead. The closest is ${target.name}, ${away}.`,
        quote: bestQuote(target, ''),
        related: s.ahead ? nearest(entries, pos(), 4).filter((e) => e !== target).slice(0, 2) : [],
      };
      const x: Exchange = { question: s.ahead ? `What is ${target.name}?` : 'What is that?', sighting: s, answer, live: null, mode: 'offline' };
      push(x);
      void settle(x, [target]);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      ask(input.value);
    });

    const cfg = el('details', 'ask-config');
    const cfgSummary = el('summary', '', 'Live guide (optional)');
    const cfgHelp = el('p', '', 'Paste the URL of your deployed Cloudflare Worker to let Claude answer in the voice of Emperor Norton. Leave empty to stay offline.');
    const cfgRow = el('div', 'ask-form');
    const cfgInput = el('input', 'ask-input');
    cfgInput.type = 'url';
    cfgInput.placeholder = 'https://fly-around-sf-ask.example.workers.dev';
    cfgInput.value = String(game.save.data.settings.aiProxyUrl ?? '');
    cfgInput.setAttribute('aria-label', 'Live guide worker URL');
    const cfgSave = el('button', 'ask-send', 'Save');
    cfgSave.type = 'button';
    cfgSave.addEventListener('click', () => {
      const v = cfgInput.value.trim();
      if (v && !proxyUrl(v, undefined)) {
        game.toast('That URL must start with https://', 'warn');
        return;
      }
      game.save.data.settings.aiProxyUrl = v;
      game.save.persist();
      drawMode();
      game.toast(v ? 'Live guide on' : 'Live guide off');
    });
    cfgRow.append(cfgInput, cfgSave);
    cfg.append(cfgSummary, cfgHelp, cfgRow);

    root.append(mode, look, form, chips, list, cfg);
    drawThread();
    if (matchMedia('(pointer: fine)').matches) queueMicrotask(() => input.focus());
    return () => {
      disposed = true;
    };
  },
};
