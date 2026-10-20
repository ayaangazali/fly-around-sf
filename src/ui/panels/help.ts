import './help.css';
import type { Panel } from '../panel-host';
import { el } from '../panel-host';
import { isTouchDevice } from '../touch';

const KEYBOARD: [string[], string][] = [
  [['W', 'S'], 'Fly forward and back'],
  [['A', 'D'], 'Turn left and right'],
  [['↑', '↓', '←', '→'], 'Arrows work like W, S, A and D'],
  [['Q', 'E'], 'Slide sideways'],
  [['Space'], 'Climb'],
  [['Shift'], 'Descend'],
  [['R'], 'Hold to boost, keep holding to go supersonic'],
  [['F'], 'Start the activity you are next to'],
  [['C'], 'Next activity, when several are here'],
  [['V'], 'Change camera'],
  [['M'], 'Map'],
  [['J'], 'Journal of things to do'],
  [['K'], 'Collection book'],
  [['L'], 'Quest log: The Lost Commit'],
  [['/'], 'Ask the City'],
  [['P'], 'Photo'],
  [['G'], 'Ping a spot for friends'],
  [['Enter'], 'Chat'],
  [['T'], 'Voice chat'],
  [['H'], 'This help'],
  [['Esc'], 'Menu, or close a panel'],
];

const GAMEPAD: [string, string][] = [
  ['Left stick', 'Fly forward, back and slide'],
  ['Right stick', 'Turn'],
  ['RT / LT', 'Climb / descend'],
  ['B or L3', 'Boost'],
  ['A', 'Interact'],
  ['X', 'Photo'],
  ['Y', 'Map'],
  ['LB', 'Ping'],
  ['Back', 'Journal'],
  ['Start', 'Menu'],
];

const TOUCH: [string, string][] = [
  ['Left stick', 'Up flies forward, sideways turns'],
  ['Right stick', 'Up climbs, sideways slides'],
  ['▲ ▼', 'Climb and descend'],
  ['BOOST', 'Hold to go fast, keep holding to go supersonic'],
  ['F', 'Start the activity you are next to'],
  ['Top bar', 'Menu, map, collection, friends and settings'],
];

const table = (rows: [string, string][]) => {
  const dl = el('dl', 'help-list');
  for (const [k, v] of rows) dl.append(el('dt', '', k), el('dd', '', v));
  return dl;
};

export const panel: Panel = {
  id: 'help',
  title: 'Controls',
  icon: '❔',
  action: 'help',
  order: 85,
  render(root) {
    const tabs = el('div', 'seg help-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Control layouts');
    const view = el('div', 'help-view');
    view.setAttribute('role', 'tabpanel');
    const keys = el('div', 'help-keys');
    for (const [caps, what] of KEYBOARD) {
      const r = el('div', 'help-key');
      const c = el('span', 'caps');
      for (const k of caps) c.append(el('kbd', '', k));
      r.append(c, el('span', '', what));
      keys.append(r);
    }
    const pad = el('div');
    pad.append(gamepadArt(), table(GAMEPAD));
    const touch = el('div');
    touch.append(touchArt(), table(TOUCH));
    const pages: [string, string, HTMLElement][] = [
      ['keyboard', 'Keyboard', keys],
      ['gamepad', 'Gamepad', pad],
      ['touch', 'Touch', touch],
    ];
    const show = (id: string) => {
      for (const b of tabs.children) b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === id));
      view.replaceChildren((pages.find((p) => p[0] === id) as [string, string, HTMLElement])[2]);
      view.dataset.tab = id;
    };
    for (const [id, label] of pages) {
      const b = el('button', 'seg-opt', label);
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.addEventListener('click', () => show(id));
      tabs.append(b);
    }
    show(isTouchDevice() ? 'touch' : 'keyboard');
    const tip = el('p', 'help-tip', 'Tip: follow the orange marker to your next stop, or open the map and warp there.');
    root.append(tabs, view, tip);
  },
};

function gamepadArt(): HTMLElement {
  const d = el('div', 'help-art');
  d.innerHTML = `<svg viewBox="0 0 320 170" role="img" aria-label="Gamepad layout"><path d="M70 30h180c34 0 56 30 62 72 6 40-14 62-34 62-18 0-28-14-40-32H82c-12 18-22 32-40 32-20 0-40-22-34-62 6-42 28-72 62-72z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" stroke-width="2"/><circle cx="92" cy="92" r="22" fill="rgba(255,106,61,0.25)" stroke="#ff6a3d" stroke-width="2"/><text x="92" y="97" text-anchor="middle" font-size="11" fill="#f6f3ec">MOVE</text><circle cx="202" cy="122" r="18" fill="rgba(255,193,94,0.2)" stroke="#ffc15e" stroke-width="2"/><text x="202" y="126" text-anchor="middle" font-size="10" fill="#f6f3ec">TURN</text><g font-size="12" font-weight="700" text-anchor="middle"><circle cx="246" cy="98" r="11" fill="#7de0a6"/><text x="246" y="102" fill="#10151c">A</text><circle cx="268" cy="76" r="11" fill="#ff7e7e"/><text x="268" y="80" fill="#10151c">B</text><circle cx="224" cy="76" r="11" fill="#5fb4ff"/><text x="224" y="80" fill="#10151c">X</text><circle cx="246" cy="54" r="11" fill="#ffc15e"/><text x="246" y="58" fill="#10151c">Y</text></g><rect x="56" y="12" width="44" height="12" rx="6" fill="rgba(255,255,255,0.18)"/><rect x="220" y="12" width="44" height="12" rx="6" fill="rgba(255,255,255,0.18)"/><text x="78" y="9" text-anchor="middle" font-size="9" fill="#cfd5dc">LT LB</text><text x="242" y="9" text-anchor="middle" font-size="9" fill="#cfd5dc">RT RB</text></svg>`;
  return d;
}

function touchArt(): HTMLElement {
  const d = el('div', 'help-art');
  d.innerHTML = `<svg viewBox="0 0 320 170" role="img" aria-label="Touch layout"><rect x="6" y="6" width="308" height="158" rx="22" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.25)" stroke-width="2"/><circle cx="62" cy="116" r="34" fill="rgba(255,255,255,0.06)" stroke="#ff6a3d" stroke-width="2"/><circle cx="62" cy="106" r="13" fill="#ff6a3d"/><text x="62" y="160" text-anchor="middle" font-size="10" fill="#cfd5dc">MOVE</text><circle cx="258" cy="116" r="34" fill="rgba(255,255,255,0.06)" stroke="#ffc15e" stroke-width="2"/><circle cx="258" cy="116" r="13" fill="#ffc15e"/><text x="258" y="160" text-anchor="middle" font-size="10" fill="#cfd5dc">LIFT</text><g font-size="10" font-weight="700" text-anchor="middle" fill="#f6f3ec"><rect x="190" y="56" width="30" height="24" rx="8" fill="rgba(255,255,255,0.12)"/><text x="205" y="72">▲</text><rect x="190" y="86" width="30" height="24" rx="8" fill="rgba(255,255,255,0.12)"/><text x="205" y="102">▼</text><rect x="226" y="40" width="52" height="24" rx="12" fill="rgba(255,106,61,0.5)"/><text x="252" y="56">BOOST</text></g><rect x="200" y="14" width="104" height="16" rx="8" fill="rgba(255,255,255,0.14)"/><rect x="128" y="14" width="64" height="16" rx="8" fill="rgba(255,255,255,0.08)"/></svg>`;
  return d;
}
