import type { AnalysisSummary } from "./analysis-types";
import type { CompareInput } from "./contracts";

/**
 * Transparent comparison: compatibility checks -> hard gates -> optional weighted
 * preferences -> Pareto front and plain-language trade-offs. This is a planning aid,
 * not a NASA score, and it never declares a single universal "best" site.
 */
export type TerrainInfo = { slopeDeg: number | null; roughnessM: number | null; resolutionM: number | null; productId: string | null };
export type CompareItem = { analysisId: string; label: string; summary: AnalysisSummary; siteName?: string; terrain?: TerrainInfo | null };

export type Metrics = {
  sunHours: number;
  sunFraction: number;
  sunIntervals: number;
  sunElMin: number | null;
  sunElMax: number | null;
  sunElMean: number | null;
  dteHours: number;
  dteFraction: number;
  dteIntervals: number;
  earthHours: number;
  energyWh: number | null;
  unknownFraction: number;
  quality: string;
  antennaMaskDeg: number | null;
  durationS: number;
  siteHeightM: number | null;
  slopeDeg: number | null;
  roughnessM: number | null;
  terrainResolutionM: number | null;
  windowHours: number;
};

export function metricsOf(s: AnalysisSummary, terrain?: TerrainInfo | null): Metrics {
  const dur = (Date.parse(s.timeRange.endUtc) - Date.parse(s.timeRange.startUtc)) / 1000;
  return {
    sunHours: s.sun.totalVisibleSeconds / 3600,
    sunFraction: s.sun.fractionVisible,
    sunIntervals: s.sun.intervalCount,
    sunElMin: s.sun.elevationDuringVisibleDeg.min,
    sunElMax: s.sun.elevationDuringVisibleDeg.max,
    sunElMean: s.sun.elevationDuringVisibleDeg.mean,
    dteHours: s.earth.dte.totalVisibleSeconds / 3600,
    dteFraction: s.earth.dte.fractionVisible,
    dteIntervals: s.earth.dte.intervalCount,
    earthHours: s.earth.totalVisibleSeconds / 3600,
    energyWh: s.power.energyWh ?? null,
    unknownFraction: dur > 0 ? (s.sun.unknownSeconds + s.earth.unknownSeconds) / (2 * dur) : 0,
    quality: s.quality,
    antennaMaskDeg: s.earth.antennaMinimumElevationDeg,
    durationS: dur,
    siteHeightM: s.site?.heightM ?? null,
    slopeDeg: terrain?.slopeDeg ?? null,
    roughnessM: terrain?.roughnessM ?? null,
    terrainResolutionM: terrain?.resolutionM ?? null,
    windowHours: dur / 3600,
  };
}

/** Stable identity for "the same site": coordinates rounded to ~30 m at the pole. */
export function siteKeyOf(s: AnalysisSummary): string {
  return `${s.site.latitudeDeg.toFixed(3)},${s.site.longitudeEastDeg.toFixed(3)}`;
}
export function siteLabelOf(s: AnalysisSummary): string {
  const la = s.site.latitudeDeg;
  return `${Math.abs(la).toFixed(3)}°${la < 0 ? "S" : "N"} ${s.site.longitudeEastDeg.toFixed(3)}°E`;
}
/** Analysis window label (UTC start, minute precision). */
export function windowLabelOf(s: AnalysisSummary): string {
  return s.timeRange.startUtc.slice(0, 16).replace("T", " ");
}

export type Compatibility = { compatible: boolean; issues: string[]; energyComparable: boolean };

export function checkCompatibility(items: CompareItem[]): Compatibility {
  const issues: string[] = [];
  const s0 = items[0].summary;
  const m0 = metricsOf(s0);
  for (const it of items.slice(1)) {
    const s = it.summary;
    const m = metricsOf(s);
    if (Math.abs(m.durationS - m0.durationS) > Math.max(s0.timeRange.sampleStepSeconds, 60)) issues.push(`${it.label}: analysed time span differs (${(m.durationS / 86400).toFixed(2)} d vs ${(m0.durationS / 86400).toFixed(2)} d)`);
    if (s.timeRange.sampleStepSeconds !== s0.timeRange.sampleStepSeconds) issues.push(`${it.label}: different sample step (${s.timeRange.sampleStepSeconds} s vs ${s0.timeRange.sampleStepSeconds} s)`);
    if (s.provenance.terrainProductId !== s0.provenance.terrainProductId) issues.push(`${it.label}: different terrain product`);
    if (s.provenance.methodVersion !== s0.provenance.methodVersion) issues.push(`${it.label}: different method version`);
    if (s.provenance.kernelManifestId !== s0.provenance.kernelManifestId) issues.push(`${it.label}: different kernel set`);
    if (s.sun.visibilityRule !== s0.sun.visibilityRule || s.earth.visibilityRule !== s0.earth.visibilityRule) issues.push(`${it.label}: different visibility rule`);
    if (m.antennaMaskDeg !== m0.antennaMaskDeg) issues.push(`${it.label}: different antenna elevation mask`);
  }
  const energyComparable =
    items.every((i) => i.summary.power.energyWh != null) &&
    items.every((i) => JSON.stringify(i.summary.power.assumptions) === JSON.stringify(items[0].summary.power.assumptions));
  return { compatible: issues.length === 0, issues, energyComparable };
}

