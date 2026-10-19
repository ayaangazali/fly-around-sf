import './settings.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import { DRONE_COLORS, setSetting, settingsOf, type QualitySetting, type Settings, type SettingKey, type TimeMode } from '../settings-model';
import { row, section, segmented, slider, toggle } from '../controls';
import { startOnboarding } from '../onboarding';
import { installButton } from '../pwa';
import { emptySave } from '../../core/save';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const panel: Panel = {
  id: 'settings',
  title: 'Settings',
  icon: '⚙️',
  order: 90,
  render(root, game) {
    const s = settingsOf(game);
    const set = <K extends SettingKey>(k: K, v: Settings[K]) => setSetting(game, k, v);
    const initialQuality = s.quality;
    const reload = el('button', 'btn small', 'Reload now');
    reload.hidden = true;
    reload.addEventListener('click', () => location.reload());

    const name = el('input', 'set-text');
    name.maxLength = 20;
    name.value = s.playerName;
    name.setAttribute('autocomplete', 'nickname');
    name.addEventListener('change', () => (name.value = set('playerName', name.value)));

    const colors = el('div', 'swatches');
    colors.setAttribute('role', 'radiogroup');
    const swatch = (c: string) => {
      const b = el('button', 'swatch');
      b.style.setProperty('--c', c);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Drone color ${c}`);
      b.setAttribute('aria-checked', String(c === s.droneColor));
      b.addEventListener('click', () => {
        set('droneColor', c);
        for (const o of colors.querySelectorAll('.swatch')) o.setAttribute('aria-checked', String(o === b));
      });
      return b;
    };
    colors.append(...DRONE_COLORS.map(swatch));
    const custom = el('input', 'swatch-custom');
    custom.type = 'color';
    custom.value = s.droneColor;
    custom.setAttribute('aria-label', 'Custom drone color');
    custom.addEventListener('input', () => {
      set('droneColor', custom.value);
      for (const o of colors.querySelectorAll('.swatch')) o.setAttribute('aria-checked', 'false');
    });
    colors.append(custom);

    const proxy = el('input', 'set-text');
    proxy.type = 'url';
    proxy.placeholder = 'https://your-worker.example.workers.dev';
    proxy.value = s.aiProxyUrl;
    const proxyNote = el('small', 'set-note');
    proxy.addEventListener('change', () => {
      try {
        proxy.value = set('aiProxyUrl', proxy.value.trim());
        proxyNote.textContent = proxy.value ? 'Saved. Ask the City will use live answers.' : 'Cleared. Ask the City uses its built-in lore.';
      } catch (e) {
        proxyNote.textContent = (e as Error).message;
      }
    });
    const proxyWrap = el('div', 'set-stack');
    proxyWrap.append(proxy, proxyNote);

    const tutorial = el('button', 'btn', 'Replay tutorial');
    tutorial.addEventListener('click', () => {
      game.panels.close();
      startOnboarding(game);
    });
    const wipe = el('button', 'btn danger', 'Reset progress');
    wipe.addEventListener('click', () => {
      if (wipe.dataset.confirm !== '1') {
        wipe.dataset.confirm = '1';
        wipe.textContent = 'Tap again to erase everything';
        return;
      }
      const keep = game.save.data.settings;
      game.save.replace({ ...emptySave(), settings: keep, flags: { onboarded: true } });
      game.activities.stop();
      game.toast('Progress reset. Fresh skies.', 'warn');
      game.panels.close();
    });
    const data = el('div', 'set-actions');
    data.append(tutorial, wipe);
    const install = installButton();
    if (install) data.prepend(install);

    root.classList.add('settings-body');
    root.append(
      section(
        'Pilot',
        row('Pilot name', name, 'Shown to friends in multiplayer'),
        row('Drone color', colors),
      ),
      section(
        'Graphics',
        row('Quality', segmented<QualitySetting>([['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality, (v) => {
          set('quality', v);
          reload.hidden = v === initialQuality;
        }), 'Applies after a reload'),
        reload,
        row('Reduce motion', toggle(s.reducedMotion, (v) => set('reducedMotion', v)), 'Calmer camera, no shake or speed lines'),
        row('Show FPS', toggle(s.showFps, (v) => set('showFps', v))),
        row('Minimap', toggle(s.minimap, (v) => set('minimap', v))),
      ),
      section(
        'Controls',
        row('Turn speed', slider(0.5, 1.5, 0.05, s.turnSpeed, (v) => `${v.toFixed(2)}x`, (v) => set('turnSpeed', v))),
        row('Units', segmented<'metric' | 'imperial'>([['metric', 'Metric'], ['imperial', 'Imperial']], s.units, (v) => set('units', v))),
      ),
      section(
        'Sound',
        row('Mute everything', toggle(s.muted, (v) => set('muted', v))),
        row('Master', slider(0, 1, 0.05, s.volMaster, pct, (v) => set('volMaster', v))),
        row('Music', slider(0, 1, 0.05, s.volMusic, pct, (v) => set('volMusic', v))),
        row('Effects', slider(0, 1, 0.05, s.volSfx, pct, (v) => set('volSfx', v))),
        row('Voice chat', slider(0, 1, 0.05, s.volVoice, pct, (v) => set('volVoice', v))),
      ),
      section(
        'Time of day',
        row('Sky', segmented<TimeMode>([['real', 'Live SF'], ['golden', 'Golden hour'], ['noon', 'Noon'], ['night', 'Night']], s.timeMode, (v) => set('timeMode', v)), 'Live SF follows the real clock in San Francisco'),
      ),
      section('Ask the City', row('AI proxy URL', proxyWrap, 'Optional. Leave empty for offline lore')),
      section('Data', data),
    );
  },
};
