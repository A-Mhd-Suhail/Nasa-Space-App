import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/lib/analysis-types";
import { summarize } from "@/lib/analysis-types";
import { checkCompatibility, compare, type CompareItem } from "@/lib/compare";
import { canonicalDefinition, normalizeLonEast, scenarioInput, stableStringify } from "@/lib/contracts";
import { toLatLon, toXY } from "@/lib/lunar";
import { buildCsv, buildJson, buildPdf } from "@/lib/report-builders";
import { safeNext } from "@/lib/safe-next";

const demo = (k: string) => JSON.parse(readFileSync(path.join(__dirname, "../../public/data/demo", `${k}.json`), "utf8")) as AnalysisResult;
const malapert = demo("mons-malapert");
const shackleton = demo("shackleton");
const ctx = { analysisId: "ana_test", scenarioId: "scn_test", scenarioName: "Test", projectName: "P", generatedAtUtc: "2026-11-10T00:00:00Z", appVersion: "0.1.0" };

describe("coordinates", () => {
  it("normalises east/west longitudes", () => {
    expect(normalizeLonEast(-30)).toBe(330);
    expect(normalizeLonEast(30, "west")).toBe(330);
    expect(normalizeLonEast(360)).toBe(0);
  });
  it("polar stereographic round-trips and matches LOLA orientation (0°E up)", () => {
    const [x, y] = toXY(-85, 0);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(y).toBeGreaterThan(0);
    for (const [la, lo] of [[-89.67, 129.78], [-76, 359], [-84.6, 31]]) {
      const [px, py] = toXY(la, lo);
      const r = toLatLon(px, py);
      expect(r.lat).toBeCloseTo(la, 9);
      expect(r.lon).toBeCloseTo(lo, 9);
    }
  });
});

describe("safe return URLs", () => {
  it.each([["/app", "/app"], ["/app/x?y=1", "/app/x?y=1"], ["//evil.com", "/app"], ["https://evil.com", "/app"], ["/\\evil.com", "/app"], [null, "/app"]])("%s -> %s", (i, o) => expect(safeNext(i)).toBe(o));
});

describe("scenario contract", () => {
  const base = { projectId: "p", name: "n", site: { mode: "catalog", siteId: "shackleton" }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-22T00:00:00Z", stepSeconds: 600 };
  it("accepts a valid scenario and applies defaults", () => {
    const r = scenarioInput.parse(base);
    expect(r.observerHeightM).toBe(2);
    expect(r.solarPanel).toBeNull();
  });
  it("rejects non-UTC times, reversed intervals, too many samples and out-of-coverage custom sites", () => {
    expect(scenarioInput.safeParse({ ...base, startUtc: "2026-11-15T00:00:00+02:00" }).success).toBe(false);
    expect(scenarioInput.safeParse({ ...base, endUtc: "2026-11-14T00:00:00Z" }).success).toBe(false);
    expect(scenarioInput.safeParse({ ...base, endUtc: "2027-11-15T00:00:00Z", stepSeconds: 60 }).success).toBe(false);
    expect(scenarioInput.safeParse({ ...base, site: { mode: "custom", latitudeDeg: -60, longitudeDeg: 0 } }).success).toBe(false);
  });
  it("requires orientation for fixed panels", () => {
    expect(scenarioInput.safeParse({ ...base, solarPanel: { areaM2: 1, efficiency: 0.3, derating: 0.9, orientation: "fixed" } }).success).toBe(false);
  });
  it("canonical definition hashes are key-order independent", () => {
    const s = scenarioInput.parse(base);
    const d = canonicalDefinition(s, -89.67, 129.78);
    expect(stableStringify(d)).toBe(stableStringify(JSON.parse(JSON.stringify(d))));
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
});

describe("comparison", () => {
  const items: CompareItem[] = [
    { analysisId: "a", label: "Malapert", summary: summarize(malapert) },
    { analysisId: "b", label: "Shackleton", summary: summarize(shackleton) },
  ];
  it("treats identical-assumption analyses as compatible and ranks by weights", () => {
    const r = compare(items, { gates: { minSunFraction: null, minDteFraction: null, maxUnknownFraction: null }, weights: { sun: 1, dte: 1, energy: 0 } });
    expect(r.compatibility.compatible).toBe(true);
    expect(r.rows.find((x) => x.analysisId === "a")!.rank).toBe(1);
  });
  it("applies hard gates before weights (failing site is not ranked)", () => {
    const r = compare(items, { gates: { minSunFraction: 0.2, minDteFraction: null, maxUnknownFraction: null }, weights: { sun: 0, dte: 1, energy: 0 } });
    const b = r.rows.find((x) => x.analysisId === "b")!;
    expect(b.gateStatus).toBe("fail");
    expect(b.rank).toBeNull();
  });
  it("withholds ranking for incompatible analyses", () => {
    const other = structuredClone(malapert);
    other.timeRange.sampleStepSeconds = 600;
    const r = compare([items[0], { analysisId: "c", label: "x", summary: summarize(other) }], { gates: { minSunFraction: null, minDteFraction: null, maxUnknownFraction: null }, weights: { sun: 1, dte: 1, energy: 0 } });
    expect(r.compatibility.compatible).toBe(false);
    expect(r.rankingWithheld).toMatch(/withheld/);
    expect(r.rows.every((x) => x.rank === null)).toBe(true);
  });
  it("excludes energy from scoring unless panel assumptions match", () => {
    expect(checkCompatibility(items).energyComparable).toBe(false);
  });
});

describe("report exports are consistent with the stored analysis", () => {
  it("JSON embeds the full analysis and provenance", () => {
    const j = JSON.parse(buildJson(malapert, ctx));
    expect(j.analysis.sun.totalVisibleSeconds).toBe(malapert.sun.totalVisibleSeconds);
    expect(j.analysis.provenance.kernelManifestId).toBe(malapert.provenance.kernelManifestId);
    expect(j.report.disclaimer).toMatch(/not RF link/);
  });
  it("CSV has one row per sample, provenance header, empty cells for unavailable values", () => {
    const csv = buildCsv(malapert, ctx);
    const lines = csv.trim().split("\n");
    const header = lines.findIndex((l) => l.startsWith("utc,"));
    expect(lines.length - header - 1).toBe(malapert.timeseries.length);
    expect(csv).toContain(`kernels=${malapert.provenance.kernelManifestId}`);
    expect(csv).toContain(`terrain=${malapert.provenance.terrainProductId}`);
    const first = lines[header + 1].split(",");
    expect(first[0]).toBe(malapert.timeseries[0].utc);
    expect(first[12]).toBe(""); // powerW unavailable -> empty, never 0
  });
  it("PDF is a valid document with the brief title", async () => {
    const bytes = await buildPdf(malapert, ctx);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toContain("MoonNav mission brief");
  });
});
