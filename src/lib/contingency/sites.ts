import { aimFor, solveRecovery, type Recovery, type Vehicle } from "./physics";
import type { Vec3 } from "./geometry";

export type SiteCandidate = {
  id: string;
  label: string;
  enuM: Vec3; // offset from the original landing target; z = height difference (m)
  latDeg: number;
  lonEastDeg: number;
  heightM: number | null;
  slopeDeg: number | null;
  roughnessM: number | null;
  hazardClass: -1 | 0 | 1 | 2 | null; // -1 unknown, 0 ok, 1 caution, 2 exceeds
  rimRidge: boolean | null;
  sunPct: number | null; // long-term average, LOLA team product
  earthPct: number | null;
  permanentShadow: boolean | null;
  resolutionM: number | null;
};
export type Check = { id: string; label: string; mandatory: boolean; status: "pass" | "fail" | "unknown"; detail: string };
export type SiteConfig = { slopeMaxDeg: number; roughnessMaxM: number; minSunPct: number; minEarthPct: number; requireSunEarth: boolean };
export const DEFAULT_SITE_CONFIG: SiteConfig = { slopeMaxDeg: 15, roughnessMaxM: 1.5, minSunPct: 20, minEarthPct: 10, requireSunEarth: true };

export type SiteAssessment = {
  candidate: SiteCandidate;
  distanceFromTouchdownM: number | null;
  distanceFromTargetM: number;
  checks: Check[];
  verdict: "PASS" | "FAIL" | "UNVERIFIED";
  score: number | null; // only meaningful for PASS
  breakdown: { name: string; points: number; max: number }[];
  recovery: Recovery;
};
export type SiteEvaluation = { assessments: SiteAssessment[]; recommended: SiteAssessment | null; headline: string; note: string };

const fin = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

function checks(c: SiteCandidate, rec: Recovery, cfg: SiteConfig): Check[] {
  const out: Check[] = [];
  out.push(
    fin(c.slopeDeg) && fin(c.heightM)
      ? { id: "data", label: "Terrain data present", mandatory: true, status: "pass", detail: `heights known at ${c.resolutionM ? `${c.resolutionM.toFixed(0)} m` : "unknown"} resolution` }
      : { id: "data", label: "Terrain data present", mandatory: true, status: "unknown", detail: "no usable LOLA height/slope for this cell; nothing is assumed" },
  );
  out.push(
    fin(c.slopeDeg)
      ? { id: "slope", label: `Slope ≤ ${cfg.slopeMaxDeg}°`, mandatory: true, status: c.slopeDeg <= cfg.slopeMaxDeg ? "pass" : "fail", detail: `${c.slopeDeg.toFixed(1)}° (central differences, 2-cell baseline)` }
      : { id: "slope", label: `Slope ≤ ${cfg.slopeMaxDeg}°`, mandatory: true, status: "unknown", detail: "slope unavailable" },
  );
  out.push(
    fin(c.roughnessM)
      ? { id: "roughness", label: `Roughness ≤ ${cfg.roughnessMaxM} m`, mandatory: true, status: c.roughnessM <= cfg.roughnessMaxM ? "pass" : "fail", detail: `${c.roughnessM.toFixed(2)} m RMS over the DEM cell (boulders below the cell size are not assessed)` }
      : { id: "roughness", label: `Roughness ≤ ${cfg.roughnessMaxM} m`, mandatory: true, status: "unknown", detail: "roughness unavailable" },
  );
  out.push({ id: "reach", label: "Reachable with remaining divert capability", mandatory: true, status: rec.feasible ? "pass" : "fail", detail: rec.feasible ? rec.summary : rec.summary.replace("RECOVERY NOT FEASIBLE: ", "") });
  if (c.rimRidge) out.push({ id: "rim", label: "No crater rim / ridge signature", mandatory: false, status: "fail", detail: "advisory: steep convex terrain in the cell" });
  const sunStatus = (): Check => {
    if (c.permanentShadow === true) return { id: "sun", label: `Sunlight ≥ ${cfg.minSunPct}%`, mandatory: cfg.requireSunEarth, status: "fail", detail: "permanently shadowed region (LOLA team product)" };
    if (!fin(c.sunPct)) return { id: "sun", label: `Sunlight ≥ ${cfg.minSunPct}%`, mandatory: cfg.requireSunEarth, status: "unknown", detail: "no illumination data" };
    return { id: "sun", label: `Sunlight ≥ ${cfg.minSunPct}%`, mandatory: cfg.requireSunEarth, status: c.sunPct >= cfg.minSunPct ? "pass" : "fail", detail: `${c.sunPct.toFixed(0)}% of the 18.6-year cycle (long-term average, not this date)` };
  };
  out.push(sunStatus());
  out.push(
    !fin(c.earthPct)
      ? { id: "earth", label: `Earth visible ≥ ${cfg.minEarthPct}%`, mandatory: cfg.requireSunEarth, status: "unknown", detail: "no Earth-visibility data" }
      : { id: "earth", label: `Earth visible ≥ ${cfg.minEarthPct}%`, mandatory: cfg.requireSunEarth, status: c.earthPct >= cfg.minEarthPct ? "pass" : "fail", detail: `${c.earthPct.toFixed(0)}% of the 18.6-year cycle (geometric, not an RF link)` },
  );
  return out;
}

