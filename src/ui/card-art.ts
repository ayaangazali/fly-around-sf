import type { CardCategory, CardDef } from '../content/types';

export const CATEGORY: Record<CardCategory, { label: string; one: string; icon: string; colors: [string, string] }> = {
  landmark: { label: 'Landmarks', one: 'Landmark', icon: '🌉', colors: ['#ff6a3d', '#ffc15e'] },
  park: { label: 'Parks', one: 'Park', icon: '🌳', colors: ['#2f8f4e', '#c6f07a'] },
  wildlife: { label: 'Wildlife', one: 'Wildlife', icon: '🦭', colors: ['#1f8f86', '#a6f0d6'] },
  food: { label: 'Food', one: 'Food', icon: '🥐', colors: ['#e0663d', '#ffd36b'] },
  history: { label: 'History', one: 'History', icon: '📜', colors: ['#8a6440', '#f0d9a6'] },
  culture: { label: 'Culture', one: 'Culture', icon: '🎨', colors: ['#8f5cff', '#ff7eb6'] },
  company: { label: 'Companies', one: 'Company', icon: '🏢', colors: ['#2f5fe0', '#7de0ff'] },
  tech: { label: 'Tech', one: 'Tech', icon: '💾', colors: ['#00a891', '#5fb4ff'] },
  transit: { label: 'Transit', one: 'Transit', icon: '🚋', colors: ['#b8322a', '#f4d03f'] },
  event: { label: 'Events', one: 'Event', icon: '🎆', colors: ['#e0306f', '#ffc15e'] },
  hidden: { label: 'Hidden SF', one: 'Hidden SF', icon: '🗝️', colors: ['#3a3f6c', '#9fa8ff'] },
};

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 200;
const H = 140;
const f = (n: number) => n.toFixed(1);

type Motif = (r: () => number, ink: string, hi: string) => string;

const skyline = (r: () => number, ink: string, base = H) => {
  let x = -4;
  let out = '';
  while (x < W) {
    const w = 8 + r() * 16;
    const h = 14 + r() * 44;
    out += `<rect x="${f(x)}" y="${f(base - h)}" width="${f(w)}" height="${f(h + 2)}" fill="${ink}" opacity="${f(0.55 + r() * 0.35)}"/>`;
    x += w + r() * 3;
  }
  return out;
};

const wave = (r: () => number, ink: string, i: number) => {
  const y = 82 + i * 14;
  return `<path d="M0 ${y} ${Array.from({ length: 6 }, (_, k) => `Q${k * 40 + 20} ${f(y - 8 - r() * 6)} ${k * 40 + 40} ${y}`).join(' ')} V140 H0Z" fill="${ink}" opacity="${f(0.25 + i * 0.15)}"/>`;
};

