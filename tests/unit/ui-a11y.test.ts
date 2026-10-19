// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { PanelHost, el, type Panel } from '../../src/ui/panel-host';
import { segmented, slider, toggle, row } from '../../src/ui/controls';
import { Bus } from '../../src/core/bus';
import type { Game } from '../../src/game';

function host() {
  const ui = document.createElement('div');
  document.body.replaceChildren(ui);
  const game = { ui, bus: new Bus(), input: { held: new Set<string>() } } as unknown as Game;
  const h = new PanelHost(game);
  (game as unknown as { panels: PanelHost }).panels = h;
  const panel: Panel = {
    id: 'demo',
    title: 'Demo',
    icon: '*',
    render(root) {
      root.append(el('button', 'a', 'First'), el('button', 'b', 'Last'));
    },
  };
  h.register([panel]);
  return { h, ui };
}

const key = (target: HTMLElement, k: string, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));

describe('accessible sheets and controls', () => {
  it('[R-A11Y] a sheet is a labelled modal dialog that traps focus and returns it', () => {
    const { h } = host();
    const opener = h.bar.querySelector('button') as HTMLButtonElement;
    expect(opener.getAttribute('aria-label')).toBe('Demo');
    opener.focus();
    h.open('demo');
    expect(h.sheet.getAttribute('role')).toBe('dialog');
    expect(h.sheet.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(h.sheet.getAttribute('aria-labelledby')!)?.textContent).toContain('Demo');
    const close = h.sheet.querySelector('.sheet-close') as HTMLElement;
    expect(document.activeElement).toBe(close);
    const last = h.sheet.querySelector('.b') as HTMLElement;
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).toBe(close);
    key(close, 'Tab', true);
    expect(document.activeElement).toBe(last);
    key(last, 'Escape');
    expect(h.openId).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('[R-A11Y] segmented controls are radio groups driven by arrow keys', () => {
    let v = '';
    const g = segmented([['a', 'A'], ['b', 'B'], ['c', 'C']], 'a', (x) => (v = x));
    document.body.append(g);
    const [a, , c] = [...g.children] as HTMLElement[];
    expect(g.getAttribute('role')).toBe('radiogroup');
    expect(a.getAttribute('aria-checked')).toBe('true');
    a.focus();
    key(a, 'ArrowLeft');
    expect(v).toBe('c');
    expect(c.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(c);
    key(c, 'ArrowRight');
    expect(v).toBe('a');
    key(a, 'x');
    expect(v).toBe('a');
  });

  it('[R-A11Y] switches, sliders and rows expose state and labels', () => {
    let on = false;
    const s = toggle(false, (x) => (on = x));
    expect(s.getAttribute('role')).toBe('switch');
    s.click();
    expect(on).toBe(true);
    expect(s.getAttribute('aria-checked')).toBe('true');
    let n = 0;
    const sl = slider(0, 1, 0.1, 0.5, (x) => `${Math.round(x * 100)}%`, (x) => (n = x));
    const input = sl.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-valuetext')).toBe('50%');
    input.value = '0.8';
    input.dispatchEvent(new Event('input'));
    expect(n).toBeCloseTo(0.8);
    expect(sl.querySelector('output')?.textContent).toBe('80%');
    const r = row('Volume', sl, 'How loud');
    document.body.append(r);
    expect((r.querySelector('label') as HTMLLabelElement).htmlFor).toBe(input.id);
    const sw = row('Mute', toggle(true, () => undefined));
    document.body.append(sw);
    const labelId = sw.querySelector('.switch')?.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId!)?.textContent).toBe('Mute');
  });
});