export type GateResult = { gate: string; threshold: number; value: number; result: "pass" | "fail" | "unknown"; units: string };
type Gates = CompareInput["gates"] & { minSunHours?: number | null; minDteHours?: number | null; maxSlopeDeg?: number | null };

/**
 * Hard pass/fail constraints. A metric that could still pass if every unknown period
 * turned out favourable is "unknown", never "pass".
 */
export function evaluateGates(m: Metrics, gates: Gates): GateResult[] {
  const out: GateResult[] = [];
  const unknownLimited = m.unknownFraction > 0;
  const unknownHours = (m.unknownFraction * m.durationS) / 3600;
  const atLeast = (gate: string, value: number, threshold: number, units: string, slack: number): GateResult => ({
    gate, threshold, value, units,
    result: value >= threshold ? "pass" : unknownLimited && value + slack >= threshold ? "unknown" : "fail",
  });
  if (gates.minSunFraction != null) out.push(atLeast("Minimum sunlit fraction", m.sunFraction, gates.minSunFraction, "fraction", m.unknownFraction));
  if (gates.minSunHours != null) out.push(atLeast("Minimum direct-sunlight hours", m.sunHours, gates.minSunHours, "h", unknownHours));
  if (gates.minDteFraction != null) out.push(atLeast("Minimum geometric DTE fraction", m.dteFraction, gates.minDteFraction, "fraction", m.unknownFraction));
  if (gates.minDteHours != null) out.push(atLeast("Minimum geometric DTE hours", m.dteHours, gates.minDteHours, "h", unknownHours));
  if (gates.maxSlopeDeg != null) {
    // Missing slope is unknown, never a pass.
    out.push({ gate: "Maximum local slope", threshold: gates.maxSlopeDeg, value: m.slopeDeg ?? NaN, units: "deg", result: m.slopeDeg == null ? "unknown" : m.slopeDeg <= gates.maxSlopeDeg ? "pass" : "fail" });
  }
  if (gates.maxUnknownFraction != null) {
    out.push({ gate: "Maximum unknown fraction", threshold: gates.maxUnknownFraction, value: m.unknownFraction, units: "fraction", result: m.unknownFraction <= gates.maxUnknownFraction ? "pass" : "fail" });
  }
  return out;
}

export type CompareRow = {
  analysisId: string;
  label: string;
  siteKey: string;
  siteLabel: string;
  windowLabel: string;
  metrics: Metrics;
  gates: GateResult[];
  gateStatus: "pass" | "fail" | "unknown";
  normalized: { sun: number; dte: number; energy: number | null };
  /** Weighted score in [0,1] (kept for API compatibility). */
  score: number | null;
  /** Same score on a 0–100 scale. */
  score100: number | null;
  /** Points each criterion contributes to score100 (they sum to score100). */
  breakdown: { sun: number; dte: number; energy: number } | null;
  rank: number | null;
  tiedWith: string[];
  pareto: boolean;
  dominatedBy: string[];
  recommendation: { level: "investigate" | "consider" | "excluded"; reason: string };
  explanation: string[];
};

export type TradeOff = { a: string; b: string; text: string };
export type MatrixCell = { analysisId: string; sunHours: number; dteHours: number; score100: number | null; gateStatus: CompareRow["gateStatus"] } | null;
export type Matrix = { sites: { key: string; label: string }[]; windows: string[]; cells: MatrixCell[][] };

/** Scores within this many points (0–100 scale) are treated as tied. */
export const TIE_TOLERANCE_POINTS = 0.05;

/** Row i dominates row j if it is at least as good on both axes and strictly better on one. */
function dominates(a: Metrics, b: Metrics): boolean {
  const eps = 1e-9;
  return a.sunHours >= b.sunHours - eps && a.dteHours >= b.dteHours - eps && (a.sunHours > b.sunHours + eps || a.dteHours > b.dteHours + eps);
}

const h1 = (v: number) => `${v.toFixed(1)} h`;

