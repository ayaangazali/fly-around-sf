// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { panel } from '../../src/ui/panels/quests';
import { kind as quest } from '../../src/activities/kinds/quest';
import story from '../../src/content/activities/quest-story.json';
import type { ActivityDef } from '../../src/activities/types';
import { fakeGame } from './helpers';

function open(side: boolean, flags: Record<string, number> = {}) {
  const game = fakeGame();
  const closed: string[] = [];
  Object.assign(game.panels, { close: () => closed.push('closed') });
  game.save.data.settings.sideActivities = side;
  Object.assign(game.save.data.flags, flags);
  game.activities.register([quest], story as ActivityDef[]);
  const root = document.createElement('div');
  panel.render(root, game);
  return { game, root, closed };
}

describe('quest log', () => {
  it('[R-QUESTLOG] a chapter left halfway shows as paused with the objectives already done and offers to resume', () => {
    const { root } = open(true, { 'quest:quest-initial-commit': 2 });
    const ch = root.querySelector('[data-activity="quest-initial-commit"]') as HTMLElement;
    expect(ch.querySelector('.ql-chip')?.textContent).toBe('Paused 2/4');
    expect([...ch.querySelectorAll('.ql-objectives .done')].map((e) => e.textContent?.startsWith('✓ '))).toEqual([true, true]);
    expect(ch.querySelector('.ql-btn')?.textContent).toBe('📍 Resume');
    expect(ch.querySelector('.ql-tip')?.textContent).toContain('pick up where you left off');
    expect(root.querySelector('.ql-side')).toBeNull();
  });

  it('[R-V2-SIDE-QUIET] with side activities off the quest log explains why and turns them on in one click', () => {
    const { game, root, closed } = open(false);
    const note = root.querySelector('.ql-side') as HTMLElement;
    expect(note.textContent).toContain('side activities');
    (note.querySelector('button') as HTMLButtonElement).click();
    expect(game.save.data.settings.sideActivities).toBe(true);
    expect(closed).toEqual(['closed']);
  });
});
