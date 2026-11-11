import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalysisResult, AnalysisSummary } from "@/lib/analysis-types";
import { summarize } from "@/lib/analysis-types";
import { compare, type CompareItem, tradeOffText } from "@/lib/compare";

const demo = (k: string) => JSON.parse(readFileSync(path.join(__dirname, "../../public/data/demo", `${k}.json`), "utf8")) as AnalysisResult;
const base = summarize(demo("mons-malapert"));
const NO_GATES = { minSunFraction: null, minDteFraction: null, maxUnknownFraction: null };
const W = { sun: 1, dte: 1, energy: 0 };

/** Clone a real summary with chosen sunlight / DTE hours (same window length => compatible). */
function synth(label: string, sunH: number, dteH: number, opts: { lat?: number; start?: string; unknownS?: number } = {}): CompareItem {
  const s = structuredClone(base) as AnalysisSummary;
  const dur = (Date.parse(s.timeRange.endUtc) - Date.parse(s.timeRange.startUtc)) / 1000;
  s.sun.totalVisibleSeconds = sunH * 3600;
  s.sun.fractionVisible = (sunH * 3600) / dur;
  s.earth.dte.totalVisibleSeconds = dteH * 3600;
  s.earth.dte.fractionVisible = (dteH * 3600) / dur;
  s.sun.unknownSeconds = opts.unknownS ?? 0;
  s.earth.unknownSeconds = opts.unknownS ?? 0;
  if (opts.lat != null) s.site = { ...s.site, latitudeDeg: opts.lat };
  if (opts.start) {
    const shift = Date.parse(opts.start) - Date.parse(s.timeRange.startUtc);
    s.timeRange = { ...s.timeRange, startUtc: opts.start, endUtc: new Date(Date.parse(s.timeRange.endUtc) + shift).toISOString() };
  }
  return { analysisId: label, label, summary: s };
}