/** Plain-language explanation of opposing strengths between two scenarios. */
export function tradeOffText(a: { label: string; metrics: Metrics }, b: { label: string; metrics: Metrics }): string | null {
  const ds = a.metrics.sunHours - b.metrics.sunHours;
  const dd = a.metrics.dteHours - b.metrics.dteHours;
  const minDiff = 0.05; // h — below this the difference is within sampling noise
  if (Math.abs(ds) < minDiff && Math.abs(dd) < minDiff) {
    return `${a.label} and ${b.label} are effectively equal on direct sunlight (${h1(a.metrics.sunHours)}) and geometric direct-to-Earth time (${h1(a.metrics.dteHours)}); other mission factors must decide between them.`;
  }
  if (ds >= minDiff && dd <= -minDiff) {
    return `${a.label} provides more direct sunlight (${h1(a.metrics.sunHours)} vs ${h1(b.metrics.sunHours)}), but ${b.label} provides more geometric direct-to-Earth time (${h1(b.metrics.dteHours)} vs ${h1(a.metrics.dteHours)}). The preferred candidate depends on the mission's power versus communication priorities.`;
  }
  if (ds <= -minDiff && dd >= minDiff) return tradeOffText(b, a);
  return null;
}

/** Terrain trade-off note when one scenario is notably steeper (≥ 2°) than another. */
export function terrainNote(a: { label: string; metrics: Metrics }, b: { label: string; metrics: Metrics }): string | null {
  const sa = a.metrics.slopeDeg, sb = b.metrics.slopeDeg;
  if (sa == null || sb == null || Math.abs(sa - sb) < 2) return null;
  const [flat, steep] = sa < sb ? [a, b] : [b, a];
  return `${flat.label} sits on gentler terrain (${flat.metrics.slopeDeg!.toFixed(1)}° vs ${steep.metrics.slopeDeg!.toFixed(1)}° local slope at ${steep.metrics.terrainResolutionM ?? "?"} m resolution).`;
}

