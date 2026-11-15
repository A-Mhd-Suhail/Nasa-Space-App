/**
 * Geometry for the contingency simulator. Everything is deterministic, pure and unit-tested.
 * Frames: "body" = Moon-fixed Cartesian (km, MOON_ME-aligned); "ENU" = local east/north/up at a lunar surface site.
 * Angles in degrees at the API surface, radians internally.
 */
export type Vec3 = [number, number, number];

export const R_MOON_KM = 1737.4; // IAU spherical reference radius used throughout MoonNav
export const MU_MOON_KM3_S2 = 4902.800066; // lunar GM
export const MOON_SIDEREAL_RATE_RAD_S = (2 * Math.PI) / (27.321661 * 86400);
export const G0 = 9.80665;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n === 0 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};
export const wrap360 = (d: number) => ((d % 360) + 360) % 360;
export const angDiffDeg = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Unit vectors east, north, up of the local frame at (lat, lon), expressed in the body frame. */
export function enuBasis(latDeg: number, lonEastDeg: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const la = latDeg * D2R;
  const lo = lonEastDeg * D2R;
  return {
    e: [-Math.sin(lo), Math.cos(lo), 0],
    n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
    u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
  };
}

/** Body-frame position (km) of a point at (lat, lon) and radial height h (m) above the reference sphere. */
export function bodyPosition(latDeg: number, lonEastDeg: number, heightM: number): Vec3 {
  const { u } = enuBasis(latDeg, lonEastDeg);
  return scale(u, R_MOON_KM + heightM / 1000);
}

/** Unit direction (ENU components) for an azimuth (clockwise from north) and elevation. */
export function enuDirection(azDeg: number, elDeg: number): Vec3 {
  const a = azDeg * D2R;
  const e = elDeg * D2R;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

export function azElOf(enu: Vec3): { azDeg: number; elDeg: number; range: number } {
  const r = norm(enu);
  if (r === 0) return { azDeg: 0, elDeg: 90, range: 0 };
  return { azDeg: wrap360(Math.atan2(enu[0], enu[1]) * R2D), elDeg: Math.asin(Math.max(-1, Math.min(1, enu[2] / r))) * R2D, range: r };
}

export function enuToBody(v: Vec3, latDeg: number, lonEastDeg: number): Vec3 {
  const b = enuBasis(latDeg, lonEastDeg);
  return add(add(scale(b.e, v[0]), scale(b.n, v[1])), scale(b.u, v[2]));
}
export function bodyToEnu(v: Vec3, latDeg: number, lonEastDeg: number): Vec3 {
  const b = enuBasis(latDeg, lonEastDeg);
  return [dot(v, b.e), dot(v, b.n), dot(v, b.u)];
}

/** Stereographic map-plane offset (m, as returned by the terrain screening grids) -> local east/north offset (m). */
export function mapOffsetToEnu(dx: number, dy: number, lonEastDeg: number): [number, number] {
  const L = lonEastDeg * D2R;
  return [dx * Math.cos(L) - dy * Math.sin(L), dx * Math.sin(L) + dy * Math.cos(L)];
}
export function enuToMapOffset(e: number, n: number, lonEastDeg: number): [number, number] {
  const L = lonEastDeg * D2R;
  return [e * Math.cos(L) + n * Math.sin(L), -e * Math.sin(L) + n * Math.cos(L)];
}

/**
 * True when the segment from `from` along unit `dir` for `length` (km) passes through the Moon's sphere
 * (occultation). A tangent ray (clearance exactly zero) is not blocked.
 */
export function segmentHitsMoon(from: Vec3, dir: Vec3, lengthKm: number, radiusKm = R_MOON_KM): boolean {
  const t = Math.max(0, Math.min(lengthKm, -dot(from, dir)));
  const p = add(from, scale(dir, t));
  return norm(p) < radiusKm;
}

/** Elevation (deg) of the horizon-defining terrain point as seen from a raised observer. Exact for the same blocking point. */
export function horizonElevationAtAltitude(args: { horizonDeg: number; blockingDistanceM: number; observerRadiusM: number; altitudeM: number }): number {
  const { horizonDeg, blockingDistanceM, observerRadiusM, altitudeM } = args;
  if (altitudeM <= 0 || !(blockingDistanceM > 0)) return horizonDeg;
  const delta = blockingDistanceM / observerRadiusM;
  const th = horizonDeg * D2R;
  const denom = Math.cos(delta) - Math.tan(th) * Math.sin(delta);
  if (denom <= 0) return horizonDeg; // degenerate geometry: keep the measured angle (conservative)
  const rs = observerRadiusM / denom; // radius of the blocking point
  const up = rs * Math.cos(delta) - (observerRadiusM + altitudeM);
  return Math.atan2(up, rs * Math.sin(delta)) * R2D;
}
