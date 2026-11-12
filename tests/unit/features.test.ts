import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/lib/analysis-types";
import { summarize } from "@/lib/analysis-types";
import { compare } from "@/lib/compare";
import { buildComparisonJson, buildComparisonPdf, buildPdf } from "@/lib/report-builders";
import { directionLatLon } from "@/components/viz/globe-math";

const demo = (k: string) => JSON.parse(readFileSync(path.join(__dirname, "../../public/data/demo", `${k}.json`), "utf8")) as AnalysisResult;

describe("globe direction math (ENU az/el -> body-fixed lat/lon)", () => {
  it("zenith maps to the site itself", () => {
    const d = directionLatLon(-30, 40, 123, 90);
    expect(d.lat).toBeCloseTo(-30, 9);
    expect(d.lon).toBeCloseTo(40, 9);
  });
  it("horizontal east at the equator/prime meridian points to 0N 90E", () => {
    const d = directionLatLon(0, 0, 90, 0);
    expect(d.lat).toBeCloseTo(0, 9);
    expect(d.lon).toBeCloseTo(90, 9);
  });
  it("horizontal north at the equator points to the north pole", () => {
    expect(directionLatLon(0, 10, 0, 0).lat).toBeCloseTo(90, 9);
  });
  it("a near-horizon Sun at the south pole has a sub-point near the equator", () => {
    expect(Math.abs(directionLatLon(-89.9, 0, 200, 1.5).lat)).toBeLessThan(5);
  });
});

describe("report builders", () => {
  const items = [
    { analysisId: "a", label: "Mons Malapert", summary: summarize(demo("mons-malapert")) },
    { analysisId: "b", label: "Mons Mouton", summary: summarize(demo("mons-mouton")) },
  ];
  const res = compare(items, { gates: { minSunFraction: null, minDteFraction: null, maxUnknownFraction: 0.05 }, weights: { sun: 1, dte: 1, energy: 0 } });
  const ctx = { comparisonId: "cmp_test", generatedAtUtc: "2026-11-11T00:00:00Z", appVersion: "0.1.0", criteria: { weights: { sun: 1, dte: 1 } } };

  it("comparison JSON carries schema, disclaimer and every row", () => {
    const j = JSON.parse(buildComparisonJson(res, ctx));
    expect(j.schema).toBe("moonnav.comparison-report.v1");
    expect(j.report.disclaimer).toMatch(/not NASA-owned/);
    expect(j.comparison.rows).toHaveLength(2);
    expect(j.comparison.method.disclaimer).toMatch(/not an official NASA mission feasibility rating/);
  });
  it("comparison PDF is a valid document", async () => {
    const bytes = await buildComparisonPdf(res, ctx);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("cmp_test");
  });
  it("mission PDF includes the horizon-profile and confidence sections (grows by a page)", async () => {
    const doc = await PDFDocument.load(await buildPdf(demo("mons-malapert"), { analysisId: "ana", scenarioId: "scn", scenarioName: "S", projectName: "P", generatedAtUtc: "2026-11-11T00:00:00Z", appVersion: "0.1.0" }));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});

import { heightAt, reliefSphere } from "@/components/viz/globe-math";

describe("global relief height map", () => {
  // 4 x 2 map: row 0 (north) = [0, 100, 200, 300], row 1 (south) = [1000, 1100, 1200, 1300]
  const m = { width: 4, height: 2, data: Int16Array.from([0, 100, 200, 300, 1000, 1100, 1200, 1300]) };
  it("samples cell centres exactly", () => {
    expect(heightAt(m, 45, 45)).toBeCloseTo(0, 9); // centre of cell (0,0): lat 45N, lon 45E
    expect(heightAt(m, -45, 135)).toBeCloseTo(1100, 9);
  });
  it("wraps across 0/360 deg longitude", () => {
    expect(heightAt(m, 45, 0)).toBeCloseTo(150, 9); // halfway between col 3 (300) and col 0 (0)
    expect(heightAt(m, 45, 360)).toBeCloseTo(heightAt(m, 45, 0), 9);
    expect(heightAt(m, 45, -90)).toBeCloseTo(heightAt(m, 45, 270), 9);
  });
  it("true-scale displacement is metres / 1737.4 km and exaggeration only scales it", () => {
    const flat = { width: 2, height: 1, data: Int16Array.from([1737, 1737]) };
    const g1 = reliefSphere(flat, 8, 4, 1), g10 = reliefSphere(flat, 8, 4, 10);
    const r = (p: Float32Array, i: number) => Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    expect(r(g1.positions, 12)).toBeCloseTo(1 + 1737 / 1_737_400, 6); // float32 vertices
    expect(r(g10.positions, 12) - 1).toBeCloseTo(10 * (r(g1.positions, 12) - 1), 5);
  });
});

describe("relief mesh topology", () => {
  it("matches THREE.SphereGeometry triangle count and indexes every vertex in range", () => {
    const g = reliefSphere(null, 16, 8, 1);
    expect(g.indices.length).toBe(16 * (8 - 1) * 2 * 3);
    const nVerts = g.positions.length / 3;
    expect(Math.max(...Array.from(g.indices))).toBeLessThan(nVerts);
  });
});

import { frameStats } from "@/components/shell/PerfPanel";

describe("rendering diagnostics statistics", () => {
  it("computes mean fps and frame-time percentiles from intervals", () => {
    const s = frameStats([...Array(90).fill(16.7), ...Array(10).fill(100)], { count: 2, ms: 180 });
    expect(s.frames).toBe(100);
    expect(s.fpsMean).toBeCloseTo((1000 * 100) / (90 * 16.7 + 10 * 100), 0);
    expect(s.frameMs.p50).toBe(16.7);
    expect(s.frameMs.p95).toBe(100);
    expect(s.slowFrames).toBe(10);
    expect(s.longTasks).toBe(2);
  });
  it("handles an empty or invalid sample safely", () => {
    expect(frameStats([]).frames).toBe(0);
    expect(frameStats([NaN, -1, Infinity]).fpsMean).toBe(0);
  });
});

describe("header service status", () => {
  it("treats the serverless on-demand worker as healthy, and a missing worker as a warning", async () => {
    const { serviceStatus } = await import("../../src/components/shell/DataStatus");
    const base = { status: "ok", database: { status: "ok" } };
    expect(serviceStatus({ ...base, science: { status: "ok" }, worker: { status: "on_demand" } }, false)).toMatchObject({ ok: true, label: "Engine online · jobs run on demand", tone: "bg-ok" });
    expect(serviceStatus({ ...base, science: { status: "ok" }, worker: { status: "ok" } }, false).label).toBe("Engine + worker online");
    expect(serviceStatus({ ...base, science: { status: "ok" }, worker: { status: "no_live_worker" } }, false)).toMatchObject({ ok: false, label: "No live worker", tone: "bg-warn" });
    expect(serviceStatus({ ...base, science: { status: "unavailable" }, worker: { status: "on_demand" } }, false)).toMatchObject({ ok: false, label: "Engine unavailable", tone: "bg-bad" });
    expect(serviceStatus(undefined, true).label).toBe("Checking services");
  });
});
