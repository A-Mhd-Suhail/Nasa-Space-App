import { add, azElOf, bodyToEnu, enuDirection, enuToBody, horizonElevationAtAltitude, MOON_SIDEREAL_RATE_RAD_S, MU_MOON_KM3_S2, norm, R_MOON_KM, scale, segmentHitsMoon, sub, unit, type Vec3 } from "./geometry";

/**
 * Communication geometry: direct Earth, lander -> relay, relay -> Earth. These are GEOMETRIC line-of-sight checks.
 * They are not RF link availability; see `linkMarginDb` for the separate, optional, user-assumption-driven RF estimate.
 */
export type HorizonSample = { azimuthDeg: number; elevationDeg: number | null; blockingDistanceM: number | null; status?: string };
export type HorizonProfile = { samples: HorizonSample[]; observerRadiusM: number; stepDeg: number };

/** Horizon (deg) at an azimuth, interpolated; null when the terrain is not known there. */
export function horizonAt(p: HorizonProfile, azDeg: number): { elevationDeg: number; blockingDistanceM: number } | null {
  const n = p.samples.length;
  if (!n) return null;
  const x = (((azDeg % 360) + 360) % 360) / p.stepDeg;
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const f = x - Math.floor(x);
  const a = p.samples[i0];
  const b = p.samples[i1];
  if (a.elevationDeg == null || b.elevationDeg == null || a.blockingDistanceM == null || b.blockingDistanceM == null) return null;
  return { elevationDeg: (1 - f) * a.elevationDeg + f * b.elevationDeg, blockingDistanceM: Math.min(a.blockingDistanceM, b.blockingDistanceM) };
}

export type Visibility = "visible" | "blocked" | "unknown";
export type SightResult = { state: Visibility; azimuthDeg: number; elevationDeg: number; horizonDeg: number | null; clearanceDeg: number | null; reason: string };

/** Sight line from the lander (ENU position `landerEnuM` relative to the target site) toward a direction given by azimuth/elevation. */
export function terrainSight(args: { azDeg: number; elDeg: number; horizon: HorizonProfile | null; altitudeM: number; maskDeg?: number }): SightResult {
  const { azDeg, elDeg, horizon, altitudeM } = args;
  const mask = args.maskDeg ?? 0;
  if (elDeg < 0 && !horizon) return { state: "blocked", azimuthDeg: azDeg, elevationDeg: elDeg, horizonDeg: null, clearanceDeg: null, reason: "below the local horizontal plane" };
  const h = horizon ? horizonAt(horizon, azDeg) : null;
  if (!h) {
    // No terrain data in that direction: the geometric horizon alone cannot prove a clear line of sight.
    if (elDeg < Math.max(0, mask)) return { state: "blocked", azimuthDeg: azDeg, elevationDeg: elDeg, horizonDeg: null, clearanceDeg: null, reason: "below the geometric horizon / antenna mask" };
    return { state: "unknown", azimuthDeg: azDeg, elevationDeg: elDeg, horizonDeg: null, clearanceDeg: null, reason: "terrain data does not cover this direction; clear sky is not assumed" };
  }
  const hz = horizonElevationAtAltitude({ horizonDeg: h.elevationDeg, blockingDistanceM: h.blockingDistanceM, observerRadiusM: horizon!.observerRadiusM, altitudeM });
  const limit = Math.max(hz, mask, 0 - 1e-9);
  const clearance = elDeg - limit;
  if (clearance >= 0) return { state: "visible", azimuthDeg: azDeg, elevationDeg: elDeg, horizonDeg: hz, clearanceDeg: clearance, reason: `${elDeg.toFixed(1)}° is above the terrain/mask limit of ${limit.toFixed(1)}°` };
  const why = hz >= mask && hz > elDeg ? "terrain blocks the path" : "below the antenna elevation mask";
  return { state: "blocked", azimuthDeg: azDeg, elevationDeg: elDeg, horizonDeg: hz, clearanceDeg: clearance, reason: `${why}: ${elDeg.toFixed(1)}° vs limit ${limit.toFixed(1)}°` };
}

