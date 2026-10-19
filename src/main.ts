import './ui/styles.css';
import { Game, parseOptions } from './game';
import { installTestApi } from './test-api';

const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

const opts = parseOptions(location.search, import.meta.env.BASE_URL);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;
const bar = document.getElementById('loading-bar') as HTMLElement;
const label = document.getElementById('loading-label') as HTMLElement;
const flyBtn = document.getElementById('fly-btn') as HTMLButtonElement;
const errorBox = document.getElementById('loading-error') as HTMLElement;

const game = new Game(canvas, ui, opts);
const api = opts.test ? installTestApi(game, errors) : null;

game
  .load((frac, text) => {
    bar.style.width = `${Math.round(frac * 100)}%`;
    label.textContent = text;
  })
  .then(() => {
    game.start();
    if (api) {
      loading.remove();
      api.ready = true;
      return;
    }
    label.textContent = game.save.data.stats.sessions > 1 ? 'Welcome back' : 'Ready when you are';
    flyBtn.hidden = false;
    flyBtn.focus();
    flyBtn.addEventListener('click', () => {
      loading.classList.add('out');
      setTimeout(() => loading.remove(), 700);
      game.bus.emit('toast', { text: 'W/S fly · A/D turn · Space/Shift up/down · Esc menu', kind: 'info' });
    });
  })
  .catch((e: unknown) => {
    errorBox.textContent = `Could not load: ${e instanceof Error ? e.message : String(e)}`;
    errors.push(String(e));
  });

if ('serviceWorker' in navigator && import.meta.env.PROD && !opts.test) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}
