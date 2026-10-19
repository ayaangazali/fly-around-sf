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
