export interface MapView {
  cx: number;
  cz: number;
  scale: number;
  w: number;
  h: number;
}

export interface Extent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 3;

export function toScreen(v: MapView, x: number, z: number): { sx: number; sy: number } {
  return { sx: (x - v.cx) * v.scale + v.w / 2, sy: (z - v.cz) * v.scale + v.h / 2 };
}

export function toWorld(v: MapView, sx: number, sy: number): { x: number; z: number } {
  return { x: (sx - v.w / 2) / v.scale + v.cx, z: (sy - v.h / 2) / v.scale + v.cz };
}

export function clampView(v: MapView, e: Extent): MapView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
  const halfW = v.w / 2 / scale;
  const halfH = v.h / 2 / scale;
  const fit = (c: number, lo: number, hi: number, half: number) => (hi - lo < half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c)));
  return { ...v, scale, cx: fit(v.cx, e.minX, e.maxX, halfW), cz: fit(v.cz, e.minZ, e.maxZ, halfH) };
}

export function zoomAt(v: MapView, factor: number, sx: number, sy: number, e: Extent): MapView {
  const anchor = toWorld(v, sx, sy);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  return clampView({ ...v, scale, cx: anchor.x - (sx - v.w / 2) / scale, cz: anchor.z - (sy - v.h / 2) / scale }, e);
}

export function panBy(v: MapView, dx: number, dy: number, e: Extent): MapView {
  return clampView({ ...v, cx: v.cx - dx / v.scale, cz: v.cz - dy / v.scale }, e);
}

export function fitScale(w: number, h: number, e: Extent): number {
  return Math.min(w / (e.maxX - e.minX), h / (e.maxZ - e.minZ));
}

export const FIT_PAD = 56;
export const FIT_TOOLS = 52;

export function fitView(points: { x: number; z: number }[], w: number, h: number, e: Extent): MapView {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const scale = Math.min(Math.max(1, w - 2 * FIT_PAD - FIT_TOOLS) / Math.max(1200, x1 - x0), Math.max(1, h - 2 * FIT_PAD) / Math.max(1200, z1 - z0));
  return clampView({ cx: (x0 + x1) / 2 + FIT_TOOLS / 2 / scale, cz: (z0 + z1) / 2, scale, w, h }, e);
}

export function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

export function headingDeg(yaw: number): number {
  return ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
}

export function relativeDeg(bearing: number, heading: number): number {
  return ((bearing - heading + 540) % 360) - 180;
}

export function formatDistance(m: number, imperial: boolean): string {
  if (imperial) {
    const ft = m * 3.281;
    return ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609.34).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1)} km`;
}

export function edgePoint(dx: number, dy: number, halfW: number, halfH: number): { x: number; y: number; angle: number } {
  const angle = Math.atan2(dy, dx);
  const k = Math.min(halfW / Math.abs(Math.cos(angle) || 1e-9), halfH / Math.abs(Math.sin(angle) || 1e-9));
  return { x: Math.cos(angle) * k, y: Math.sin(angle) * k, angle };
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function avoidBoxes(x: number, y: number, boxes: Box[], f: Box, w: number, h: number): { x: number; y: number } {
  const hit = (px: number, py: number) => boxes.some((b) => px + f.right > b.left && px - f.left < b.right && py + f.bottom > b.top && py - f.top < b.bottom);
  if (!hit(x, y)) return { x, y };
  const free = boxes
    .flatMap((b) => [
      { x: b.left - f.right, y },
      { x: b.right + f.left, y },
      { x, y: b.top - f.bottom },
      { x, y: b.bottom + f.top },
    ])
    .filter((p) => p.x - f.left >= 0 && p.x + f.right <= w && p.y - f.top >= 0 && p.y + f.bottom <= h && !hit(p.x, p.y));
  free.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  return free[0] ?? { x, y };
}
