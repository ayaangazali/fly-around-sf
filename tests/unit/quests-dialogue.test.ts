// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import { SaveStore } from '../../src/core/save';
import { QuestDialogue } from '../../src/ui/quest-dialogue';
import { memoryStorage } from './helpers';
import type { Game } from '../../src/game';

describe('quest dialogue', () => {
  it('[R-DIALOGUE] a line stays until the reader moves on with F or Next, however long they take', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const ui = document.createElement('div');
    document.body.replaceChildren(ui);
    const game = { ui, bus: new Bus(), save: new SaveStore(memoryStorage()), activities: { nearby: null } } as unknown as Game;
    const d = new QuestDialogue(game);
    game.bus.emit('quest:say', { id: 'q', lines: [{ who: 'Emperor Norton', text: 'Halt, citizen! The Imperial treasury is missing a commit.' }, { who: 'Emperor Norton', text: 'Fly to the Palace.' }] });
    vi.advanceTimersByTime(60_000);
    expect(d.text).toContain('Halt, citizen!');
    expect(ui.querySelector('.qd-typed')?.textContent).toBe(d.text);
    (ui.querySelector('.qd-next') as HTMLElement).click();
    expect(d.text).toBe('Fly to the Palace.');
    vi.advanceTimersByTime(60_000);
    expect(d.visible).toBe(true);
    expect(ui.querySelector('.qd-next')?.textContent).toBe('Close F');
    game.bus.emit('interact', {});
    expect(d.visible).toBe(false);
    vi.useRealTimers();
  });
});
