import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Landmark } from '../world';
import type { Game } from '../../game';
import { Site, circle, glow, paint, type LandmarkSource } from '../landmark-kit';

export const source: LandmarkSource = {
  name: 'San Francisco Ferry Building',
  lat: 37.795515,
  lon: -122.393469,
  url: 'https://www.openstreetmap.org/way/558731934',
};

export const TOP = 77;

export const FACTS = {
  towerHeight: 75,
  length: 201.7,
  width: 56.6,
  opened: 1898,
  sources: ['https://en.wikipedia.org/wiki/San_Francisco_Ferry_Building', 'https://www.openstreetmap.org/way/558731934'],
};

const YAW = 2.2078;
const pacific = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

export function clockAngles(date: Date): { hour: number; minute: number } {
  const parts = pacific.formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour: (((h % 12) + m / 60) / 12) * Math.PI * 2, minute: (m / 60) * Math.PI * 2 };
}

export const landmark: Landmark = {
  id: 'ferry-building',
  exclusions: [circle(37.795597, -122.393689, 12)],
  build(game: Game) {
    const site = new Site(game, 'ferry-building', source, YAW);
    const stone = glow('#ffe2b0', '#ddd6c6', 0.35);
    const trim = paint('#c9c1ae');
    const roof = paint('#8d8c86');
    const glassRoof = paint('#9fb3bd');
    const win = paint('#3f4a52');
    const L = FACTS.length;
    const W = FACTS.width;

    site.box(stone, L, 15, W, 0, -1, 0).box(trim, L + 1, 1, W + 1, 0, 14, 0);
    site.add(roof, new THREE.CylinderGeometry(W / 2 - 2, W / 2 - 2, L - 6, 3, 1, false, Math.PI / 2), 0, 15, 0, 0, 0, Math.PI / 2, 0.22, 1, 1);
    site.box(glassRoof, L - 12, 1.2, 6, 0, 20.2, 0);
    for (let i = -12; i <= 12; i++) {
      for (const side of [-1, 1]) {
        site.box(win, 4.2, 6.4, 0.4, i * 7.6, 2, side * (W / 2 + 0.05));
        site.box(win, 3, 3.2, 0.4, i * 7.6, 9.6, side * (W / 2 + 0.05));
      }
    }
    for (const end of [-1, 1]) site.box(stone, 10, 18, W - 6, end * (L / 2 - 5), -1, 0);

    const tz = -W / 2 + 7;
    const T = 13;
    site.box(stone, T, 46, T, 0, 0, tz).box(trim, T + 1.2, 1.2, T + 1.2, 0, 46, tz);
    site.box(stone, T - 1.5, 8, T - 1.5, 0, 47.2, tz).box(trim, T + 0.4, 1, T + 0.4, 0, 55.2, tz);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      for (let j = -1; j <= 1; j++) {
        const ox = dz * j * 3.2;
        const oz = -dx * j * 3.2;
        site.box(win, 1.6, 9, 0.5, ox + dx * (T / 2 + 0.05), 30, tz + oz + dz * (T / 2 + 0.05), a);
      }
    }
    site.box(stone, T - 3, 7, T - 3, 0, 56.2, tz).box(trim, T - 1.6, 0.8, T - 1.6, 0, 63.2, tz);
    site.box(stone, T - 6, 4.6, T - 6, 0, 64, tz);
    site.lathe(paint('#b9b4a4'), [[0, 0], [3.6, 0], [3.2, 2.2], [1.6, 4.6], [0.5, 6.4], [0.3, 7.6], [0, 7.8]], 0, 68.6, tz, 8);

    const face = glow('#fff6dc', '#f4f1e8', 1.4);
    const hands = new THREE.MeshBasicMaterial({ color: '#1c1c1c' });
    const pivots: THREE.Matrix4[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      site.add(face, new THREE.CircleGeometry(3.4, 24), dx * (T / 2 + 0.1), 50.6, tz + dz * (T / 2 + 0.1), a);
      pivots.push(new THREE.Matrix4().makeRotationY(a).setPosition(dx * (T / 2 + 0.25), 50.6, tz + dz * (T / 2 + 0.25)));
    }
    const handGeo = ({ hour, minute }: { hour: number; minute: number }) =>
      mergeGeometries(pivots.flatMap((m) => [new THREE.BoxGeometry(0.35, 2, 0.12).translate(0, 0.9, 0).rotateZ(-hour).applyMatrix4(m), new THREE.BoxGeometry(0.22, 3, 0.12).translate(0, 1.4, 0.06).rotateZ(-minute).applyMatrix4(m)]));
    const clock = new THREE.Mesh(handGeo(clockAngles(game.date())), hands);
    site.group.add(clock);
    const pos = clock.geometry.getAttribute('position') as THREE.BufferAttribute;
    let last = Math.floor(game.date().getTime() / 30000);
    clock.onBeforeRender = () => {
      const t = Math.floor(game.date().getTime() / 30000);
      if (t === last) return;
      last = t;
      pos.copyArray(handGeo(clockAngles(game.date())).getAttribute('position').array).needsUpdate = true;
    };

    site.solidBox(0, -1, 0, L, 16, W).solidBox(0, 14, 0, L - 6, 7, W - 6);
    site.solidBox(0, 0, tz, T + 1, 64, T + 1).solidCyl(0, 64, tz, 3.8, 12.4);
    site.finish();
  },
};
