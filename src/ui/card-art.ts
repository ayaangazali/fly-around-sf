import type { CardCategory, CardDef } from '../content/types';

export const CATEGORY: Record<CardCategory, { label: string; icon: string; colors: [string, string] }> = {
  landmark: { label: 'Landmarks', icon: '🌉', colors: ['#ff6a3d', '#ffc15e'] },
  park: { label: 'Parks', icon: '🌳', colors: ['#2f8f4e', '#c6f07a'] },
  wildlife: { label: 'Wildlife', icon: '🦭', colors: ['#1f8f86', '#a6f0d6'] },
  food: { label: 'Food', icon: '🥐', colors: ['#e0663d', '#ffd36b'] },
  history: { label: 'History', icon: '📜', colors: ['#8a6440', '#f0d9a6'] },
  culture: { label: 'Culture', icon: '🎨', colors: ['#8f5cff', '#ff7eb6'] },
  company: { label: 'Companies', icon: '🏢', colors: ['#2f5fe0', '#7de0ff'] },
  tech: { label: 'Tech', icon: '💾', colors: ['#00a891', '#5fb4ff'] },
  transit: { label: 'Transit', icon: '🚋', colors: ['#b8322a', '#f4d03f'] },
  event: { label: 'Events', icon: '🎆', colors: ['#e0306f', '#ffc15e'] },
  hidden: { label: 'Hidden SF', icon: '🗝️', colors: ['#3a3f6c', '#9fa8ff'] },
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

const MOTIFS: Record<CardCategory, Motif> = {
  landmark: (r, ink, hi) => {
    const cx = 60 + r() * 80;
    const feature =
      r() < 0.5
        ? `<path d="M${f(cx)} 18 L${f(cx + 16)} 122 L${f(cx - 16)} 122Z" fill="${ink}"/>`
        : `<rect x="${f(cx - 22)}" y="30" width="6" height="92" fill="${hi}"/><rect x="${f(cx + 16)}" y="30" width="6" height="92" fill="${hi}"/><path d="M-10 92 Q${f(cx - 19)} 30 ${f(cx - 19)} 30 Q${f(cx)} 80 ${f(cx + 19)} 30 Q${f(cx + 19)} 30 210 92" stroke="${hi}" stroke-width="2" fill="none"/><rect x="-10" y="96" width="220" height="4" fill="${hi}"/>`;
    return `${skyline(r, ink)}${feature}<rect y="${f(70 + r() * 20)}" width="${W}" height="16" fill="#fff" opacity="0.18"/>`;
  },
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
  wildlife: (r, ink, hi) => {
    let waves = '';
    for (let i = 0; i < 4; i++) {
      const y = 82 + i * 14;
      waves += `<path d="M0 ${y} ${Array.from({ length: 6 }, (_, k) => `Q${k * 40 + 20} ${f(y - 8 - r() * 6)} ${k * 40 + 40} ${y}`).join(' ')} V140 H0Z" fill="${ink}" opacity="${f(0.25 + i * 0.15)}"/>`;
    }
    let birds = '';
    for (let i = 0; i < 4; i++) {
      const x = 30 + r() * 140;
      const y = 22 + r() * 36;
      const s = 5 + r() * 6;
      birds += `<path d="M${f(x - s)} ${f(y - s * 0.4)} Q${f(x - s / 2)} ${f(y - s * 0.8)} ${f(x)} ${f(y)} Q${f(x + s / 2)} ${f(y - s * 0.8)} ${f(x + s)} ${f(y - s * 0.4)}" stroke="${hi}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    }
    return waves + birds;
  },
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

export function cardArt(card: Pick<CardDef, 'id' | 'category'>): string {
  const meta = CATEGORY[card.category] ?? CATEGORY.hidden;
  const r = rng(hash(card.id));
  const [c1, c2] = meta.colors;
  const id = `g${hash(card.id).toString(36)}`;
  const sunX = f(30 + r() * 140);
  const sunY = f(20 + r() * 30);
  const angle = Math.round(r() * 360);
  const motif = (MOTIFS[card.category] ?? MOTIFS.hidden)(r, 'rgba(12,16,22,0.78)', '#fff7e6');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/><circle cx="${sunX}" cy="${sunY}" r="${f(10 + r() * 14)}" fill="#fff" opacity="0.35"/>${motif}</svg>`;
}
