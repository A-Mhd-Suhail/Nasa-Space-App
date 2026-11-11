import { z } from "zod";
import type { AnalysisSummary } from "./analysis-types";
import { metricsOf } from "./compare";
import { solarPanelSchema } from "./contracts";

/**
 * Mission Planner: requirements → candidate scenarios → real analyses → hard constraints →
 * weighted ranking of the eligible candidates, with an explanation for every candidate.
 * Every metric comes from a completed SPICE + LOLA analysis; a metric that cannot be derived
 * exactly from the stored result is "unknown" and never counts as a pass.
 */

export const planConstraints = z.object({
  minSunPct: z.number().min(0).max(100).nullable().default(null),
  maxDarkHours: z.number().min(0).max(24 * 400).nullable().default(null),
  minDtePct: z.number().min(0).max(100).nullable().default(null),
  minEnergyWh: z.number().min(0).nullable().default(null),
  maxUnknownPct: z.number().min(0).max(100).nullable().default(0),
});
export const planWeights = z.object({
  sun: z.number().min(0).max(10).default(1),
  dte: z.number().min(0).max(10).default(1),
  darkness: z.number().min(0).max(10).default(1),
  energy: z.number().min(0).max(10).default(0),
});
export type PlanConstraints = z.infer<typeof planConstraints>;
export type PlanWeights = z.infer<typeof planWeights>;

export const candidateInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("site"), siteId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("location"), locationId: z.string().min(1).max(80) }),
  z.object({ kind: z.literal("point"), latitudeDeg: z.number().min(-90).max(-75), longitudeEastDeg: z.number().min(-360).max(360), label: z.string().trim().min(1).max(80) }),
]);
export type CandidateInput = z.infer<typeof candidateInput>;

const isoUtc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/, "Use UTC ISO-8601 with a Z suffix");

export const planInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    projectId: z.string().max(80).nullable().default(null),
    candidates: z.array(candidateInput).min(1, "Choose at least one candidate").max(12, "Plan up to 12 candidates at a time"),
    startUtc: isoUtc,
    endUtc: isoUtc,
    stepSeconds: z.number().int().min(300).max(21_600).default(1800),
    observerHeightM: z.number().min(0).max(100).default(2),
    antennaMinimumElevationDeg: z.number().min(-10).max(90).nullable().default(5),
    solarPanel: solarPanelSchema.nullable().default(null),
    constraints: planConstraints.default({ minSunPct: null, maxDarkHours: null, minDtePct: null, minEnergyWh: null, maxUnknownPct: 0 }),
    weights: planWeights.default({ sun: 1, dte: 1, darkness: 1, energy: 0 }),
  })
  .superRefine((p, ctx) => {
    const a = Date.parse(p.startUtc);
    const b = Date.parse(p.endUtc);
    if (!(b > a)) ctx.addIssue({ code: "custom", path: ["endUtc"], message: "End must be after start" });
    if ((b - a) / 86_400_000 > 120) ctx.addIssue({ code: "custom", path: ["endUtc"], message: "Planner windows are limited to 120 days" });
    if ((b - a) / 1000 / p.stepSeconds > 20_000) ctx.addIssue({ code: "custom", path: ["stepSeconds"], message: "Too many samples; increase the step" });
    if (p.constraints.minEnergyWh != null && !p.solarPanel) ctx.addIssue({ code: "custom", path: ["constraints", "minEnergyWh"], message: "An energy constraint needs solar-panel assumptions" });
  });
export type PlanInput = z.infer<typeof planInput>;

type IntervalLike = { startUtc: string; endUtc: string; kind?: string };

/**
 * Longest continuous period without direct sunlight, from the stored sunlit intervals.
 * Unknown when the stored preview is incomplete or any sunlight state is unknown.
 */
export function longestDarkHours(s: AnalysisSummary): number | null {
  const ivs = ((s.sun as unknown as { intervalPreview?: IntervalLike[] }).intervalPreview ?? []).filter((i) => i.kind !== "unknown");
  if (s.sun.unknownIntervalCount > 0 || ivs.length < s.sun.intervalCount) return null;
  const t0 = Date.parse(s.timeRange.startUtc);
  const t1 = Date.parse(s.timeRange.endUtc);
  if (ivs.length === 0) return (t1 - t0) / 3_600_000;
  const sorted = [...ivs].sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
  let gap = Date.parse(sorted[0].startUtc) - t0;
  for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, Date.parse(sorted[i].startUtc) - Date.parse(sorted[i - 1].endUtc));
  gap = Math.max(gap, t1 - Date.parse(sorted[sorted.length - 1].endUtc));
  return Math.max(0, gap) / 3_600_000;
}

export type PlanCandidate = { label: string; analysisId: string; status: string; summary: AnalysisSummary | null; error?: string | null };

export type PlanCheck = { key: keyof PlanConstraints; label: string; value: number | null; limit: number; unit: string; result: "pass" | "fail" | "unknown" };

export type PlanRow = {
  label: string;
  analysisId: string;
  state: "pending" | "analysis_failed" | "pass" | "fail" | "unknown";
  metrics: { sunPct: number; dtePct: number; darkHours: number | null; energyWh: number | null; unknownPct: number } | null;
  checks: PlanCheck[];
  score: number | null;
  scoreParts: { sun: number; dte: number; darkness: number | null; energy: number | null } | null;
  rank: number | null;
  explanation: string[];
};

