import './ui/styles.css';
import { Game, parseOptions } from './game';
import { installTestApi } from './test-api';
import { SaveStore } from './core/save';
import { mountTitle } from './ui/title';
import { beginFlight, installUi, savedQuality } from './ui';
import { registerServiceWorker } from './ui/pwa';

const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

const opts = parseOptions(location.search, import.meta.env.BASE_URL);
savedQuality(opts, location.search, new SaveStore().data.settings.quality);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const title = mountTitle(document.getElementById('loading') as HTMLElement, opts.room);

const game = new Game(canvas, ui, opts);
const api = opts.test ? installTestApi(game, errors) : null;

game
  .load((frac, text) => title.progress(frac, text))
  .then(() => {
    game.start();
    installUi(game);
    if (import.meta.env.PROD && !opts.test) registerServiceWorker(import.meta.env.BASE_URL);
    if (api) api.ready = true;
    if (api && !new URLSearchParams(location.search).has('title')) return title.remove();
    title.ready(game, () => beginFlight(game));
  })
  .catch((e: unknown) => {
    title.fail(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    errors.push(String(e));
  });