/* ------------------------------ relay orbit ------------------------------ */
export type RelayOrbit = { altitudeKm: number; inclinationDeg: number; raanDeg: number; phaseDeg: number };
export const RELAY_PRESETS: Record<string, { label: string; orbit: RelayOrbit }> = {
  polar100: { label: "Polar circular, 100 km", orbit: { altitudeKm: 100, inclinationDeg: 90, raanDeg: 0, phaseDeg: 0 } },
  polar500: { label: "Polar circular, 500 km", orbit: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 0 } },
  polar2000: { label: "Polar circular, 2,000 km", orbit: { altitudeKm: 2000, inclinationDeg: 90, raanDeg: 0, phaseDeg: 0 } },
};
export const orbitPeriodS = (altitudeKm: number) => 2 * Math.PI * Math.sqrt(Math.pow(R_MOON_KM + altitudeKm, 3) / MU_MOON_KM3_S2);

/**
 * Body-fixed position (km) of a circular-orbit relay at time t seconds after the epoch. The inertial orbit is rotated into the
 * Moon-fixed frame by the Moon's rotation (27.32 d), which matters little over a descent but is included.
 * Eccentric / halo orbits (for example NRHO) are not modelled.
 */
export function relayPosition(o: RelayOrbit, tS: number, moonRotationRad = MOON_SIDEREAL_RATE_RAD_S): Vec3 {
  const a = R_MOON_KM + o.altitudeKm;
  const n = Math.sqrt(MU_MOON_KM3_S2 / (a * a * a));
  const u = (o.phaseDeg * Math.PI) / 180 + n * tS;
  const i = (o.inclinationDeg * Math.PI) / 180;
  const w = (o.raanDeg * Math.PI) / 180;
  // perifocal -> inertial for a circular orbit
  const x = a * (Math.cos(w) * Math.cos(u) - Math.sin(w) * Math.sin(u) * Math.cos(i));
  const y = a * (Math.sin(w) * Math.cos(u) + Math.cos(w) * Math.sin(u) * Math.cos(i));
  const z = a * (Math.sin(u) * Math.sin(i));
  const th = -moonRotationRad * tS;
  return [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th), z];
}

