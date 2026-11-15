/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped JSON from the science service; every field is validated before use */
import { horizonAt, type HorizonProfile } from "./relay";
import { enuToMapOffset, mapOffsetToEnu } from "./geometry";
import { toLatLon, toXY } from "../lunar";
import type { SiteCandidate } from "./sites";

/**
 * The environment the simulator runs in: where Earth is and what the terrain horizon looks like at the landing target.
 * "spice" means it came from MoonNav's SPICE pipeline (with the live JPL Horizons cross-check attached); "illustrative"
 * means the user is exploring with hand-set angles because no ephemeris was available - it is never labelled as measured.
 */
export type Environment = {
  source: "spice" | "illustrative";
  utc: string | null;
  site: { latDeg: number; lonEastDeg: number; heightM: number };
  earth: { azDeg: number; elDeg: number; distanceKm: number } | null;
  sun: { azDeg: number; elDeg: number } | null;
  horizon: HorizonProfile | null;
  notes: string[];
  provenance: { ephemeris: string; terrain: string; retrievedAtUtc: string | null };
  horizonsCheck: { status: "pass" | "warn" | "fail" | "unavailable"; maxSeparationDeg: number | null; detail: string } | null;
};

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Validate a server payload. Incomplete or out-of-range ephemerides are rejected, never patched up. */
export function parseEnvironment(raw: unknown): { ok: true; env: Environment } | { ok: false; error: string } {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== "object") return { ok: false, error: "empty environment response" };
  const lat = num(r.site?.latitudeDeg);
  const lon = num(r.site?.longitudeEastDeg);
  if (lat == null || lon == null || lat > -75 || lat < -90) return { ok: false, error: "site coordinates missing or outside the 75°S-90°S coverage" };
  const e = r.bodies?.earth ?? r.earth;
  const s = r.bodies?.sun ?? r.sun;
  const ea = num(e?.azimuthDeg), ee = num(e?.elevationDeg), ed = num(e?.distanceKm);
  if (ea == null || ee == null || ed == null) return { ok: false, error: "Earth ephemeris incomplete (azimuth, elevation and distance are all required)" };
  if (ee < -90 || ee > 90 || ea < 0 || ea >= 360.0001) return { ok: false, error: "Earth azimuth/elevation out of range" };
  if (ed < 300_000 || ed > 500_000) return { ok: false, error: "Earth distance outside the physically possible 300,000-500,000 km" };
  const sa = num(s?.azimuthDeg), se = num(s?.elevationDeg);
  let horizon: HorizonProfile | null = null;
  const h = r.horizon;
  if (h && Array.isArray(h.azimuthsDeg) && Array.isArray(h.elevationDeg) && Array.isArray(h.blockingDistanceM) && h.azimuthsDeg.length >= 36 && h.elevationDeg.length === h.azimuthsDeg.length && h.blockingDistanceM.length === h.azimuthsDeg.length) {
    const rad = num(h.observerRadiusM);
    if (rad && rad > 1_700_000 && rad < 1_800_000) {
      horizon = {
        observerRadiusM: rad,
        stepDeg: 360 / h.azimuthsDeg.length,
        samples: h.azimuthsDeg.map((az: number, i: number) => ({ azimuthDeg: az, elevationDeg: num(h.elevationDeg[i]), blockingDistanceM: num(h.blockingDistanceM[i]), status: h.status?.[i] })),
      };
    }
  }
  const hc = r.horizonsCheck;
  return {
    ok: true,
    env: {
      source: "spice",
      utc: typeof r.utc === "string" ? r.utc : null,
      site: { latDeg: lat, lonEastDeg: lon, heightM: num(r.site?.heightM) ?? 0 },
      earth: { azDeg: ea, elDeg: ee, distanceKm: ed },
      sun: sa != null && se != null ? { azDeg: sa, elDeg: se } : null,
      horizon,
      notes: Array.isArray(r.notes) ? r.notes.filter((x: unknown) => typeof x === "string") : [],
      provenance: { ephemeris: String(r.provenance?.ephemeris ?? "NAIF SPICE (spkcpo, light-time + stellar aberration, MOON_ME)"), terrain: String(r.provenance?.terrain ?? "LOLA LDEM_75S 240 m"), retrievedAtUtc: typeof r.retrievedAtUtc === "string" ? r.retrievedAtUtc : null },
      horizonsCheck: hc && typeof hc === "object" ? { status: hc.status ?? "unavailable", maxSeparationDeg: num(hc.maxSeparationDeg), detail: String(hc.detail ?? "") } : null,
    },
  };
}

