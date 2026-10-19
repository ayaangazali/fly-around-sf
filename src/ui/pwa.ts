import { el } from './panel-host';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const buttons = new Set<HTMLButtonElement>();

export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    for (const b of buttons) b.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const b of buttons) b.hidden = true;
  });
}

export function installButton(cls = 'btn'): HTMLButtonElement {
  const b = el('button', `${cls} install-btn`, '⤓ Install app');
  b.hidden = !deferred;
  b.addEventListener('click', async () => {
    if (!deferred) return;
    const p = deferred;
    deferred = null;
    await p.prompt();
    await p.userChoice;
    for (const x of buttons) x.hidden = true;
  });
  buttons.add(b);
  return b;
}

export function registerServiceWorker(base: string): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(`${base}sw.js`)
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const urls = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((u) => u.startsWith(location.origin) && !u.includes('/data/'));
      reg.active?.postMessage({ type: 'cache', urls: [location.href.split('?')[0], ...urls] });
    })
    .catch(() => undefined);
}
