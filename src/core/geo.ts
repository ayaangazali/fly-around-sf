export const ORIGIN = { lat: 37.7675, lon: -122.43 } as const;

export const BOUNDS = { south: 37.695, north: 37.84, west: -122.53, east: -122.33 } as const;

const phi = (ORIGIN.lat * Math.PI) / 180;
export const M_PER_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
export const M_PER_DEG_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);

export function toLocal(lat: number, lon: number): { x: number; z: number } {
  return { x: (lon - ORIGIN.lon) * M_PER_DEG_LON, z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT };
}

export function toGeo(x: number, z: number): { lat: number; lon: number } {
  return { lat: ORIGIN.lat - z / M_PER_DEG_LAT, lon: ORIGIN.lon + x / M_PER_DEG_LON };
}

export const EXTENT = (() => {
  const sw = toLocal(BOUNDS.south, BOUNDS.west);
  const ne = toLocal(BOUNDS.north, BOUNDS.east);
  return { minX: sw.x, maxX: ne.x, minZ: ne.z, maxZ: sw.z };
})();

export function inBounds(lat: number, lon: number): boolean {
  return lat >= BOUNDS.south && lat <= BOUNDS.north && lon >= BOUNDS.west && lon <= BOUNDS.east;
}

export function distance2d(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