describe("comparison engine", () => {
  it("scores on a 0-100 scale whose breakdown sums to the score", () => {
    const r = compare([synth("A", 18, 10), synth("B", 12, 16)], { gates: NO_GATES, weights: W });
    for (const row of r.rows) {
      expect(row.score100).not.toBeNull();
      expect(row.breakdown!.sun + row.breakdown!.dte + row.breakdown!.energy).toBeCloseTo(row.score100!, 9);
      expect(row.score100!).toBeGreaterThanOrEqual(0);
      expect(row.score100!).toBeLessThanOrEqual(100);
    }
  });

  it("marks equal scores as a tie and gives them the same rank", () => {
    const r = compare([synth("A", 18, 10), synth("B", 10, 18), synth("C", 5, 5)], { gates: NO_GATES, weights: W });
    const [a, b, c] = r.rows;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(1);
    expect(a.tiedWith).toEqual(["B"]);
    expect(c.rank).toBe(3);
    expect(r.summary).toContain("Tie");
  });

  it("identifies the Pareto front and recommends only non-dominated passing scenarios", () => {
    const r = compare([synth("A", 18, 10), synth("B", 12, 16), synth("C", 11, 9)], { gates: NO_GATES, weights: W });
    const by = Object.fromEntries(r.rows.map((x) => [x.label, x]));
    expect(by.A.pareto).toBe(true);
    expect(by.B.pareto).toBe(true);
    expect(by.C.pareto).toBe(false);
    expect(by.C.dominatedBy.sort()).toEqual(["A", "B"]);
    expect(by.A.recommendation.level).toBe("investigate");
    expect(by.C.recommendation.level).toBe("consider");
  });

  it("explains opposing strengths in plain language and never names a single winner", () => {
    const r = compare([synth("Site A", 18, 5), synth("Site B", 14, 15)], { gates: NO_GATES, weights: W });
    expect(r.tradeoffs).toHaveLength(1);
    expect(r.tradeoffs[0].text).toMatch(/Site A provides more direct sunlight \(18\.0 h vs 14\.0 h\), but Site B provides more geometric direct-to-Earth time \(15\.0 h vs 5\.0 h\)/);
    expect(r.tradeoffs[0].text).toMatch(/depends on the mission/);
  });

  it("tradeOffText is null when one scenario dominates", () => {
    const a = compare([synth("A", 18, 16), synth("B", 12, 10)], { gates: NO_GATES, weights: W }).rows;
    expect(tradeOffText(a[0], a[1])).toBeNull();
  });

  it("applies hour-based hard constraints before scoring", () => {
    const r = compare([synth("A", 18, 4), synth("B", 12, 16)], { gates: { ...NO_GATES, minDteHours: 8 }, weights: { sun: 10, dte: 0, energy: 0 } });
    const [a, b] = r.rows;
    expect(a.gateStatus).toBe("fail");
    expect(a.rank).toBeNull();
    expect(a.recommendation.level).toBe("excluded");
    expect(b.rank).toBe(1);
  });

  it("does not turn unknown terrain coverage into a pass", () => {
    const r = compare([synth("A", 7, 10, { unknownS: 4 * 3600 }), synth("B", 12, 16)], { gates: { ...NO_GATES, minSunHours: 8 }, weights: W });
    expect(r.rows[0].gates[0].result).toBe("unknown");
    expect(r.rows[0].gateStatus).toBe("unknown");
    expect(r.rows[0].rank).toBeNull();
  });

  it("builds a site x date matrix for multi-site, multi-date comparisons", () => {
    const r = compare(
      [synth("S1 d1", 10, 10, { lat: -89.5, start: "2026-12-01T00:00:00Z" }), synth("S1 d2", 12, 9, { lat: -89.5, start: "2026-12-10T00:00:00Z" }), synth("S2 d1", 8, 14, { lat: -85.0, start: "2026-12-01T00:00:00Z" })],
      { gates: NO_GATES, weights: W },
    );
    expect(r.matrix.sites).toHaveLength(2);
    expect(r.matrix.windows).toEqual(["2026-12-01 00:00", "2026-12-10 00:00"]);
    expect(r.matrix.cells[0].every(Boolean)).toBe(true);
    expect(r.matrix.cells[1][1]).toBeNull();
  });

  it("withholds the ranking when all weights are zero", () => {
    const r = compare([synth("A", 18, 10), synth("B", 12, 16)], { gates: NO_GATES, weights: { sun: 0, dte: 0, energy: 0 } });
    expect(r.rankingWithheld).toMatch(/weights are zero/);
    expect(r.rows.every((x) => x.rank == null)).toBe(true);
  });
});

describe("terrain-aware comparison", () => {
  it("applies the maximum-slope gate and treats missing slope as unknown", () => {
    const a = { ...synth("Flat", 18, 10), terrain: { slopeDeg: 4, roughnessM: 0.3, resolutionM: 20, productId: "x" } };
    const b = { ...synth("Steep", 12, 16), terrain: { slopeDeg: 22, roughnessM: 1.1, resolutionM: 20, productId: "x" } };
    const c = { ...synth("NoData", 15, 13), terrain: null };
    const r = compare([a, b, c], { gates: { ...NO_GATES, maxSlopeDeg: 15 }, weights: W });
    const by = Object.fromEntries(r.rows.map((x) => [x.label, x]));
    expect(by.Flat.gateStatus).toBe("pass");
    expect(by.Steep.gateStatus).toBe("fail");
    expect(by.NoData.gateStatus).toBe("unknown");
    expect(by.Flat.metrics.terrainResolutionM).toBe(20);
  });
  it("mentions terrain in the trade-off when slopes differ by 2 degrees or more", () => {
    const a = { ...synth("Site A", 18, 5), terrain: { slopeDeg: 3, roughnessM: null, resolutionM: 5, productId: "x" } };
    const b = { ...synth("Site B", 14, 15), terrain: { slopeDeg: 11, roughnessM: null, resolutionM: 5, productId: "x" } };
    const r = compare([a, b], { gates: NO_GATES, weights: W });
    expect(r.tradeoffs[0].text).toMatch(/Site A sits on gentler terrain \(3\.0° vs 11\.0°/);
  });
});
