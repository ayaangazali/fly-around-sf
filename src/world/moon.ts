const RAD = Math.PI / 180;
const OBLIQUITY = 23.4397 * RAD;

export function daysSinceJ2000(date: Date): number {
  return date.getTime() / 86400000 - 10957.5;
}

export function siderealTime(date: Date, lon: number): number {
  const d = daysSinceJ2000(date);
  return (280.16 + 360.9856235 * d) * RAD + lon * RAD;
}

export function eclipticToEquatorial(l: number, b: number): { ra: number; dec: number } {
  return {
    ra: Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l)),
    dec: Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l)),
  };
}

export function horizontal(ra: number, dec: number, lst: number, lat: number): { altitude: number; azimuth: number } {
  const H = lst - ra;
  const phi = lat * RAD;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { altitude, azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI) };
}

export interface MoonPosition {
  altitude: number;
  azimuth: number;
  distance: number;
  ra: number;
  dec: number;
}

export function moonPosition(date: Date, lat: number, lon: number): MoonPosition {
  const d = daysSinceJ2000(date);
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const D = RAD * (297.85 + 12.190749 * d);
  const Ms = RAD * (357.529 + 0.98560028 * d);
  const l = L + RAD * (6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F));
  const b = RAD * (5.128 * Math.sin(F) + 0.28 * Math.sin(M + F) + 0.277 * Math.sin(M - F) + 0.173 * Math.sin(2 * D - F));
  const distance = 385001 - 20905 * Math.cos(M) - 3699 * Math.cos(2 * D - M) - 2956 * Math.cos(2 * D);
  const { ra, dec } = eclipticToEquatorial(l, b);
  const h = horizontal(ra, dec, siderealTime(date, lon), lat);
  const parallax = Math.asin(6378.14 / distance) * Math.cos(h.altitude);
  return { altitude: h.altitude - parallax, azimuth: h.azimuth, distance, ra, dec };
}

export function moonIllumination(date: Date): number {
  const d = daysSinceJ2000(date);
  const D = RAD * (297.85 + 12.190749 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const Ms = RAD * (357.529 + 0.98560028 * d);
  const i = Math.PI - D - RAD * (6.289 * Math.sin(M) - 2.1 * Math.sin(Ms) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) - 0.214 * Math.sin(2 * M) - 0.11 * Math.sin(D));
  return (1 + Math.cos(i)) / 2;
}

export function directionFrom(altitude: number, azimuth: number, out: { set(x: number, y: number, z: number): unknown }): void {
  out.set(Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude), -Math.cos(azimuth) * Math.cos(altitude));
}
