import './ui.css';
import type { Game } from '../game';
import { applySettings, osReducedMotion, randomPilotName, type QualitySetting } from './settings-model';
import { installWaypoint } from './waypoint';
import { installEffects } from './effects';
import { installMinimap } from './minimap';
import { prepareBaseMap } from './map-base';
import { installCompassPips } from './nearby';
import { installTouch } from './touch';
import { installCardReveal } from './card-reveal';
import { installAchievementBanner } from './achievement-banner';
import { onboardingWidget, startOnboarding } from './onboarding';
import { FLAG } from './onboarding-steps';
import type { GameOptions } from '../game';

export function savedQuality(opts: GameOptions, search: string, saved: unknown): void {
  const q = saved as QualitySetting;
  if (!opts.test && !new URLSearchParams(search).has('quality') && (q === 'low' || q === 'medium' || q === 'high')) opts.quality = q;
}

export function installUi(game: Game): void {
  const s = game.save.data.settings;
  if (typeof s.playerName !== 'string' || !s.playerName) s.playerName = randomPilotName();
  if (s.reducedMotion === undefined && osReducedMotion()) s.reducedMotion = true;
  game.save.persist();
  applySettings(game);
  game.hud.widgets.push(installWaypoint(game), installEffects(game), installMinimap(game), installCompassPips(game), installTouch(game), onboardingWidget);
  void prepareBaseMap(game);
  installCardReveal(game);
  installAchievementBanner(game);
  game.bus.on('panel:open', () => document.documentElement.classList.add('panel-open'));
  game.bus.on('panel:close', () => document.documentElement.classList.remove('panel-open'));
  if (new URLSearchParams(location.search).has('onboard')) startOnboarding(game);
}

export function beginFlight(game: Game): void {
  game.ui.inert = false;
  game.input.clearPressed();
  game.autoSim = !game.opts.test;
  if (!game.save.data.flags[FLAG]) startOnboarding(game);
  else game.toast(`Welcome back, ${game.save.data.settings.playerName}`, 'info');
  if (game.opts.room) void game.net.join(game.opts.room).then((ok) => ok || game.toast('Could not join that room. You are flying solo; open Friends to try again', 'warn'));
}