/** Hand-set geometry for when no ephemeris can be had. Clearly illustrative; no terrain horizon (so terrain blocking cannot be asserted). */
export function illustrativeEnvironment(site: { latDeg: number; lonEastDeg: number; heightM?: number }, earth: { azDeg: number; elDeg: number }, flatHorizonDeg?: number): Environment {
  const horizon: HorizonProfile | null = flatHorizonDeg === undefined ? null : { observerRadiusM: 1_737_400 + (site.heightM ?? 0) + 2, stepDeg: 0.5, samples: Array.from({ length: 720 }, (_, i) => ({ azimuthDeg: i * 0.5, elevationDeg: flatHorizonDeg, blockingDistanceM: 5000 })) };
  return {
    source: "illustrative",
    utc: null,
    site: { latDeg: site.latDeg, lonEastDeg: site.lonEastDeg, heightM: site.heightM ?? 0 },
    earth: { azDeg: earth.azDeg, elDeg: earth.elDeg, distanceKm: 384_400 },
    sun: null,
    horizon,
    notes: [horizon ? `ILLUSTRATIVE: Earth angles and a flat ${flatHorizonDeg}° terrain horizon were set by hand; they are not an ephemeris or LOLA result.` : "ILLUSTRATIVE: Earth angles were set by hand; they are not an ephemeris result and no terrain horizon is available."],
    provenance: { ephemeris: "none (user-set angles)", terrain: horizon ? "none (user-set flat horizon)" : "none", retrievedAtUtc: null },
    horizonsCheck: null,
  };
}

/* ---------------------- candidate sites from the real terrain screening ---------------------- */
type Hazards = { center: { latitudeDeg: number; longitudeEastDeg: number }; grid: { spacingM: number; size: number; halfSizeM: number }; heightM: (number | null)[][]; slopeDeg: (number | null)[][]; roughnessM: (number | null)[][]; hazardClass: number[][]; rimRidge: number[][]; finestResolutionM?: number };

/**
 * Pick well-separated low-slope cells from a terrain hazard grid (LOLA via MoonNav's screening service) as candidate zones.
 * Cells with no data are skipped (they cannot be candidates), but their share is reported so an empty area is not mistaken for safe.
 */
export function candidatesFromHazards(h: Hazards, opts: { maxCount?: number; minSeparationM?: number; maxRangeM?: number; targetHeightM?: number } = {}): { candidates: SiteCandidate[]; unknownFraction: number } {
  const n = h.grid.size;
  const s = h.grid.spacingM;
  const half = Math.floor(n / 2);
  const [cx, cy] = toXY(h.center.latitudeDeg, h.center.longitudeEastDeg);
  type Cell = { i: number; j: number; slope: number; rough: number; ex: number; ny: number };
  const cells: Cell[] = [];
  let unknown = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const sl = h.slopeDeg[i]?.[j];
      const ro = h.roughnessM[i]?.[j];
      if (sl == null || ro == null) {
        unknown++;
        continue;
      }
      const dx = (j - half) * s;
      const dy = -(i - half) * s;
      const [e, nn] = mapOffsetToEnu(dx, dy, h.center.longitudeEastDeg);
      if (Math.hypot(e, nn) > (opts.maxRangeM ?? h.grid.halfSizeM)) continue;
      cells.push({ i, j, slope: sl, rough: ro, ex: e, ny: nn });
    }
  }
  cells.sort((a, b) => a.slope + 2 * a.rough - (b.slope + 2 * b.rough));
  const picked: Cell[] = [];
  for (const c of cells) {
    if (picked.length >= (opts.maxCount ?? 6)) break;
    if (picked.every((p) => Math.hypot(p.ex - c.ex, p.ny - c.ny) >= (opts.minSeparationM ?? 600))) picked.push(c);
  }
  const out: SiteCandidate[] = picked.map((c, k) => {
    const dx = (c.j - half) * s;
    const dy = -(c.i - half) * s;
    const { lat, lon } = toLatLon(cx + dx, cy + dy);
    const hz = h.heightM[c.i]?.[c.j];
    return {
      id: `alt-${k + 1}`,
      label: `Zone ${String.fromCharCode(65 + k)}`,
      enuM: [c.ex, c.ny, hz != null && opts.targetHeightM != null ? hz - opts.targetHeightM : 0],
      latDeg: lat,
      lonEastDeg: lon,
      heightM: hz ?? null,
      slopeDeg: c.slope,
      roughnessM: c.rough,
      hazardClass: (h.hazardClass[c.i]?.[c.j] ?? null) as SiteCandidate["hazardClass"],
      rimRidge: h.rimRidge[c.i]?.[c.j] === 1,
      sunPct: null,
      earthPct: null,
      permanentShadow: null,
      resolutionM: h.finestResolutionM ?? s,
    };
  });
  return { candidates: out, unknownFraction: unknown / (n * n) };
}
export { enuToMapOffset, horizonAt };
