import type { Game } from '../game';
import { FLIGHT } from '../player/flight';
import { el } from './panel-host';
import { settingsOf } from './settings-model';

export function installEffects(game: Game): { update(): void } {
  const crash = el('div', 'fx fx-crash');
  const splash = el('div', 'fx fx-splash');
  const speed = el('div', 'fx fx-speed');
  const low = el('div', 'fx fx-low');
  const fps = el('div', 'hud-fps');
  fps.hidden = true;
  fps.setAttribute('aria-hidden', 'true');
  game.hud.root.prepend(crash, splash, speed, low);
  game.hud.root.append(fps);

  const replay = (node: HTMLElement, strength: number) => {
    node.style.setProperty('--strength', strength.toFixed(2));
    node.classList.remove('on');
    void node.offsetWidth;
    node.classList.add('on');
  };
  game.bus.on('player:crash', ({ speed: s }) => {
    replay(crash, Math.min(1, 0.35 + s / 40));
    if (!settingsOf(game).reducedMotion) {
      game.canvas.classList.remove('shake');
      void game.canvas.offsetWidth;
      game.canvas.classList.add('shake');
    }
  });
  game.bus.on('player:splash', () => replay(splash, 1));

  let frames = 0;
  let since = performance.now();
  let shown = 0;
  return {
    update() {
      const s = settingsOf(game);
      const f = game.flight;
      const hs = Math.hypot(f.vel.x, f.vel.z);
      const k = Math.max(0, Math.min(1, (hs - FLIGHT.cruise * 0.9) / (FLIGHT.boost - FLIGHT.cruise)));
      speed.style.opacity = s.reducedMotion ? '0' : (k * 0.9).toFixed(2);
      low.classList.toggle('on', f.battery < 0.15);
      fps.hidden = !s.showFps;
      frames++;
      const now = performance.now();
      if (now - since >= 500) {
        shown = (frames * 1000) / (now - since);
        frames = 0;
        since = now;
        if (s.showFps) {
          fps.textContent = `${shown.toFixed(0)} FPS`;
          fps.classList.toggle('slow', shown < 30);
        }
      }
    },
  };
}