function scoreOf(c: SiteCandidate, rec: Recovery, veh: Vehicle, cfg: SiteConfig) {
  const lin = (v: number, max: number) => Math.max(0, Math.min(1, 1 - v / max));
  const b = [
    { name: "slope margin", points: 30 * lin(c.slopeDeg ?? cfg.slopeMaxDeg, cfg.slopeMaxDeg), max: 30 },
    { name: "roughness margin", points: 15 * lin(c.roughnessM ?? cfg.roughnessMaxM, cfg.roughnessMaxM), max: 15 },
    { name: "sunlight", points: 20 * Math.min(1, (c.sunPct ?? 0) / 100), max: 20 },
    { name: "Earth visibility", points: 15 * Math.min(1, (c.earthPct ?? 0) / 100), max: 15 },
    { name: "propellant left after the divert", points: 20 * Math.max(0, Math.min(1, rec.remainingPropellantKg / Math.max(1, veh.propellantKg))), max: 20 },
  ];
  return { score: b.reduce((a, x) => a + x.points, 0), breakdown: b };
}

/**
 * Evaluate alternatives with explicit mandatory pass/fail/unknown checks. The weighted score ranks only sites that pass EVERY
 * mandatory check; a failing or unverified site is never recommended however good its score would be.
 */
export function evaluateSites(args: { candidates: SiteCandidate[]; state: { r: Vec3; v: Vec3; massKg: number }; predictedTouchdown: Vec3 | null; veh: Vehicle; cfg?: SiteConfig }): SiteEvaluation {
  const cfg = args.cfg ?? DEFAULT_SITE_CONFIG;
  const assessments: SiteAssessment[] = args.candidates.map((c) => {
    const aim = aimFor("divert", args.state, args.veh, { pos: [c.enuM[0], c.enuM[1], 0], label: c.label });
    const recovery = solveRecovery(args.state, { ...aim, pos: [c.enuM[0], c.enuM[1], 0] }, args.veh, "divert");
    const cs = checks(c, recovery, cfg);
    const mand = cs.filter((x) => x.mandatory);
    const verdict = mand.some((x) => x.status === "fail") ? "FAIL" : mand.some((x) => x.status === "unknown") ? "UNVERIFIED" : "PASS";
    const s = verdict === "PASS" ? scoreOf(c, recovery, args.veh, cfg) : { score: null as number | null, breakdown: [] };
    return {
      candidate: c,
      distanceFromTouchdownM: args.predictedTouchdown ? Math.hypot(c.enuM[0] - args.predictedTouchdown[0], c.enuM[1] - args.predictedTouchdown[1]) : null,
      distanceFromTargetM: Math.hypot(c.enuM[0], c.enuM[1]),
      checks: cs,
      verdict,
      score: s.score,
      breakdown: s.breakdown,
      recovery,
    };
  });
  const passers = assessments.filter((a) => a.verdict === "PASS").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const unverified = assessments.filter((a) => a.verdict === "UNVERIFIED").length;
  const recommended = passers[0] ?? null;
  return {
    assessments,
    recommended,
    headline: recommended ? `ALTERNATIVE FOUND: ${recommended.candidate.label}` : "NO FEASIBLE ALTERNATIVE LANDING SITE FOUND",
    note: recommended
      ? `${passers.length} of ${assessments.length} candidates pass every mandatory check; ranked by a transparent weighted score among those only.`
      : unverified > 0
        ? `${unverified} candidate${unverified === 1 ? " has" : "s have"} unknown mandatory data and cannot be called safe; the rest fail a mandatory check.`
        : "Every candidate fails at least one mandatory check (terrain, reach, sunlight or Earth visibility).",
  };
}
