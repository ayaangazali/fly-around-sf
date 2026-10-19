import type { GameSystem } from '../game';
import { GameAudio } from '../audio/game-audio';

export const system: GameSystem & { audio: GameAudio | null } = {
  id: 'audio',
  order: 90,
  audio: null,
  init(game) {
    this.audio = new GameAudio(game);
  },
  update(dt) {
    this.audio?.update(dt);
  },
};
