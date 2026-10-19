import { el } from './panel-host';

let uid = 0;

export function row(label: string, control: HTMLElement, help?: string): HTMLElement {
  const r = el('div', 'set-row');
  const id = `ctl-${++uid}`;
  const text = el('div', 'set-label');
  const name = el('label', '', label);
  name.htmlFor = id;
  name.id = `${id}-label`;
  text.append(name);
  if (help) text.append(el('small', '', help));
  const target = control.matches('input, select, textarea') ? control : control.querySelector('input');
  if (target) target.id = id;
  else control.setAttribute('aria-labelledby', name.id);
  r.append(text, control);
  return r;
}

export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  const g = el('div', 'seg');
  g.setAttribute('role', 'radiogroup');
  const buttons = options.map(([v, label]) => {
    const b = el('button', 'seg-opt', label);
    b.setAttribute('role', 'radio');
    b.dataset.value = v;
    b.addEventListener('click', () => {
      for (const o of buttons) o.setAttribute('aria-checked', String(o === b));
      onChange(v);
    });
    b.setAttribute('aria-checked', String(v === value));
    return b;
  });
  g.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d || i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = buttons[(i + d + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });
  g.append(...buttons);
  return g;
}

export function toggle(value: boolean, onChange: (v: boolean) => void): HTMLButtonElement {
  const b = el('button', 'switch');
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(value));
  b.append(el('i'));
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  return b;
}

export function slider(min: number, max: number, step: number, value: number, format: (v: number) => string, onChange: (v: number) => void): HTMLElement {
  const wrap = el('div', 'slider');
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('output', '', format(value));
  const paint = () => input.style.setProperty('--fill', `${((Number(input.value) - min) / (max - min)) * 100}%`);
  paint();
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
    paint();
    onChange(v);
  });
  input.setAttribute('aria-valuetext', format(value));
  wrap.append(input, out);
  return wrap;
}

export function section(title: string, ...rows: HTMLElement[]): HTMLElement {
  const s = el('section', 'set-section');
  s.append(el('h3', '', title), ...rows);
  return s;
}
