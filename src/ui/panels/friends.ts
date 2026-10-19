import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import type { Game } from '../../game';
import { cleanText, LIMITS, MODE_IDS, normalizeCode, type ModeId } from '../../net/protocol';
import { MODES } from '../../net/modes';
import { fmt } from '../../net/view';
import type { VoiceResult } from '../../net/voice';
import type { SyncPhase } from '../../net/sync';
import './friends.css';

const SWATCHES = ['#f2f2ee', '#ff6a3d', '#ffc15e', '#7de0a6', '#5ec8ff', '#9b8cff', '#ff7eb6', '#ff4d5e'];

const VOICE_ERRORS: Record<Exclude<VoiceResult, 'on'>, string> = {
  denied: 'Microphone blocked. Allow it from the icon in the address bar, then try again.',
  missing: 'No microphone found. Plug one in or pick one in your system settings.',
  unsupported: 'This browser cannot capture audio here. Voice needs a secure (https) page.',
  failed: 'The microphone could not start. Another app may be using it.',
};

const SYNC_TEXT: Record<SyncPhase, string> = {
  idle: '',
  waiting: 'Waiting for your other device. Keep this open.',
  sending: 'Found it. Sending your progress...',
  sent: 'Delivered. Your other device merged it.',
  receiving: 'Looking for your other device...',
  merged: '',
  'bad-code': 'That code does not look right. Codes are 6 letters and numbers.',
  failed: 'Could not reach the other device. Check both are online and try again.',
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `fr-btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function card(title: string, cls = ''): { box: HTMLElement; body: HTMLElement } {
  const box = el('section', `fr-card ${cls}`.trim());
  box.append(el('h3', '', title));
  const body = el('div', 'fr-card-body');
  box.append(body);
  return { box, body };
}

function codeInput(placeholder: string, label: string): HTMLInputElement {
  const i = el('input', 'fr-code-input');
  i.placeholder = placeholder;
  i.maxLength = 9;
  i.autocomplete = 'off';
  i.spellcheck = false;
  i.setAttribute('autocapitalize', 'characters');
  i.setAttribute('aria-label', label);
  i.addEventListener('input', () => (i.value = i.value.toUpperCase()));
  return i;
}

function renderYou(game: Game): HTMLElement {
  const { box, body } = card('You', 'fr-you');
  const s = game.save.data.settings;
  const name = el('input', 'fr-name');
  name.value = game.net.name;
  name.maxLength = LIMITS.name;
  name.setAttribute('aria-label', 'Pilot name');
  name.addEventListener('change', () => {
    const v = cleanText(name.value, LIMITS.name);
    if (!v) return void (name.value = game.net.name);
    s.playerName = v;
    name.value = v;
    game.save.persist();
  });
  const swatches = el('div', 'fr-swatches');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', 'Drone color');
  const paint = () => {
    for (const b of swatches.children as HTMLCollectionOf<HTMLElement>) b.setAttribute('aria-pressed', String(b.dataset.color === game.net.color));
  };
  for (const c of SWATCHES) {
    const b = button('', 'fr-swatch', () => {
      s.droneColor = c;
      game.save.persist();
      paint();
    });
    b.dataset.color = c;
    b.style.background = c;
    b.setAttribute('aria-label', `Drone color ${c}`);
    swatches.append(b);
  }
  paint();
  const label = el('label', 'fr-field');
  label.append(el('span', '', 'Name friends see'), name);
  body.append(label, swatches);
  return box;
}

function renderRoom(game: Game, area: HTMLElement): () => void {
  const net = game.net;
  const { box, body } = card('Room', 'fr-room');
  area.append(box);
  const offline = el('div', 'fr-offline');
  const intro = el('p', 'fr-lede', 'Start a room and send the link. Friends who open it fly in the same San Francisco: you see each other’s drones with name tags, chat, drop pings and talk with proximity voice.');
  const start = button('Start a room', 'primary', async () => {
    start.disabled = true;
    await net.create();
    start.disabled = false;
  });
  const joinRow = el('form', 'fr-row');
  const code = codeInput('ROOM CODE', 'Room code');
  const err = el('p', 'fr-error');
  err.setAttribute('role', 'alert');
  const join = el('button', 'fr-btn', 'Join');
  join.type = 'submit';
  joinRow.append(code, join);
  joinRow.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = normalizeCode(code.value);
    err.textContent = c ? '' : 'Room codes are 4 to 8 letters and numbers.';
    if (c) await net.join(c);
  });
  offline.append(intro, start, el('p', 'fr-or', 'or join a friend'), joinRow, err);

  const online = el('div', 'fr-online');
  const codeBig = el('div', 'fr-roomcode');
  codeBig.setAttribute('aria-label', 'Room code');
  const status = el('p', 'fr-status');
  status.setAttribute('role', 'status');
  const feedback = el('span', 'fr-feedback');
  feedback.setAttribute('aria-live', 'polite');
  const say = (t: string) => {
    feedback.textContent = t;
    setTimeout(() => feedback.textContent === t && (feedback.textContent = ''), 2500);
  };
  const share = button('Share link', 'primary', async () => {
    const r = await net.share();
    say(r === 'shared' ? 'Shared' : r === 'copied' ? 'Link copied' : 'Copy the link below');
    if (r === 'manual') link.select();
  });
  share.dataset.action = 'share';
  const copy = button('Copy link', '', async () => say((await net.copy()) === 'copied' ? 'Link copied' : 'Copy the link below'));
  copy.dataset.action = 'copy';
  const leave = button('Leave', 'ghost', () => net.leave());
  const actions = el('div', 'fr-actions');
  actions.append(share, copy, leave, feedback);
  const link = el('input', 'fr-link');
  link.readOnly = true;
  link.setAttribute('aria-label', 'Share link');
  link.addEventListener('focus', () => link.select());
  const peers = el('ul', 'fr-peers');
  online.append(codeBig, actions, link, status, peers);
  const metas = new Map<string, HTMLElement>();
  let lastKey: string | null = null;
  body.append(offline, online);

  const draw = () => {
    const inRoom = !!net.room;
    offline.hidden = inRoom;
    online.hidden = !inRoom;
    if (!inRoom) return;
    codeBig.textContent = net.room as string;
    link.value = net.shareUrl() ?? '';
    status.dataset.status = net.status;
    const relays = net.transport?.relays() ?? 0;
    status.textContent =
      net.status === 'online'
        ? net.kind === 'local'
          ? 'Connected over this browser’s local test channel.'
          : `Connected through ${relays} public relay${relays === 1 ? '' : 's'}. Voice and data go peer to peer.`
        : net.status === 'connecting'
          ? 'Finding the room through public relays...'
          : 'Cannot reach the matchmaking relays. Check your connection; we keep retrying. Single player still works.';
    const me = game.flight.pos;
    const imperial = game.save.data.settings.units === 'imperial';
    const rows = [...net.peers.values()].filter((p) => p.known);
    const key = rows.map((p) => `${p.id}|${p.name}|${p.color}|${p.muted}|${p.blocked}`).join(',');
    if (key !== lastKey) {
      lastKey = key;
      metas.clear();
      peers.replaceChildren();
      if (!rows.length) peers.append(el('li', 'fr-empty', 'Nobody else is here yet. Share the link: whoever opens it lands in this room.'));
      for (const p of rows) {
        const li = el('li', 'fr-peer');
        li.dataset.peer = p.id;
        li.classList.toggle('blocked', p.blocked);
        const dot = el('i', 'fr-dot');
        dot.style.background = p.color;
        const who = el('div', 'fr-who');
        const meta = el('small');
        metas.set(p.id, meta);
        who.append(el('b', '', p.name), meta);
        const go = button('Fly to', 'small', () => {
          game.waypoint = { ...p.pos, label: p.name };
          game.panels.close();
        });
        go.disabled = p.blocked;
        const mute = button(p.muted ? 'Unmute' : 'Mute', 'small', () => net.setMuted(p.id, !p.muted));
        mute.setAttribute('aria-pressed', String(p.muted));
        mute.dataset.action = 'mute';
        const block = button(p.blocked ? 'Unblock' : 'Block', 'small ghost', () => net.setBlocked(p.id, !p.blocked));
        block.dataset.action = 'block';
        li.append(dot, who, go, mute, block);
        peers.append(li);
      }
    }
    for (const p of rows) {
      const d = Math.hypot(p.pos.x - me.x, p.pos.y - me.y, p.pos.z - me.z);
      const text = p.blocked ? 'blocked' : `${fmt(d, imperial)} away${p.mic === 2 ? ' · talking' : p.mic === 1 ? ' · mic on' : ''}`;
      const meta = metas.get(p.id);
      if (meta && meta.textContent !== text) meta.textContent = text;
    }
  };
  return draw;
}

function renderVoice(game: Game, area: HTMLElement): () => void {
  const net = game.net;
  const { box, body } = card('Proximity voice', 'fr-voice');
  area.append(box);
  const intro = el('p', 'fr-lede', 'Friends sound louder the closer their drone is and come from where they fly. Audio goes straight between browsers, never through a server.');
  const msg = el('p', 'fr-error');
  msg.setAttribute('role', 'alert');
  const on = button('Turn on microphone', 'primary', async () => {
    on.disabled = true;
    msg.textContent = 'Your browser will ask for the microphone.';
    const r = await net.enableVoice();
    on.disabled = false;
    msg.textContent = r === 'on' ? '' : VOICE_ERRORS[r];
  });
  on.dataset.action = 'voice-on';
  const controls = el('div', 'fr-voice-on');
  const seg = el('div', 'fr-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Microphone mode');
  const ptt = button('Push to talk (hold T)', '', () => net.voice.setMode('ptt'));
  const open = button('Open mic', '', () => net.voice.setMode('open'));
  seg.append(ptt, open);
  const s = game.save.data.settings;
  const vol = el('input', 'fr-range');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.05';
  vol.value = String(typeof s.volVoice === 'number' ? s.volVoice : 1);
  vol.setAttribute('aria-label', 'Voice volume');
  vol.addEventListener('input', () => {
    s.volVoice = Number(vol.value);
    game.save.persist();
  });
  const volLabel = el('label', 'fr-field');
  volLabel.append(el('span', '', 'Voice volume'), vol);
  const off = button('Turn off microphone', 'ghost', () => net.disableVoice());
  controls.append(seg, volLabel, off);
  body.append(intro, on, controls, msg);
  return () => {
    on.hidden = net.voice.on;
    controls.hidden = !net.voice.on;
    ptt.setAttribute('aria-pressed', String(net.voice.mode === 'ptt'));
    open.setAttribute('aria-pressed', String(net.voice.mode === 'open'));
  };
}

function renderModes(game: Game, area: HTMLElement): () => void {
  const net = game.net;
  const { box, body } = card('Party modes', 'fr-modes');
  area.append(box);
  const note = el('p', 'fr-note');
  const grid = el('div', 'fr-mode-grid');
  const starts: HTMLButtonElement[] = [];
  const races = net.raceOptions();
  for (const id of MODE_IDS as readonly ModeId[]) {
    const info = MODES[id];
    const tile = el('article', 'fr-mode');
    tile.dataset.mode = id;
    const head = el('header');
    head.append(el('span', 'fr-mode-icon', info.icon), el('b', '', info.title), el('small', '', `${Math.round(info.duration / 60)} min`));
    tile.append(head, el('p', '', info.blurb));
    let pick: HTMLSelectElement | null = null;
    if (id === 'race') {
      pick = el('select', 'fr-select');
      pick.setAttribute('aria-label', 'Ring run for the race');
      for (const r of races) {
        const o = el('option', '', `${r.title} · ${r.neighborhood}`);
        o.value = r.id;
        pick.append(o);
      }
      tile.append(pick);
    }
    const go = button('Start', 'primary small', () => {
      if (!net.startMatch(id, pick ? { activity: pick.value } : {})) game.toast('Could not start: you need at least one friend in the room', 'warn');
    });
    go.dataset.action = `start-${id}`;
    if (id === 'race' && !races.length) go.disabled = true;
    starts.push(go);
    tile.append(go);
    grid.append(tile);
  }
  const cancel = button('End match for everyone', 'ghost', () => net.cancelMatch());
  body.append(note, grid, cancel);
  return () => {
    const friends = net.visiblePeers().length;
    const busy = !!net.match && net.match.phase !== 'done';
    note.textContent = busy ? `${net.match?.info.title} in progress.` : friends ? `Starts for you and ${friends} ${friends === 1 ? 'friend' : 'friends'} after a 3 second countdown.` : 'Needs at least one friend in the room.';
    for (const b of starts) b.disabled = busy || !friends || (b.dataset.action === 'start-race' && !races.length);
    cancel.hidden = !busy || net.match?.host !== net.selfId;
  };
}

function renderChat(game: Game, area: HTMLElement): () => void {
  const net = game.net;
  const { box, body } = card('Room chat', 'fr-chat');
  area.append(box);
  const log = el('ol', 'fr-log');
  log.setAttribute('aria-live', 'polite');
  const form = el('form', 'fr-row');
  const input = el('input', 'fr-chat-input');
  input.maxLength = LIMITS.chat;
  input.placeholder = `Message (${LIMITS.chat} characters max)`;
  input.setAttribute('aria-label', 'Chat message');
  input.autocomplete = 'off';
  const send = el('button', 'fr-btn', 'Send');
  send.type = 'submit';
  form.append(input, send);
  const err = el('p', 'fr-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = net.sendChat(input.value);
    err.textContent = r === 'slow' ? 'Slow down a little.' : r === 'offline' ? 'Join a room first.' : '';
    if (r === 'ok') input.value = '';
  });
  body.append(log, form, err);
  let shown: unknown = null;
  return () => {
    const last = net.chat[net.chat.length - 1] ?? null;
    if (shown === last && log.childElementCount) return;
    shown = last;
    log.replaceChildren();
    if (!net.chat.length) log.append(el('li', 'fr-empty', 'No messages yet. Press Enter while flying to chat.'));
    for (const line of net.chat.slice(-30)) {
      const li = el('li', line.self ? 'self' : '');
      const who = el('b', '', line.name);
      who.style.color = line.color;
      li.append(who, el('span', '', line.text));
      log.append(li);
    }
    log.scrollTop = log.scrollHeight;
  };
}

function renderSync(game: Game): { box: HTMLElement; draw: () => void } {
  const sync = game.net.sync;
  const { box, body } = card('Move my progress', 'fr-sync');
  const intro = el('p', 'fr-lede', 'Carry your completions, cards and XP to another phone, tablet or computer. Both devices talk directly and the other one merges everything: nothing is lost on either side.');
  const send = button('Send from this device', 'primary', () => void sync.offer());
  send.dataset.action = 'sync-send';
  const codeBox = el('div', 'fr-sync-code');
  const big = el('div', 'fr-roomcode');
  codeBox.append(big, el('p', 'fr-note', 'On the other device open Friends, then Move my progress, and enter this code.'));
  const form = el('form', 'fr-row');
  const input = codeInput('CODE', 'Progress code');
  const recv = el('button', 'fr-btn', 'Receive');
  recv.type = 'submit';
  form.append(input, recv);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void sync.receive(input.value);
  });
  const status = el('p', 'fr-status');
  status.setAttribute('role', 'status');
  const cancel = button('Cancel', 'ghost small', () => sync.stop());
  body.append(intro, send, codeBox, el('p', 'fr-or', 'or receive here'), form, status, cancel);
  const draw = () => {
    const offering = sync.phase === 'waiting' || sync.phase === 'sending' || sync.phase === 'sent';
    codeBox.hidden = !offering;
    big.textContent = offering ? (sync.code ?? '') : '';
    status.dataset.status = sync.phase;
    status.textContent = sync.phase === 'merged' && sync.result ? `Merged: ${plural(sync.result.added, 'new activity', 'new activities')} and ${plural(sync.result.cards, 'new card', 'new cards')}.` : SYNC_TEXT[sync.phase];
    cancel.hidden = sync.phase === 'idle';
  };
  return { box, draw };
}

export const panel: Panel = {
  id: 'friends',
  title: 'Friends',
  icon: '👥',
  order: 40,
  render(root, game) {
    root.classList.add('friends');
    const main = el('div', 'fr-main');
    const side = el('div', 'fr-side');
    main.append(renderYou(game));
    const drawRoom = renderRoom(game, main);
    const roomOnly = el('div', 'fr-room-only');
    const drawModes = renderModes(game, roomOnly);
    const drawVoice = renderVoice(game, roomOnly);
    const drawChat = renderChat(game, roomOnly);
    side.append(roomOnly);
    const sync = renderSync(game);
    main.append(sync.box);
    root.append(main, side);
    const draw = () => {
      drawRoom();
      roomOnly.hidden = !game.net.room;
      side.hidden = !game.net.room;
      root.classList.toggle('in-room', !!game.net.room);
      if (!game.net.room) return;
      drawModes();
      drawVoice();
      drawChat();
    };
    draw();
    sync.draw();
    const off = [game.net.subscribe(draw), game.net.sync.subscribe(sync.draw)];
    const timer = setInterval(draw, 1000);
    return () => {
      clearInterval(timer);
      off.forEach((f) => f());
    };
  },
};