const gulls = (r: () => number, hi: string) => {
  let birds = '';
  for (let i = 0; i < 4; i++) {
    const x = 30 + r() * 140;
    const y = 22 + r() * 36;
    const s = 5 + r() * 6;
    birds += `<path d="M${f(x - s)} ${f(y - s * 0.4)} Q${f(x - s / 2)} ${f(y - s * 0.8)} ${f(x)} ${f(y)} Q${f(x + s / 2)} ${f(y - s * 0.8)} ${f(x + s)} ${f(y - s * 0.4)}" stroke="${hi}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  return birds;
};

const city = (feature: Motif): Motif => (r, ink, hi) => `${skyline(r, ink)}${feature(r, ink, hi)}<rect y="${f(70 + r() * 20)}" width="${W}" height="16" fill="#fff" opacity="0.18"/>`;
const sea = (feature: Motif): Motif => (r, ink, hi) => `${wave(r, ink, 0)}${wave(r, ink, 1)}${feature(r, ink, hi)}${wave(r, ink, 2)}${wave(r, ink, 3)}`;
const land = (feature: Motif): Motif => (r, ink, hi) => `<path d="M0 116 Q100 100 200 118 V140 H0Z" fill="${ink}" opacity="0.7"/>${feature(r, ink, hi)}`;
const rows = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('');
const FLOWERS = ['#ff6a3d', '#ffc15e', '#ff7eb6', '#b48cff'];

export const ART: Record<string, Motif> = {
  bridge: city((r, _, hi) => {
    const cx = 60 + r() * 80;
    return `<rect x="${f(cx - 22)}" y="30" width="6" height="92" fill="${hi}"/><rect x="${f(cx + 16)}" y="30" width="6" height="92" fill="${hi}"/><path d="M-10 92 Q${f(cx - 19)} 30 ${f(cx - 19)} 30 Q${f(cx)} 80 ${f(cx + 19)} 30 Q${f(cx + 19)} 30 210 92" stroke="${hi}" stroke-width="2" fill="none"/><rect x="-10" y="96" width="220" height="4" fill="${hi}"/>`;
  }),
  pyramid: city((r, ink) => {
    const cx = 70 + r() * 60;
    return `<path d="M${f(cx)} 14 L${f(cx + 17)} 122 L${f(cx - 17)} 122Z" fill="${ink}"/><rect x="${f(cx - 11)}" y="44" width="6" height="18" fill="${ink}"/><rect x="${f(cx + 5)}" y="44" width="6" height="18" fill="${ink}"/>`;
  }),
  column: city((r, ink, hi) => {
    const cx = 70 + r() * 60;
    return `<path d="M${f(cx - 50)} 124 Q${f(cx)} 94 ${f(cx + 50)} 124Z" fill="${ink}"/><rect x="${f(cx - 9)}" y="38" width="18" height="74" fill="${ink}"/><rect x="${f(cx - 11)}" y="31" width="22" height="9" rx="1" fill="${ink}"/>${rows(3, (i) => `<rect x="${f(cx - 6 + i * 5)}" y="43" width="2.5" height="8" rx="1.2" fill="${hi}"/>`)}`;
  }),
  'clock-tower': city((_, ink, hi) => `<rect x="18" y="98" width="164" height="24" fill="${ink}"/>${rows(12, (i) => `<rect x="${24 + i * 13}" y="104" width="6" height="9" rx="3" fill="${hi}" opacity="0.6"/>`)}<rect x="92" y="40" width="16" height="60" fill="${ink}"/><path d="M90 40 L100 24 L110 40Z" fill="${ink}"/><path d="M100 24 V12" stroke="${ink}" stroke-width="1.5"/><circle cx="100" cy="54" r="5" fill="${hi}"/>`),
  tower: city((r, ink, hi) => {
    const cx = 70 + r() * 60;
    return `<path d="M${f(cx - 15)} 124 L${f(cx - 12)} 30 Q${f(cx)} 8 ${f(cx + 12)} 30 L${f(cx + 15)} 124Z" fill="${ink}"/><path d="M${f(cx - 11)} 30 Q${f(cx)} 13 ${f(cx + 11)} 30Z" fill="${hi}" opacity="0.55"/>`;
  }),
  mast: (r, ink) => {
    const cx = 80 + r() * 40;
    return `<path d="M${f(cx - 26)} 106 L${f(cx - 7)} 40 M${f(cx + 26)} 106 L${f(cx + 7)} 40 M${f(cx)} 100 V40 M${f(cx - 20)} 84 H${f(cx + 20)} M${f(cx - 14)} 62 H${f(cx + 14)} M${f(cx - 13)} 40 H${f(cx + 13)} M${f(cx - 10)} 40 L${f(cx - 12)} 12 M${f(cx)} 40 V8 M${f(cx + 10)} 40 L${f(cx + 12)} 12" stroke="${ink}" stroke-width="3" fill="none"/><circle cx="${f(cx)}" cy="8" r="2.2" fill="#ff6a3d"/><rect y="82" width="${W}" height="24" fill="#fff" opacity="0.35"/><path d="M0 140 V122 Q${f(cx)} 92 200 122 V140Z" fill="${ink}"/>`;
  },
  island: sea((_, ink, hi) => `<path d="M30 112 Q46 92 72 90 L150 86 Q170 92 176 112Z" fill="${ink}"/><rect x="74" y="72" width="58" height="18" fill="${ink}"/>${rows(8, (i) => `<rect x="${78 + i * 7}" y="77" width="3" height="6" fill="${hi}" opacity="0.7"/>`)}<rect x="142" y="50" width="6" height="38" fill="${ink}"/><rect x="140" y="45" width="10" height="7" fill="${hi}"/><path d="M140 45 L145 39 L150 45Z" fill="${ink}"/>`),
  'row-houses': city((_, ink) => {
    const colors = ['#ff7eb6', '#ffc15e', '#7de0a6', '#5fb4ff', '#b48cff', '#ff6a3d', '#fff7e6'];
    return `${rows(7, (i) => {
      const x = 6 + i * 27;
      const y = 72 + i * 4;
      return `<path d="M${x} 126 V${y} L${x + 13} ${y - 14} L${x + 26} ${y} V126Z" fill="${colors[i]}"/><rect x="${x + 5}" y="${y + 8}" width="6" height="10" fill="${ink}" opacity="0.6"/><rect x="${x + 15}" y="${y + 8}" width="6" height="10" fill="${ink}" opacity="0.6"/><rect x="${x + 10}" y="${y + 28}" width="6" height="${126 - y - 28}" fill="${ink}" opacity="0.7"/>`;
    })}<path d="M0 140 V128 Q100 114 200 128 V140Z" fill="${ink}"/>`;
  }),
  switchbacks: (r, ink, hi) => `<path d="M14 140 L58 30 H142 L186 140Z" fill="${ink}" opacity="0.8"/>${rows(18, (i) => `<circle cx="${f(48 + r() * 104)}" cy="${f(44 + (i % 6) * 16)}" r="${f(2 + r() * 2)}" fill="${FLOWERS[i % 4]}"/>`)}<path d="M64 38 H136 Q150 46 136 54 H68 Q54 62 68 70 H140 Q156 78 140 86 H64 Q48 94 64 102 H144 Q162 110 144 118 H50" stroke="${hi}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  dome: city((_, ink, hi) => `<rect x="28" y="94" width="144" height="28" fill="${ink}"/>${rows(14, (i) => `<rect x="${34 + i * 10}" y="98" width="3" height="20" fill="${hi}" opacity="0.5"/>`)}<rect x="74" y="70" width="52" height="26" fill="${ink}"/><path d="M72 72 A28 28 0 0 1 128 72Z" fill="${ink}"/><rect x="96" y="30" width="8" height="16" fill="${ink}"/><circle cx="100" cy="28" r="3" fill="${hi}"/>`),
  glasshouse: land((_, ink, hi) => `<path d="M24 116 V96 Q24 84 40 84 H70 V116Z M176 116 V96 Q176 84 160 84 H130 V116Z M68 116 V84 A32 32 0 0 1 132 84 V116Z" fill="${hi}"/><rect x="95" y="44" width="10" height="10" fill="${hi}"/>${rows(19, (i) => `<rect x="${29 + i * 8}" y="60" width="1" height="56" fill="${ink}" opacity="0.25"/>`)}`),
  temple: city((_, ink) => `<path d="M38 66 L100 42 L162 66Z" fill="${ink}"/><rect x="42" y="66" width="116" height="7" fill="${ink}"/>${rows(8, (i) => `<rect x="${48 + i * 14}" y="73" width="6" height="38" fill="${ink}"/>`)}<rect x="34" y="110" width="132" height="6" fill="${ink}"/><rect x="28" y="116" width="144" height="8" fill="${ink}"/>`),
  stadium: city((_, ink, hi) => `<path d="M22 124 L30 78 Q100 64 170 78 L178 124Z" fill="${ink}"/>${rows(9, (i) => `<rect x="${36 + i * 15}" y="88" width="9" height="12" rx="4.5" fill="${hi}" opacity="0.55"/>`)}${[34, 166].map((x) => `<rect x="${x - 1.5}" y="38" width="3" height="42" fill="${ink}"/><rect x="${x - 9}" y="30" width="18" height="9" fill="${hi}"/>`).join('')}<rect x="95" y="46" width="10" height="30" fill="${ink}"/><path d="M95 46 L100 38 L105 46Z" fill="${ink}"/>`),
  arena: city((_, ink, hi) => `<path d="M24 124 V92 Q100 58 176 92 V124Z" fill="${ink}"/>${rows(3, (i) => `<rect x="24" y="${98 + i * 9}" width="152" height="4" fill="${hi}" opacity="${f(0.6 - i * 0.15)}"/>`)}`),
  'twist-tower': land((r, ink, hi) => `<rect x="18" y="94" width="138" height="22" fill="${ink}"/><path d="M120 116 L112 34 L160 42 L150 116Z" fill="${ink}"/>${rows(40, () => `<circle cx="${f(22 + r() * 128)}" cy="${f(46 + r() * 66)}" r="1" fill="${hi}" opacity="0.45"/>`)}`),
  'green-roof': land((_, ink, hi) => `<rect x="18" y="90" width="164" height="26" fill="${ink}"/><path d="M14 92 Q36 70 58 88 Q82 54 108 86 Q130 66 150 88 Q168 76 186 92Z" fill="#7de0a6"/>${rows(10, (i) => `<rect x="${26 + i * 15}" y="96" width="2" height="18" fill="${hi}" opacity="0.6"/>`)}`),
  pier: sea((_, ink, hi) => `<rect x="8" y="96" width="184" height="6" fill="${ink}"/>${rows(12, (i) => `<rect x="${14 + i * 15}" y="102" width="3" height="20" fill="${ink}"/>`)}${[[30, 34], [70, 44], [124, 36]].map(([x, h]) => `<path d="M${x} 96 V${96 - h * 0.6} L${x + h / 2} ${96 - h} L${x + h} ${96 - h * 0.6} V96Z" fill="${ink}"/><rect x="${x + h / 2 - 3}" y="${96 - h * 0.5}" width="6" height="6" fill="${hi}" opacity="0.7"/>`).join('')}<path d="M164 96 V56" stroke="${ink}" stroke-width="2"/><path d="M164 56 L178 61 L164 66Z" fill="${hi}"/>`),
  fort: sea((_, ink, hi) => `<rect x="-4" y="30" width="208" height="6" fill="${hi}"/><path d="M14 112 Q100 -12 186 112" stroke="${hi}" stroke-width="5" fill="none"/>${rows(9, (i) => `<path d="M${f(30 + i * 17.5)} 36 V${f(36 + 30 * Math.abs(i - 4) ** 1.6 / 9)}" stroke="${hi}" stroke-width="1.5"/>`)}<rect x="44" y="70" width="112" height="44" fill="${ink}"/>${[78, 92, 106].map((y) => rows(9, (i) => `<rect x="${50 + i * 12}" y="${y - 4}" width="5" height="7" rx="2.5" fill="${hi}" opacity="0.6"/>`)).join('')}`),
  windmill: land((r, ink, hi) => {
    const cx = 80 + r() * 40;
    const a = f(r() * 90);
    return `<path d="M${f(cx - 15)} 120 L${f(cx - 9)} 66 H${f(cx + 9)} L${f(cx + 15)} 120Z" fill="${ink}"/><path d="M${f(cx - 12)} 66 Q${f(cx)} 48 ${f(cx + 12)} 66Z" fill="${ink}"/><g transform="rotate(${a} ${f(cx)} 60)">${rows(4, (i) => `<g transform="rotate(${i * 90} ${f(cx)} 60)"><rect x="${f(cx - 1.5)}" y="12" width="3" height="48" fill="${ink}"/><rect x="${f(cx + 1.5)}" y="14" width="10" height="38" fill="${hi}" opacity="0.85"/></g>`)}</g>${rows(14, (i) => `<circle cx="${f(10 + i * 13.5)}" cy="${f(124 + r() * 8)}" r="3" fill="${FLOWERS[i % 3]}"/>`)}`;
  }),
  cliff: sea((_, ink, hi) => `<path d="M104 140 V96 Q110 84 126 80 H200 V140Z" fill="${ink}"/><rect x="122" y="60" width="52" height="20" fill="${hi}"/><rect x="122" y="67" width="52" height="5" fill="${ink}" opacity="0.6"/><path d="M34 112 L44 92 L54 98 L62 112Z M66 112 L72 100 L80 112Z" fill="${ink}"/>`),
  mission: city((_, ink, hi) => `<path d="M46 68 L100 50 L154 68Z" fill="${ink}"/><rect x="52" y="66" width="96" height="58" fill="${hi}"/>${[60, 80, 114, 134].map((x) => `<rect x="${x}" y="72" width="6" height="26" fill="${ink}" opacity="0.45"/>`).join('')}${[71, 100, 125].map((x) => `<path d="M${x - 4} 84 Q${x} 74 ${x + 4} 84Z" fill="${ink}"/>`).join('')}<rect x="52" y="98" width="96" height="4" fill="${ink}" opacity="0.5"/><rect x="91" y="104" width="18" height="20" fill="${ink}"/>`),
  cathedral: city((_, ink, hi) => `${[54, 124].map((x) => `<rect x="${x}" y="44" width="22" height="80" fill="${ink}"/><rect x="${x}" y="38" width="4" height="8" fill="${ink}"/><rect x="${x + 18}" y="38" width="4" height="8" fill="${ink}"/>`).join('')}<path d="M76 124 V64 L100 50 L124 64 V124Z" fill="${ink}"/><path d="M97 52 L100 22 L103 52Z" fill="${ink}"/><circle cx="100" cy="78" r="10" fill="${hi}"/><path d="M100 68 V88 M90 78 H110 M93 71 L107 85 M107 71 L93 85" stroke="${ink}" stroke-width="1.5"/><path d="M92 124 V106 Q100 94 108 106 V124Z" fill="${hi}" opacity="0.7"/>`),
  saddle: city((_, ink, hi) => `<path d="M38 124 Q94 112 97 30 H103 Q106 112 162 124Z" fill="${ink}"/><path d="M100 36 V118" stroke="${hi}" stroke-width="2" opacity="0.7"/><path d="M100 30 V10 M94 16 H106" stroke="${hi}" stroke-width="2.5"/>`),
  gate: city((_, ink, hi) => {
    const roof = (x: number, y: number, w: number) => `<path d="M${x - w - 8} ${y - 10} Q${x} ${y + 4} ${x + w + 8} ${y - 10} L${x + w - 6} ${y - 18} H${x - w + 6}Z" fill="${ink}"/>`;
    return `${[[36, 72], [62, 54], [132, 54], [158, 72]].map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="${124 - y}" fill="${ink}"/>`).join('')}${roof(100, 56, 40)}${roof(48, 74, 20)}${roof(152, 74, 20)}<rect x="88" y="58" width="24" height="10" fill="${hi}"/>`;
  }),
  flatiron: city((_, ink, hi) => `<path d="M114 124 V58 L152 66 V124Z" fill="${ink}" opacity="0.75"/><path d="M86 124 V58 Q100 50 114 58 V124Z" fill="${ink}"/><path d="M88 58 Q100 32 112 58Z" fill="#7de0a6"/>${rows(6, (i) => `<rect x="92" y="${66 + i * 9}" width="16" height="3" fill="${hi}" opacity="0.5"/>`)}`),
  seal: (r, ink, hi) => `${sea(() => '')(r, ink, hi)}<path d="M14 104 H186 L180 112 H20Z" fill="${ink}"/>${[24, 116, 146].map((x) => `<path d="M${x} 104 Q${x + 2} 94 ${x + 14} 93 Q${x + 26} 92 ${x + 32} 98 L${x + 38} 96 Q${x + 40} 100 ${x + 34} 104Z" fill="${ink}"/>`).join('')}<path d="M70 104 Q66 84 78 70 Q82 64 88 66 L96 68 L88 72 Q84 80 86 92 Q92 100 98 104Z" fill="${ink}"/><circle cx="86" cy="68" r="1.4" fill="${hi}"/>`,
  parrot: (r, ink, hi) => `<path d="M-4 104 Q90 86 204 98" stroke="${ink}" stroke-width="6" fill="none"/>${rows(5, (i) => `<ellipse cx="${20 + i * 40}" cy="${f(96 - r() * 4)}" rx="9" ry="4" fill="${ink}" opacity="0.7" transform="rotate(-25 ${20 + i * 40} 96)"/>`)}<path d="M96 100 Q80 74 96 56 Q110 46 118 60 Q122 80 108 100Z" fill="#2fa84f"/><path d="M98 98 L90 134 L98 134 L106 100Z" fill="#2fa84f"/><circle cx="110" cy="57" r="10" fill="#e8402f"/><path d="M118 53 Q129 57 120 65Z" fill="${hi}"/><circle cx="112" cy="55" r="1.8" fill="${ink}"/>`,
  bison: land((_, ink, hi) => `<path d="M62 112 L64 92 Q62 70 84 62 Q102 54 118 64 Q144 66 148 84 L146 112 H138 L136 96 H88 L82 112Z" fill="${ink}"/><path d="M66 74 Q48 74 44 92 Q46 104 60 102 L68 96Z" fill="${ink}"/><path d="M54 77 Q50 70 56 67" stroke="${hi}" stroke-width="2" fill="none"/><path d="M148 82 Q156 86 154 100" stroke="${ink}" stroke-width="2" fill="none"/>`),
  coyote: land((_, ink) => `<path d="M64 114 L68 92 Q70 82 86 82 H118 L124 70 L122 56 L128 62 L134 56 L134 68 L146 74 L136 80 L130 84 L128 96 L132 114 H126 L120 98 H88 L82 114 H76 L78 98 L70 114Z" fill="${ink}"/><path d="M70 88 Q52 92 44 110 Q58 106 70 98Z" fill="${ink}"/>`),
  raccoon: land((_, ink, hi) => `<path d="M72 100 Q50 96 40 114" stroke="${ink}" stroke-width="11" fill="none" stroke-linecap="round"/>${rows(3, (i) => `<path d="M${62 - i * 9} ${f(95 + i * 4)} l-3 9" stroke="${hi}" stroke-width="4" opacity="0.8"/>`)}<path d="M70 114 Q62 86 94 80 Q118 76 130 88 L134 100 V114 H126 L124 106 H90 L86 114Z" fill="${ink}"/><path d="M126 86 Q136 78 144 86 L158 98 Q146 104 130 100Z" fill="#c9c3b6"/><path d="M128 84 L130 74 L137 81Z" fill="${ink}"/><path d="M132 89 Q142 86 149 94 Q140 97 134 95Z" fill="${ink}"/><circle cx="158" cy="98" r="2.2" fill="${ink}"/>`),
  pelican: sea((_, ink) => rows(3, (i) => {
    const x = 48 + i * 46;
    const y = 62 - i * 9;
    return `<path d="M${x - 18} ${y + 2} Q${x - 4} ${y - 4} ${x + 10} ${y} Q${x + 13} ${y - 6} ${x + 18} ${y - 5} L${x + 36} ${y + 2} L${x + 18} ${y + 1} Q${x + 12} ${y + 6} ${x} ${y + 6} Q${x - 10} ${y + 6} ${x - 18} ${y + 2}Z M${x - 8} ${y + 1} Q${x - 4} ${y - 16} ${x + 4} ${y - 22} Q${x + 2} ${y - 10} ${x + 4} ${y + 1}Z" fill="${ink}"/>`;
  })),
  hawk: (_, ink) => `<path d="M100 50 Q76 40 40 50 Q30 52 24 60 Q52 58 72 62 Q86 64 94 70 L90 92 Q100 98 110 92 L106 70 Q114 64 128 62 Q148 58 176 60 Q170 52 160 50 Q124 40 100 50Z" fill="${ink}"/><path d="M90 92 Q100 104 110 92 L106 82 H94Z" fill="#c8502e"/><circle cx="100" cy="50" r="6" fill="${ink}"/><path d="M0 140 V120 Q60 104 120 116 Q160 122 200 112 V140Z" fill="${ink}" opacity="0.6"/>`,
  heron: sea((_, ink) => `<path d="M100 104 L98 128 M108 104 L110 128" stroke="${ink}" stroke-width="2.5"/><path d="M88 104 Q86 84 102 78 Q118 74 124 90 Q128 104 112 106Z" fill="${ink}"/><path d="M104 80 Q92 66 100 54 Q106 46 104 36" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="103" cy="34" r="5" fill="${ink}"/><path d="M106 33 L128 37 L106 37Z" fill="${ink}"/>`),
  plover: (r, ink, hi) => `<path d="M0 140 V112 Q100 100 200 114 V140Z" fill="#f0d9a6" opacity="0.9"/>${wave(r, ink, 0)}<ellipse cx="100" cy="96" rx="20" ry="13" fill="${hi}"/><path d="M84 92 Q96 80 120 90 Q112 96 84 96Z" fill="#a08a6a"/><circle cx="118" cy="84" r="8" fill="${hi}"/><path d="M114 78 Q120 74 126 80" stroke="#a08a6a" stroke-width="4" fill="none"/><circle cx="121" cy="83" r="1.6" fill="${ink}"/><path d="M125 85 L132 86 L125 88Z" fill="${ink}"/><path d="M96 108 V118 M104 108 V118" stroke="${ink}" stroke-width="2"/>`,
  swallows: (r, ink) => `<path d="M0 60 Q60 50 120 64 Q160 72 200 62 V140 H0Z" fill="#f0d9a6" opacity="0.8"/>${rows(14, () => `<ellipse cx="${f(20 + r() * 160)}" cy="${f(76 + r() * 50)}" rx="4" ry="3" fill="${ink}"/>`)}${rows(5, () => {
    const x = 30 + r() * 140;
    const y = 18 + r() * 30;
    return `<path d="M${f(x - 12)} ${f(y - 4)} Q${f(x - 4)} ${f(y - 4)} ${f(x)} ${f(y)} Q${f(x + 4)} ${f(y - 4)} ${f(x + 12)} ${f(y - 4)} Q${f(x + 4)} ${f(y + 2)} ${f(x)} ${f(y + 4)} L${f(x + 3)} ${f(y + 11)} L${f(x)} ${f(y + 7)} L${f(x - 3)} ${f(y + 11)} L${f(x)} ${f(y + 4)} Q${f(x - 4)} ${f(y + 2)} ${f(x - 12)} ${f(y - 4)}Z" fill="${ink}"/>`;
  })}`,
  seabirds: sea((r, ink, hi) => `<path d="M40 110 Q60 76 100 72 Q140 76 162 110Z" fill="${ink}"/>${rows(10, () => `<ellipse cx="${f(66 + r() * 70)}" cy="${f(84 + r() * 18)}" rx="3" ry="2" fill="${hi}"/>`)}${gulls(r, hi)}`),
  butterfly: (r, ink) => `${rows(7, (i) => `<path d="M${18 + i * 27} 140 V${f(112 - r() * 14)}" stroke="#2f8f4e" stroke-width="2"/>${rows(4, (j) => `<circle cx="${18 + i * 27}" cy="${f(110 - r() * 14 + j * 6)}" r="3" fill="#b48cff"/>`)}`)}<g transform="rotate(-8 100 62)"><path d="M100 62 Q76 26 52 38 Q44 56 70 66 Q48 78 64 94 Q84 96 100 70Z M100 62 Q124 26 148 38 Q156 56 130 66 Q152 78 136 94 Q116 96 100 70Z" fill="#5fb4ff"/><path d="M100 62 Q76 26 52 38 Q44 56 70 66 Q48 78 64 94 Q84 96 100 70Z M100 62 Q124 26 148 38 Q156 56 130 66 Q152 78 136 94 Q116 96 100 70Z" fill="none" stroke="${ink}" stroke-width="3"/><path d="M100 50 V86" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><path d="M100 50 Q94 38 88 34 M100 50 Q106 38 112 34" stroke="${ink}" stroke-width="1.5" fill="none"/></g>`,
  porpoise: sea((_, ink) => [[70, 98, 1], [128, 104, 0.8]].map(([x, y, s]) => `<path d="M${x - 30 * s} ${y + 6} Q${x} ${y - 14 * s} ${x + 30 * s} ${y + 6}Z" fill="${ink}"/><path d="M${x - 4 * s} ${y - 6 * s} L${x + 2 * s} ${y - 18 * s} L${x + 10 * s} ${y - 6 * s}Z" fill="${ink}"/>`).join('')),
  whale: sea((_, ink, hi) => `<path d="M112 108 Q110 80 104 66 Q88 58 72 60 Q92 64 98 72 Q100 66 112 60 Q124 66 126 72 Q132 64 152 60 Q136 58 120 66 Q114 80 116 108Z" fill="${ink}"/><path d="M58 92 Q52 74 46 70 M58 92 Q58 72 58 66 M58 92 Q64 74 70 70" stroke="${hi}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/>`),
};

const MOTIFS: Record<CardCategory, Motif> = {
  landmark: city(() => ''),
  park: (r, ink, hi) => {
    let trees = '';
    for (let i = 0; i < 7; i++) {
      const x = 10 + r() * 180;
      const y = 80 + r() * 30;
      const s = 8 + r() * 10;
      trees += `<rect x="${f(x - 1.5)}" y="${f(y)}" width="3" height="${f(s)}" fill="${ink}"/><circle cx="${f(x)}" cy="${f(y - s * 0.3)}" r="${f(s)}" fill="${ink}" opacity="0.85"/>`;
    }
    return `<path d="M0 ${f(96 + r() * 10)} Q60 ${f(60 + r() * 20)} 120 ${f(92 + r() * 8)} T200 ${f(80 + r() * 16)} V140 H0Z" fill="${hi}" opacity="0.5"/>${trees}<path d="M0 118 Q100 96 200 120 V140 H0Z" fill="${ink}" opacity="0.7"/>`;
  },
  wildlife: sea((r, _, hi) => gulls(r, hi)),
  food: (r, ink, hi) => {
    let bits = '';
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 26;
      bits += `<circle cx="${f(100 + Math.cos(a) * d)}" cy="${f(80 + Math.sin(a) * d * 0.6)}" r="${f(5 + r() * 7)}" fill="${i % 2 ? ink : hi}" opacity="0.9"/>`;
    }
    const steam = [80, 100, 120].map((x) => `<path d="M${x} 46 q-8 -10 0 -18 q8 -8 0 -18" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.45" stroke-linecap="round"/>`).join('');
    return `<ellipse cx="100" cy="86" rx="66" ry="36" fill="#fff" opacity="0.25"/><ellipse cx="100" cy="84" rx="52" ry="27" fill="${ink}" opacity="0.35"/>${bits}${steam}`;
  },
  history: (r, ink, hi) => {
    const rays = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2 + r() * 0.05;
      return `<path d="M100 70 L${f(100 + Math.cos(a) * 140)} ${f(70 + Math.sin(a) * 140)} L${f(100 + Math.cos(a + 0.12) * 140)} ${f(70 + Math.sin(a + 0.12) * 140)}Z" fill="${hi}" opacity="0.18"/>`;
    }).join('');
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<line x1="${f(100 + Math.cos(a) * 30)}" y1="${f(70 + Math.sin(a) * 30)}" x2="${f(100 + Math.cos(a) * 36)}" y2="${f(70 + Math.sin(a) * 36)}" stroke="${ink}" stroke-width="2"/>`;
    }).join('');
    return `${rays}<circle cx="100" cy="70" r="40" fill="none" stroke="${ink}" stroke-width="3"/>${ticks}<path d="M100 44 L106 70 L100 96 L94 70Z" fill="${ink}"/>`;
  },
  culture: (r, ink, hi) => {
    const colors = ['#ff6a3d', '#ffc15e', '#7de0a6', '#5fb4ff', '#b48cff', hi];
    const arcs = colors.map((c, i) => `<path d="M${20 + i * 9} 140 A${80 - i * 9} ${80 - i * 9} 0 0 1 ${180 - i * 9} 140" stroke="${c}" stroke-width="8" fill="none" opacity="0.85"/>`).join('');
    let dots = '';
    for (let i = 0; i < 14; i++) dots += `<circle cx="${f(r() * W)}" cy="${f(r() * 70)}" r="${f(1.5 + r() * 3)}" fill="${ink}" opacity="0.6"/>`;
    return dots + arcs;
  },
  company: (r, ink, hi) => {
    let cells = '';
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) {
        const lit = r() < 0.25;
        cells += `<rect x="${32 + i * 24}" y="${22 + j * 24}" width="18" height="18" rx="4" fill="${lit ? hi : ink}" opacity="${lit ? 0.95 : 0.3}"/>`;
      }
    return cells;
  },
  tech: (r, ink, hi) => {
    let traces = '';
    for (let i = 0; i < 7; i++) {
      const y = 18 + i * 17;
      const x1 = 10 + r() * 40;
      const x2 = 70 + r() * 40;
      const y2 = y + (r() - 0.5) * 30;
      traces += `<path d="M${f(x1)} ${y} H${f(x2)} L${f(x2 + 12)} ${f(y2)} H190" stroke="${hi}" stroke-width="2" fill="none" opacity="0.7"/><circle cx="${f(x1)}" cy="${y}" r="3" fill="${hi}"/>`;
    }
    return `${traces}<rect x="78" y="44" width="44" height="44" rx="6" fill="${ink}"/><rect x="86" y="52" width="28" height="28" rx="3" fill="none" stroke="${hi}" stroke-width="2"/>`;
  },
  transit: (r, ink, hi) => {
    const rails = `<path d="M70 140 L96 54 M130 140 L104 54" stroke="${ink}" stroke-width="3"/>${[60, 80, 100, 120].map((y, i) => `<rect x="${f(96 - (140 - y) * 0.3 - 4)}" y="${y + 16}" width="${f(8 + (140 - y) * 0.6)}" height="${2 + i}" fill="${ink}" opacity="0.6"/>`).join('')}`;
    const x = 60 + r() * 40;
    const car = `<rect x="${f(x)}" y="40" width="64" height="38" rx="6" fill="${hi}"/><rect x="${f(x - 4)}" y="36" width="72" height="6" rx="3" fill="${ink}"/>${[0, 1, 2, 3].map((k) => `<rect x="${f(x + 6 + k * 14)}" y="47" width="10" height="13" rx="2" fill="${ink}" opacity="0.7"/>`).join('')}<line x1="${f(x + 32)}" y1="36" x2="${f(x + 32)}" y2="10" stroke="${ink}" stroke-width="2"/>`;
    return rails + car;
  },
  event: (r, ink, hi) => {
    let out = '';
    for (let b = 0; b < 3; b++) {
      const cx = 30 + r() * 140;
      const cy = 24 + r() * 50;
      const n = 12;
      const len = 14 + r() * 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out += `<line x1="${f(cx + Math.cos(a) * 4)}" y1="${f(cy + Math.sin(a) * 4)}" x2="${f(cx + Math.cos(a) * len)}" y2="${f(cy + Math.sin(a) * len)}" stroke="${b % 2 ? hi : '#fff'}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`;
      }
    }
    return `${out}${skyline(r, ink)}`;
  },
  hidden: (r, ink, hi) => {
    let stars = '';
    for (let i = 0; i < 22; i++) stars += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(0.6 + r() * 1.6)}" fill="${hi}" opacity="${f(0.4 + r() * 0.6)}"/>`;
    return `${stars}<circle cx="100" cy="58" r="20" fill="${ink}"/><path d="M90 66 L84 112 H116 L110 66Z" fill="${ink}"/>`;
  },
};

export function cardArt(card: Pick<CardDef, 'id' | 'category' | 'art'>): string {
  const meta = CATEGORY[card.category] ?? CATEGORY.hidden;
  const r = rng(hash(card.id));
  const [c1, c2] = meta.colors;
  const id = `g${hash(card.id).toString(36)}`;
  const sunX = f(30 + r() * 140);
  const sunY = f(20 + r() * 30);
  const angle = Math.round(r() * 360);
  const motif = (ART[card.art ?? ''] ?? MOTIFS[card.category] ?? MOTIFS.hidden)(r, 'rgba(12,16,22,0.78)', '#fff7e6');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/><circle cx="${sunX}" cy="${sunY}" r="${f(10 + r() * 14)}" fill="#fff" opacity="0.35"/>${motif}</svg>`;
}
