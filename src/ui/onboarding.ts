import type { Game } from '../game';
import { el } from './panel-host';
import { FLAG, OnboardingTracker, STEPS, firstActivity } from './onboarding-steps';
import { setWaypoint } from './waypoint';
import { isTouchDevice } from './touch';

let current: { update(): void; stop(finished: boolean): void } | null = null;

export const onboardingWidget = { update: () => current?.update() };

export function startOnboarding(game: Game): void {
  current?.stop(false);
  const tracker = new OnboardingTracker(game);
  const touch = isTouchDevice();
  const card = el('section', 'onboard');
  card.setAttribute('aria-label', 'Flight tutorial');
  card.setAttribute('aria-live', 'polite');
  const top = el('div', 'onboard-top');
  const count = el('small', 'onboard-count');
  const skip = el('button', 'onboard-skip', 'Skip tutorial');
  top.append(count, skip);
  const title = el('strong', 'onboard-title');
  const hint = el('p', 'onboard-hint');
  const dots = el('div', 'onboard-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < STEPS.length; i++) dots.append(el('i'));
  card.append(top, title, hint, dots);
  game.hud.root.append(card);

  const show = () => {
    const s = STEPS[tracker.step];
    card.dataset.step = s.id;
    count.textContent = `Step ${tracker.step + 1} of ${STEPS.length}`;
    title.textContent = s.title;
    hint.innerHTML = touch ? s.touch : s.keys;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i <= tracker.step));
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
    if (s.id === 'activity' && !game.waypoint) {
      const d = firstActivity(game);
      if (d) setWaypoint(game, game.activities.position(d), d.title);
    }
  };
  const stop = (finished: boolean) => {
    tracker.dispose();
    game.save.data.flags[FLAG] = true;
    game.save.persist();
    current = null;
    if (finished) {
      card.dataset.step = 'done';
      count.textContent = 'Tutorial complete';
      title.textContent = 'You are cleared for takeoff';
      hint.textContent = 'Open the map with M to find everything else. Have fun out there.';
      skip.remove();
      setTimeout(() => card.classList.add('out'), 3800);
      setTimeout(() => card.remove(), 4400);
    } else card.remove();
  };
  skip.addEventListener('click', () => stop(false));
  show();
  let wait = 0;
  current = {
    update() {
      if (wait && performance.now() < wait) return;
      if (wait) {
        wait = 0;
        card.classList.remove('ok');
        if (tracker.done) return stop(true);
        show();
        return;
      }
      if (tracker.update()) {
        card.classList.add('ok');
        wait = performance.now() + 650;
      }
    },
    stop,
  };
}
