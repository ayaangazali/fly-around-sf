import '../../audio/audio.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import { system } from '../../systems/audio';
import { PLACED, spotPoint, spotStatus } from '../../audio/ambience';
import { closestOnLines, readMix } from '../../audio/mix';
import { MOODS } from '../../audio/music';

const SLIDERS = [
  ['volMaster', 'Master'],
  ['volMusic', 'Music'],
  ['volSfx', 'Effects and ambience'],
  ['volVoice', 'Voice chat'],
] as const;

export const panel: Panel = {
  id: 'sound',
  title: 'Sound',
  icon: '🔊',
  order: 75,
  render(root, game) {
    const audio = system.audio;
    const settings = game.save.data.settings;

    const now = el('div', 'snd-now');
    const eq = el('div', 'snd-eq');
    eq.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) eq.append(el('i'));
    const info = el('div', 'snd-info');
    const mood = el('strong');
    const chord = el('span');
    info.append(mood, chord);
    const mute = el('button', 'snd-mute');
    mute.addEventListener('click', () => audio?.toggleMute());
    now.append(eq, info, mute);

    const mixer = el('div', 'snd-mixer');
    for (const [key, label] of SLIDERS) {
      const row = el('label', 'snd-slider');
      const name = el('span', '', label);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.dataset.key = key;
      const value = el('output');
      const show = () => {
        const v = Math.round(readMix(settings)[key] * 100);
        input.value = String(v);
        input.style.setProperty('--v', `${v}%`);
        value.textContent = `${v}%`;
      };
      input.addEventListener('input', () => {
        settings[key] = Number(input.value) / 100;
        game.save.persist();
        show();
      });
      show();
      row.append(name, input, value);
      mixer.append(row);
    }

    const head = el('div', 'snd-head');
    head.append(el('h3', '', 'Sound spots'), el('p', '', 'Real sounds at their real places. Fly close and listen.'));
    const list = el('ul', 'snd-spots');
    const chips = new Map<string, HTMLElement>();
    const here = game.flight.pos;
    const sorted = [...PLACED].sort((a, b) => closestOnLines(a.local, here.x, here.z).d - closestOnLines(b.local, here.x, here.z).d);
    for (const spot of sorted) {
      const li = el('li', 'snd-spot');
      li.dataset.spot = spot.id;
      const icon = el('span', 'snd-icon', spot.icon);
      icon.setAttribute('aria-hidden', 'true');
      const body = el('div', 'snd-body');
      const title = el('div', 'snd-title');
      const chip = el('span', 'snd-chip');
      chips.set(spot.id, chip);
      title.append(el('strong', '', spot.name), chip);
      const links = el('div', 'snd-links');
      const seen = new Map<string, number>();
      spot.sources.forEach((url) => {
        const host = new URL(url).hostname.replace(/^www\./, '');
        const n = (seen.get(host) ?? 0) + 1;
        seen.set(host, n);
        const a = el('a', '', n > 1 ? `${host} (${n})` : host);
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        links.append(a);
      });
      const go = el('button', 'snd-go', 'Go there');
      go.addEventListener('click', () => {
        const p = game.flight.pos;
        const c = closestOnLines(spot.local, p.x, p.z);
        game.waypoint = { x: c.x, y: Math.max(0, game.world.groundAt(c.x, c.z)) + spot.alt + 30, z: c.z, label: spot.name };
        game.toast(`Waypoint set: ${spot.name}`, 'info');
        game.panels.close();
      });
      links.append(go);
      body.append(title, el('p', 'snd-hear', spot.hear), el('p', 'snd-fact', spot.fact), links);
      li.append(icon, body);
      list.append(li);
    }

    const keys = el('p', 'snd-hint');
    keys.append('Press ', el('kbd', '', 'N'), ' anywhere to mute or unmute.');
    root.append(now, mixer, head, list, keys);

    const refresh = () => {
      const running = audio?.graph?.ctx.state === 'running';
      const muted = audio?.engine.muted ?? readMix(settings).muted;
      const m = MOODS[audio?.mood() ?? 'day'];
      mood.textContent = !audio?.graph ? 'Sound starts with your first click or key press' : muted ? 'Muted' : `${m.label}, ${m.bpm} BPM`;
      chord.textContent = running && !muted && audio?.music ? `Now playing ${audio.music.chord.name}` : 'Generated live, never the same twice';
      eq.classList.toggle('on', running && !muted);
      mute.textContent = muted ? '🔇  Unmute' : '🔊  Mute';
      mute.setAttribute('aria-pressed', String(muted));
      const c = audio?.conditions() ?? { fog: game.sky?.fogDensity ?? 1, night: game.sky?.night ?? 0, hour: 12 };
      const off = muted ? 'sound is off' : running ? '' : 'click to start sound';
      const groundAt = (x: number, z: number) => game.world.groundAt(x, z);
      for (const spot of PLACED) {
        const playing = !off && !!audio?.ambience?.live.has(spot.id);
        const chip = chips.get(spot.id) as HTMLElement;
        chip.textContent = spotStatus(spot, c, spotPoint(spot, game.flight.pos, groundAt).d, playing, off);
        chip.classList.toggle('live', playing);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 500);
    const off = game.save.onChange(refresh);
    return () => {
      window.clearInterval(timer);
      off();
    };
  },
};