export function compare(items: CompareItem[], input: { gates: Gates; weights: CompareInput["weights"] }) {
  const compat = checkCompatibility(items);
  const ms = items.map((i) => metricsOf(i.summary, i.terrain));
  const maxE = Math.max(0, ...ms.map((m) => m.energyWh ?? 0));
  const w = input.weights;
  const useEnergy = compat.energyComparable && w.energy > 0 && maxE > 0;
  const wE = useEnergy ? w.energy : 0;
  const wSum = w.sun + w.dte + wE;
  const rows: CompareRow[] = items.map((it, k) => {
    const m = ms[k];
    const gates = evaluateGates(m, input.gates);
    const gateStatus = gates.some((g) => g.result === "fail") ? "fail" : gates.some((g) => g.result === "unknown") ? "unknown" : "pass";
    // Fractions are already bounded [0,1]; energy is normalised by the maximum in this comparison.
    const normalized = { sun: m.sunFraction, dte: m.dteFraction, energy: useEnergy ? (m.energyWh ?? 0) / maxE : null };
    const breakdown = wSum > 0 ? { sun: (100 * w.sun * normalized.sun) / wSum, dte: (100 * w.dte * normalized.dte) / wSum, energy: useEnergy ? (100 * wE * (normalized.energy ?? 0)) / wSum : 0 } : null;
    const score100 = breakdown ? breakdown.sun + breakdown.dte + breakdown.energy : null;
    const explanation = [
      `Sunlit ${(m.sunFraction * 100).toFixed(1)}% (${m.sunHours.toFixed(1)} h, ${m.sunIntervals} interval${m.sunIntervals === 1 ? "" : "s"})`,
      `Geometric DTE ${(m.dteFraction * 100).toFixed(1)}% (${m.dteHours.toFixed(1)} h)`,
    ];
    if (gateStatus === "fail") explanation.push(`Excluded from ranking: failed ${gates.filter((g) => g.result === "fail").map((g) => g.gate.toLowerCase()).join(", ")}`);
    if (gateStatus === "unknown") explanation.push("Excluded from ranking: gate outcome unknown because of missing terrain coverage");
    return {
      analysisId: it.analysisId, label: it.label,
      siteKey: siteKeyOf(it.summary), siteLabel: it.siteName ? `${it.siteName} (${siteLabelOf(it.summary)})` : siteLabelOf(it.summary), windowLabel: windowLabelOf(it.summary),
      metrics: m, gates, gateStatus, normalized,
      score: score100 == null ? null : score100 / 100, score100, breakdown,
      rank: null, tiedWith: [], pareto: false, dominatedBy: [],
      recommendation: { level: "excluded", reason: "" }, explanation,
    };
  });

  // Pareto front on (sunlight hours, DTE hours) among scenarios that pass the hard gates.
  const eligible = rows.filter((r) => r.gateStatus === "pass");
  for (const r of eligible) {
    r.dominatedBy = eligible.filter((o) => o !== r && dominates(o.metrics, r.metrics)).map((o) => o.label);
    r.pareto = r.dominatedBy.length === 0;
  }

  let rankingWithheld: string | null = null;
  if (!compat.compatible) rankingWithheld = "Ranking withheld: the analyses use incompatible assumptions (see issues).";
  else if (wSum === 0) rankingWithheld = "Ranking withheld: all preference weights are zero.";
  else {
    // Competition ranking ("1, 1, 3"): scores within the tie tolerance share a rank.
    const ranked = eligible.filter((r) => r.score100 != null).sort((a, b) => (b.score100 ?? 0) - (a.score100 ?? 0));
    ranked.forEach((r, i) => {
      const prev = ranked[i - 1];
      r.rank = prev && Math.abs((prev.score100 ?? 0) - (r.score100 ?? 0)) <= TIE_TOLERANCE_POINTS ? prev.rank : i + 1;
    });
    for (const r of ranked) r.tiedWith = ranked.filter((o) => o !== r && o.rank === r.rank).map((o) => o.label);
  }

  for (const r of rows) {
    if (r.gateStatus === "fail") r.recommendation = { level: "excluded", reason: "Fails at least one mandatory constraint." };
    else if (r.gateStatus === "unknown") r.recommendation = { level: "consider", reason: "Constraint outcome is unknown (terrain coverage gap); resolve the data gap before deciding." };
    else if (r.pareto) {
      const best = eligible.filter((o) => o !== r);
      const sunBest = best.every((o) => r.metrics.sunHours >= o.metrics.sunHours);
      const dteBest = best.every((o) => r.metrics.dteHours >= o.metrics.dteHours);
      const why = sunBest && dteBest ? "it has the most sunlight and the most direct-to-Earth time of the passing candidates" : sunBest ? "it has the most direct sunlight of the passing candidates" : dteBest ? "it has the most direct-to-Earth time of the passing candidates" : "no other passing candidate beats it on both sunlight and direct-to-Earth time";
      r.recommendation = { level: "investigate", reason: `Deserves further investigation: ${why}.` };
    } else r.recommendation = { level: "consider", reason: `Dominated by ${r.dominatedBy.join(", ")} (at least as good on both sunlight and direct-to-Earth time).` };
  }

  // Pairwise trade-offs among non-excluded rows.
  const tradeoffs: TradeOff[] = [];
  const live = rows.filter((r) => r.gateStatus !== "fail");
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const t = tradeOffText(live[i], live[j]);
      const tn = terrainNote(live[i], live[j]);
      if (t && (t.includes("but") || t.includes("effectively equal"))) tradeoffs.push({ a: live[i].label, b: live[j].label, text: tn ? `${t} ${tn}` : t });
      else if (tn) tradeoffs.push({ a: live[i].label, b: live[j].label, text: tn });
    }

  // Site x window matrix (one row per distinct site, one column per distinct window start).
  const sites: { key: string; label: string }[] = [];
  for (const r of rows) if (!sites.some((s) => s.key === r.siteKey)) sites.push({ key: r.siteKey, label: r.siteLabel });
  const windows = [...new Set(rows.map((r) => r.windowLabel))].sort();
  const cells: MatrixCell[][] = sites.map((s) =>
    windows.map((wl) => {
      const r = rows.find((x) => x.siteKey === s.key && x.windowLabel === wl);
      return r ? { analysisId: r.analysisId, sunHours: r.metrics.sunHours, dteHours: r.metrics.dteHours, score100: r.score100, gateStatus: r.gateStatus } : null;
    }),
  );

  const ties = rows.filter((r) => r.tiedWith.length > 0);
  const summary =
    eligible.length === 0
      ? "No scenario passes every mandatory constraint. Relax the constraints or analyse other sites or dates."
      : `${rows.filter((r) => r.recommendation.level === "investigate").map((r) => r.label).join(", ")} deserve${rows.filter((r) => r.recommendation.level === "investigate").length === 1 ? "s" : ""} further investigation (not dominated on sunlight and direct-to-Earth time).${ties.length ? ` Tie: ${[...new Set(ties.map((r) => r.label))].join(" and ")} have equal weighted scores.` : ""}`;

  return {
    compatibility: compat,
    rows,
    rankingWithheld,
    tradeoffs,
    matrix: { sites, windows, cells } as Matrix,
    summary,
    method: {
      order: "compatibility check -> hard gates -> weighted preferences -> Pareto front",
      normalization: "sun and DTE fractions used directly (bounded 0-1, shown as 0-100 points); energy divided by the maximum energy in this comparison",
      weights: { ...w, energyUsed: useEnergy },
      tieTolerancePoints: TIE_TOLERANCE_POINTS,
      pareto: "a scenario is Pareto-optimal if no other gate-passing scenario has at least as much direct sunlight and geometric DTE time and strictly more of one",
      disclaimer: "Simplified MoonNav mission suitability score — not an official NASA mission feasibility rating. It is a transparent planning aid for the supplied criteria; there is no universal best site.",
    },
  };
}
export type CompareResult = ReturnType<typeof compare>;