export function evaluatePlan(cands: PlanCandidate[], c: PlanConstraints, w: PlanWeights) {
  const rows: PlanRow[] = cands.map((k) => {
    if (k.status === "failed" || k.status === "cancelled") {
      return { label: k.label, analysisId: k.analysisId, state: "analysis_failed", metrics: null, checks: [], score: null, scoreParts: null, rank: null, explanation: [`Analysis ${k.status}${k.error ? `: ${k.error}` : ""}; not ranked.`] };
    }
    if (k.status !== "completed" || !k.summary) {
      return { label: k.label, analysisId: k.analysisId, state: "pending", metrics: null, checks: [], score: null, scoreParts: null, rank: null, explanation: [`Analysis ${k.status}.`] };
    }
    const m = metricsOf(k.summary);
    const metrics = { sunPct: m.sunFraction * 100, dtePct: m.dteFraction * 100, darkHours: longestDarkHours(k.summary), energyWh: m.energyWh, unknownPct: m.unknownFraction * 100 };
    const checks: PlanCheck[] = [];
    const add = (key: keyof PlanConstraints, label: string, value: number | null, limit: number | null, unit: string, ok: (v: number, l: number) => boolean) => {
      if (limit == null) return;
      checks.push({ key, label, value, limit, unit, result: value == null ? "unknown" : ok(value, limit) ? "pass" : "fail" });
    };
    add("maxUnknownPct", "Unknown samples", metrics.unknownPct, c.maxUnknownPct, "%", (v, l) => v <= l);
    add("minSunPct", "Direct sunlight", metrics.sunPct, c.minSunPct, "%", (v, l) => v >= l);
    add("maxDarkHours", "Longest darkness", metrics.darkHours, c.maxDarkHours, "h", (v, l) => v <= l);
    add("minDtePct", "Geometric DTE", metrics.dtePct, c.minDtePct, "%", (v, l) => v >= l);
    add("minEnergyWh", "Panel energy", metrics.energyWh, c.minEnergyWh, "Wh", (v, l) => v >= l);
    const failed = checks.filter((x) => x.result === "fail");
    const state = failed.length ? "fail" : checks.some((x) => x.result === "unknown") ? "unknown" : "pass";
    const explanation = checks.map((x) => `${x.result === "pass" ? "Meets" : x.result === "fail" ? "Fails" : "Cannot check"} ${x.label.toLowerCase()}: ${x.value == null ? "unknown" : `${x.value.toFixed(1)} ${x.unit}`} (required ${x.key.startsWith("max") ? "≤" : "≥"} ${x.limit} ${x.unit})`);
    if (!checks.length) explanation.push("No hard constraints set.");
    return { label: k.label, analysisId: k.analysisId, state, metrics, checks, score: null, scoreParts: null, rank: null, explanation };
  });

  // Weighted preferences among eligible candidates only.
  const eligible = rows.filter((r) => r.state === "pass");
  const window = Math.max(...cands.filter((k) => k.summary).map((k) => (Date.parse(k.summary!.timeRange.endUtc) - Date.parse(k.summary!.timeRange.startUtc)) / 3_600_000), 1);
  const maxE = Math.max(0, ...eligible.map((r) => r.metrics!.energyWh ?? 0));
  const useDark = w.darkness > 0 && eligible.every((r) => r.metrics!.darkHours != null);
  const useEnergy = w.energy > 0 && maxE > 0 && eligible.every((r) => r.metrics!.energyWh != null);
  const wSum = w.sun + w.dte + (useDark ? w.darkness : 0) + (useEnergy ? w.energy : 0);
  let rankingNote: string | null = null;
  if (wSum === 0) rankingNote = "Ranking withheld: all applicable preference weights are zero.";
  else {
    for (const r of eligible) {
      const m = r.metrics!;
      const parts = { sun: m.sunPct / 100, dte: m.dtePct / 100, darkness: useDark ? 1 - Math.min(1, m.darkHours! / window) : null, energy: useEnergy ? (m.energyWh ?? 0) / maxE : null };
      r.scoreParts = parts;
      r.score = (w.sun * parts.sun + w.dte * parts.dte + (useDark ? w.darkness * parts.darkness! : 0) + (useEnergy ? w.energy * parts.energy! : 0)) / wSum;
    }
    eligible.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).forEach((r, i) => {
      r.rank = i + 1;
      r.explanation.push(`Rank ${i + 1} of ${eligible.length}: weighted score ${(r.score! * 100).toFixed(1)} / 100.`);
    });
    if (w.darkness > 0 && !useDark) rankingNote = "Darkness weight not applied: the longest-darkness metric is unknown for at least one eligible candidate.";
    if (w.energy > 0 && !useEnergy) rankingNote = `${rankingNote ? `${rankingNote} ` : ""}Energy weight not applied: no panel energy for every eligible candidate.`;
  }
  for (const r of rows) if (r.state === "fail") r.explanation.push("Excluded from ranking: fails a hard constraint.");
  for (const r of rows) if (r.state === "unknown") r.explanation.push("Excluded from ranking: a hard constraint cannot be checked.");
  const order = { pass: 0, unknown: 1, fail: 2, pending: 3, analysis_failed: 4 } as const;
  rows.sort((a, b) => order[a.state] - order[b.state] || (a.rank ?? 99) - (b.rank ?? 99) || (b.metrics?.sunPct ?? 0) - (a.metrics?.sunPct ?? 0));
  return {
    rows,
    rankingNote,
    method: {
      order: "1) run a full SPICE + LOLA analysis per candidate; 2) apply hard constraints; 3) rank only candidates that meet all of them",
      normalization: "sunlight and DTE as fractions of the window; darkness score = 1 − longest darkness / window length; energy ÷ best eligible energy",
      weights: { ...w, darknessUsed: useDark, energyUsed: useEnergy },
      disclaimer: "A transparent planning aid for the stated requirements, not a NASA site selection or landing certification.",
    },
  };
}
