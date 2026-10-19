import type { Game } from '../game';
import { el } from '../ui/panel-host';
import { LIMITS } from './protocol';
import { READY } from './modes';
import type { ChatLine, Net } from './session';
import './net.css';

const CHAT_VISIBLE_MS = 14000;

export class NetHud {
  readonly root: HTMLElement;
  private chip: HTMLButtonElement;
  private banner: HTMLElement;
  private feed: HTMLElement;
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private counter: HTMLElement;
  private voice: HTMLButtonElement;
  private card: HTMLElement;
  private invite: HTMLElement;
  private count: HTMLElement;
  private cache = new Map<HTMLElement, string>();
  touchTalk = false;
  private coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  constructor(
    private game: Game,
    private net: Net,
  ) {
    this.root = el('div', 'net-hud');
    this.chip = el('button', 'net-chip');
    this.chip.hidden = true;
    this.chip.addEventListener('click', () => game.panels.open('friends'));
    this.banner = el('div', 'net-banner');
    this.banner.setAttribute('role', 'status');
    this.banner.hidden = true;
    this.card = el('section', 'net-match');
    this.card.setAttribute('aria-live', 'polite');
    this.card.hidden = true;
    this.invite = el('div', 'net-invite');
    this.invite.hidden = true;
    const join = el('button', 'fr-btn primary small', 'Join');
    join.dataset.action = 'join-match';
    join.addEventListener('click', () => net.joinMatch());
    const skip = el('button', 'fr-btn ghost small', 'Not now');
    skip.dataset.action = 'skip-match';
    skip.addEventListener('click', () => net.leaveMatch());
    this.invite.append(join, skip);
    this.count = el('div', 'net-count');
    this.count.hidden = true;
    this.feed = el('ol', 'net-feed');
    this.feed.setAttribute('aria-live', 'polite');
    this.feed.setAttribute('aria-label', 'Room chat');
    this.form = el('form', 'net-chat');
    this.form.hidden = true;
    this.input = el('input');
    this.input.maxLength = LIMITS.chat;
    this.input.placeholder = 'Say something to the room';
    this.input.setAttribute('aria-label', 'Chat message');
    this.input.autocomplete = 'off';
    this.input.enterKeyHint = 'send';
    this.counter = el('small', 'net-chat-count', `0/${LIMITS.chat}`);
    this.form.append(this.input, this.counter);
    this.voice = el('button', 'net-voice');
    this.voice.hidden = true;
    this.voice.setAttribute('aria-label', 'Hold to talk');
    const hold = (on: boolean) => (e: Event) => {
      e.preventDefault();
      this.touchTalk = on;
    };
    this.voice.addEventListener('pointerdown', hold(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.voice.addEventListener(ev, hold(false));
    this.voice.addEventListener('contextmenu', (e) => e.preventDefault());
    const row = el('div', 'net-row');
    row.append(this.chip, this.voice);
    const stack = el('div', 'net-stack');
    stack.append(row, this.banner, this.card, this.invite);
    this.root.append(stack, this.count, this.feed, this.form);
    game.ui.insertBefore(this.root, game.panels.bar);

    this.input.addEventListener('input', () => (this.counter.textContent = `${[...this.input.value].length}/${LIMITS.chat}`));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeChat();
      }
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = net.sendChat(this.input.value);
      if (r === 'slow') return void this.flash('Slow down a little');
      if (r === 'offline') return void this.flash('Join a room to chat');
      this.closeChat();
    });
    game.bus.on('net:chat', (line) => this.addLine(line));
  }

  get chatOpen(): boolean {
    return !this.form.hidden;
  }

  openChat(): void {
    if (!this.net.room) {
      this.game.toast('Open Friends to start or join a room, then press Enter to chat', 'info');
      return;
    }
    this.form.hidden = false;
    this.feed.classList.add('open');
    this.game.input.held.clear();
    this.input.focus();
  }

  closeChat(): void {
    this.input.value = '';
    this.counter.textContent = `0/${LIMITS.chat}`;
    this.form.hidden = true;
    this.feed.classList.remove('open');
    this.input.blur();
  }

  private flash(text: string): void {
    this.counter.textContent = text;
    this.form.classList.remove('shake');
    void this.form.offsetWidth;
    this.form.classList.add('shake');
  }

  private addLine(line: ChatLine): void {
    const li = el('li', line.self ? 'self' : '');
    const who = el('b', '', line.name);
    who.style.color = line.color;
    li.append(who, el('span', '', line.text));
    li.dataset.at = String(Date.now());
    this.feed.append(li);
    while (this.feed.children.length > 30) this.feed.firstElementChild?.remove();
  }

  private set(node: HTMLElement, text: string): void {
    if (this.cache.get(node) === text) return;
    this.cache.set(node, text);
    node.textContent = text;
  }

  update(): void {
    const net = this.net;
    const inRoom = !!net.room;
    this.chip.hidden = !inRoom;
    if (inRoom) {
      const n = net.visiblePeers().length;
      this.chip.dataset.status = net.status;
      const state = net.status === 'online' ? `${n} ${n === 1 ? 'friend' : 'friends'}` : net.status === 'connecting' ? 'connecting' : 'offline';
      this.set(this.chip, `${net.room} · ${state}`);
      this.chip.setAttribute('aria-label', `Room ${net.room}, ${state}. Open friends`);
    }
    this.banner.hidden = !(inRoom && net.status === 'unreachable');
    if (!this.banner.hidden) this.set(this.banner, 'Cannot reach the matchmaking relays. Still retrying. Single player keeps working.');

    const now = Date.now();
    for (const li of this.feed.children as HTMLCollectionOf<HTMLElement>) li.classList.toggle('old', now - Number(li.dataset.at) > CHAT_VISIBLE_MS);
    this.feed.hidden = !this.feed.children.length;

    const v = net.voice;
    this.voice.hidden = !v.on;
    if (v.on) {
      this.voice.classList.toggle('live', v.transmitting);
      this.set(this.voice, v.mode === 'open' ? '🎙 Open mic' : v.transmitting ? '🎙 Talking' : this.coarse ? '🎙 Hold to talk' : '🎙 Hold T to talk');
    }

    const m = net.match;
    this.card.hidden = !m;
    this.invite.hidden = !m?.invited;
    this.count.hidden = !m?.playing || m.phase !== 'countdown' || m.countdown > READY;
    if (!m) return;
    if (m.phase === 'countdown') this.set(this.count, String(Math.ceil(m.countdown)));
    this.card.dataset.phase = m.phase;
    const rows = (m.results ?? m.standings()).slice(0, 6);
    const secs = Math.ceil(m.remaining);
    const key = `${m.phase}|${secs}|${m.hint()}|${rows.map((r) => `${r.id}:${r.label}`).join(',')}`;
    if (this.cache.get(this.card) === key) return;
    this.cache.set(this.card, key);
    const head = el('header');
    head.append(el('b', '', `${m.info.icon} ${m.info.title}`), el('span', 'net-match-time', m.phase === 'done' ? 'Final' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`));
    const list = el('ol');
    rows.forEach((r, i) => {
      const li = el('li', r.self ? 'self' : '');
      const dot = el('i', 'net-tag-dot');
      dot.style.background = r.color;
      li.append(el('span', 'rank', String(i + 1)), dot, el('b', '', r.name), el('span', 'label', m.phase === 'countdown' ? (r.id === m.host ? 'host' : 'in') : r.label));
      list.append(li);
    });
    this.card.replaceChildren(head, el('p', 'net-match-hint', m.hint()), list);
  }
}
