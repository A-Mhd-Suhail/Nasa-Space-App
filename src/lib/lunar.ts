/** Lunar south polar stereographic projection used by the LOLA LDEM_75S product (spherical, R = 1737.4 km). */
export const R_MOON_M = 1_737_400;
export const MAP_EXTENT: [number, number, number, number] = [-457_440, -457_440, 457_440, 457_440];
export const COVERAGE_LAT = -75;

export function toXY(latDeg: number, lonEastDeg: number): [number, number] {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonEastDeg * Math.PI) / 180;
  const r = 2 * R_MOON_M * Math.tan(Math.PI / 4 + la / 2);
  return [r * Math.sin(lo), r * Math.cos(lo)];
}

export function toLatLon(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  const c = 2 * Math.atan(rho / (2 * R_MOON_M));
  const lat = -90 + (c * 180) / Math.PI;
  let lon = (Math.atan2(x, y) * 180) / Math.PI;
  lon = ((lon % 360) + 360) % 360;
  return { lat, lon };
}

export function fmtLat(lat: number, d = 4) {
  return `${Math.abs(lat).toFixed(d)}°${lat < 0 ? "S" : "N"}`;
}
export function fmtLon(lon: number, d = 4) {
  return `${lon.toFixed(d)}°E`;
}

/** Great-circle surface distance (m) on the reference sphere. */
export function surfaceDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const c = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return R_MOON_M * Math.acos(Math.min(1, Math.max(-1, c)));
}