export type CommInputs = {
  siteLatDeg: number;
  siteLonEastDeg: number;
  siteHeightM: number;
  landerEnuM: Vec3; // lander position relative to the site, local ENU (m)
  earth: { azDeg: number; elDeg: number; distanceKm: number } | null; // null: no ephemeris
  horizon: HorizonProfile | null;
  relay: RelayOrbit;
  tS: number;
  maskDeg: number;
  forcedBlackout?: boolean;
};
export type CommState = {
  direct: SightResult & { forced: boolean; effective: "available" | "lost" | "unknown" };
  landerToRelay: SightResult;
  relayToEarth: { state: Visibility; clearanceKm: number | null; reason: string };
  relay: { available: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN"; reason: string };
  relayBody: Vec3;
  relayRangeKm: number;
};

/** Both relay legs must hold at the same instant for a geometric relay path to exist. */
export function evaluateComm(i: CommInputs): CommState {
  const altitudeM = Math.max(0, i.landerEnuM[2]);
  const direct0 = i.earth
    ? terrainSight({ azDeg: i.earth.azDeg, elDeg: i.earth.elDeg, horizon: i.horizon, altitudeM, maskDeg: i.maskDeg })
    : ({ state: "unknown", azimuthDeg: 0, elevationDeg: 0, horizonDeg: null, clearanceDeg: null, reason: "no ephemeris available" } as SightResult);
  const forced = !!i.forcedBlackout;
  const effective = forced ? "lost" : direct0.state === "visible" ? "available" : direct0.state === "blocked" ? "lost" : "unknown";
  const direct = { ...direct0, reason: forced ? "simulated blackout injected by the user (antenna/pointing anomaly); terrain geometry would be: " + direct0.reason : direct0.reason, forced, effective } as CommState["direct"];

  // lander = site "up" * (R + h + z) + east * x + north * y   (flat local offsets; valid over the few-km terminal-descent area)
  const landerBody = enuToBody([i.landerEnuM[0] / 1000, i.landerEnuM[1] / 1000, R_MOON_KM + (i.siteHeightM + i.landerEnuM[2]) / 1000], i.siteLatDeg, i.siteLonEastDeg);
  const relayBody = relayPosition(i.relay, i.tS);
  const toRelayEnu = bodyToEnu(sub(relayBody, landerBody), i.siteLatDeg, i.siteLonEastDeg);
  const ae = azElOf(toRelayEnu);
  const lr = terrainSight({ azDeg: ae.azDeg, elDeg: ae.elDeg, horizon: i.horizon, altitudeM, maskDeg: 0 });

  let re: CommState["relayToEarth"];
  if (!i.earth) re = { state: "unknown", clearanceKm: null, reason: "no ephemeris available" };
  else {
    const earthDirBody = enuToBody(enuDirection(i.earth.azDeg, i.earth.elDeg), i.siteLatDeg, i.siteLonEastDeg);
    const hit = segmentHitsMoon(relayBody, earthDirBody, i.earth.distanceKm);
    const t = Math.max(0, -(relayBody[0] * earthDirBody[0] + relayBody[1] * earthDirBody[1] + relayBody[2] * earthDirBody[2]));
    const closest = norm(add(relayBody, scale(earthDirBody, Math.min(t, i.earth.distanceKm))));
    re = hit
      ? { state: "blocked", clearanceKm: closest - R_MOON_KM, reason: `the Moon itself is in the way (line passes ${(R_MOON_KM - closest).toFixed(0)} km inside the surface)` }
      : { state: "visible", clearanceKm: closest - R_MOON_KM, reason: `clear of the Moon by ${(closest - R_MOON_KM).toFixed(0)} km` };
  }
  const both = lr.state === "visible" && re.state === "visible";
  const anyUnknown = lr.state === "unknown" || re.state === "unknown";
  const relay: CommState["relay"] = both
    ? { available: "AVAILABLE", reason: "the relay sees both the lander and Earth at this instant (geometric opportunity only; RF not assessed)" }
    : anyUnknown && lr.state !== "blocked" && re.state !== "blocked"
      ? { available: "UNKNOWN", reason: "a required leg could not be evaluated from the data available" }
      : { available: "UNAVAILABLE", reason: lr.state === "blocked" && re.state === "blocked" ? "neither leg is visible" : lr.state === "blocked" ? "the relay cannot see the lander (below its terrain horizon)" : "the relay cannot see Earth (hidden behind the Moon)" };
  return { direct, landerToRelay: lr, relayToEarth: re, relay, relayBody, relayRangeKm: norm(sub(relayBody, landerBody)) };
}

/** Sample the communication state over a window to produce visibility windows. */
export function commWindows(input: Omit<CommInputs, "tS">, t0: number, t1: number, stepS: number, pick: (c: CommState) => boolean): { startS: number; endS: number }[] {
  const out: { startS: number; endS: number }[] = [];
  let open: number | null = null;
  for (let t = t0; t <= t1 + 1e-9; t += stepS) {
    const v = pick(evaluateComm({ ...input, tS: t }));
    if (v && open === null) open = t;
    if (!v && open !== null) {
      out.push({ startS: open, endS: t });
      open = null;
    }
  }
  if (open !== null) out.push({ startS: open, endS: t1 });
  return out;
}

/** Free-space link margin (dB) from user-supplied assumptions only; nothing here is a default mission value. */
export function linkMarginDb(a: { frequencyHz: number; eirpDbw: number; gOverTdbK: number; dataRateBps: number; requiredEbN0Db: number; otherLossesDb: number; distanceKm: number }): number {
  const fspl = 20 * Math.log10((4 * Math.PI * a.distanceKm * 1000 * a.frequencyHz) / 299_792_458);
  const cn0 = a.eirpDbw - fspl - a.otherLossesDb + a.gOverTdbK + 228.6;
  return cn0 - 10 * Math.log10(a.dataRateBps) - a.requiredEbN0Db;
}
export { unit };
