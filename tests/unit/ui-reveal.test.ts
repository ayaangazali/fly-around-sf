// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import { SaveStore } from '../../src/core/save';
import { memoryStorage } from './helpers';
import type { Game } from '../../src/game';
import type { CardDef } from '../../src/content/types';

const CARDS: CardDef[] = ['fort-point', 'lombard-street'].map((id, i) => ({ id, name: id, category: 'landmark', rarity: i ? 'rare' : 'legendary', neighborhood: 'Presidio', blurb: `Blurb ${id}`, lore: 'l', facts: [], sources: [] }));
const opened: string[] = [];
vi.mock('../../src/ui/panels/dex', () => ({ allCards: () => CARDS, openCard: (_g: Game, id: string) => opened.push(id) }));

describe('card reveal', () => {
  it('[R-CARD-REVEAL] each unlock queues a reveal that can open the card in the book', async () => {
    vi.useFakeTimers();
    const { installCardReveal } = await import('../../src/ui/card-reveal');
    const ui = document.createElement('div');
    document.body.replaceChildren(ui);
    const panels = { openId: null as string | null };
    const game = { ui, bus: new Bus(), save: new SaveStore(memoryStorage()), panels, activities: { active: null }, hud: { widgets: [] } } as unknown as Game;
    installCardReveal(game);
    game.bus.emit('card:unlock', { id: 'no-such-card' });
    expect(ui.querySelector('.reveal')).toBeNull();
    game.bus.emit('card:unlock', { id: 'fort-point' });
    game.bus.emit('card:unlock', { id: 'lombard-street' });
    const first = ui.querySelector('.reveal') as HTMLElement;
    expect(first.dataset.card).toBe('fort-point');
    expect(first.className).toContain('rarity-legendary');
    expect(first.textContent).toContain('New legendary card');
    expect(document.documentElement.classList.contains('revealing')).toBe(true);
    expect(ui.querySelectorAll('.reveal')).toHaveLength(1);
    (first.querySelector('.btn.primary') as HTMLElement).click();
    expect(opened).toEqual(['fort-point']);
    vi.advanceTimersByTime(400);
    const second = ui.querySelector('.reveal') as HTMLElement;
    expect(second.dataset.card).toBe('lombard-street');
    vi.advanceTimersByTime(7000);
    expect(ui.querySelector('.reveal')).toBeNull();
    expect(document.documentElement.classList.contains('revealing')).toBe(false);
    panels.openId = 'map';
    game.bus.emit('card:unlock', { id: 'fort-point' });
    expect(ui.querySelector('.reveal')).toBeNull();
    panels.openId = null;
    game.hud.widgets[0].update();
    expect((ui.querySelector('.reveal') as HTMLElement).dataset.card).toBe('fort-point');
    game.bus.emit('panel:open', { id: 'dex' });
    vi.advanceTimersByTime(400);
    expect(ui.querySelector('.reveal')).toBeNull();
    vi.useRealTimers();
  });

  it('[R-CARD-REVEAL] a reveal waits until no activity runs and the Emperor stops talking, and starting an activity puts it away', async () => {
    vi.useFakeTimers();
    const { installCardReveal } = await import('../../src/ui/card-reveal');
    const ui = document.createElement('div');
    const dialogue = document.createElement('section');
    dialogue.className = 'qd';
    ui.append(dialogue);
    document.body.replaceChildren(ui);
    const activities = { active: {} as object | null };
    const game = { ui, bus: new Bus(), save: new SaveStore(memoryStorage()), panels: { openId: null }, activities, hud: { widgets: [] } } as unknown as Game;
    installCardReveal(game);
    const tick = () => game.hud.widgets[0].update();
    game.bus.emit('card:unlock', { id: 'fort-point' });
    expect(ui.querySelector('.reveal')).toBeNull();
    activities.active = null;
    tick();
    expect(ui.querySelector('.reveal')).toBeNull();
    dialogue.hidden = true;
    tick();
    expect((ui.querySelector('.reveal') as HTMLElement).dataset.card).toBe('fort-point');
    activities.active = {};
    game.bus.emit('activity:start', { id: 'trivia-coit-tower' });
    vi.advanceTimersByTime(400);
    expect(ui.querySelector('.reveal')).toBeNull();
    vi.useRealTimers();
  });
});
