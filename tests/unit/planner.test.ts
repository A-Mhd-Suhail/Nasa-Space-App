import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type AnalysisResult, summarize } from "@/lib/analysis-types";
import { evaluatePlan, longestDarkHours, planInput } from "@/lib/planner";

const demo = (k: string) => summarize(JSON.parse(readFileSync(path.join(__dirname, "../../public/data/demo", `${k}.json`), "utf8")) as AnalysisResult);
const malapert = demo("mons-malapert");
const shackleton = demo("shackleton");
const mouton = demo("mons-mouton");
const W = { sun: 1, dte: 1, darkness: 1, energy: 0 };
const C = { minSunPct: null, maxDarkHours: null, minDtePct: null, minEnergyWh: null, maxUnknownPct: 0 };

describe("mission planner", () => {
  it("derives the longest darkness exactly from stored intervals", () => {
    expect(longestDarkHours(shackleton)).toBeCloseTo(720, 0); // never sunlit in the 30-day window
    const d = longestDarkHours(malapert)!;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(720);
  });
  it("applies hard constraints before ranking and explains each outcome", () => {
    const r = evaluatePlan(
      [
        { label: "Malapert", analysisId: "a1", status: "completed", summary: malapert },
        { label: "Shackleton", analysisId: "a2", status: "completed", summary: shackleton },
        { label: "Queued", analysisId: "a3", status: "queued", summary: null },
      ],
      { ...C, minSunPct: 30 },
      W,
    );
    const shack = r.rows.find((x) => x.label === "Shackleton")!;
    expect(shack.state).toBe("fail");
    expect(shack.rank).toBeNull();
    expect(shack.explanation.join(" ")).toMatch(/Fails direct sunlight: 0\.0 %/);
    const mal = r.rows.find((x) => x.label === "Malapert")!;
    expect(mal).toMatchObject({ state: "pass", rank: 1 });
    expect(r.rows.find((x) => x.label === "Queued")!.state).toBe("pending");
    expect(r.rows[0].label).toBe("Malapert");
  });
  it("ranks eligible candidates by documented weights", () => {
    const cands = [
      { label: "Malapert", analysisId: "a1", status: "completed", summary: malapert },
      { label: "Mouton", analysisId: "a2", status: "completed", summary: mouton },
    ];
    const sunOnly = evaluatePlan(cands, C, { sun: 1, dte: 0, darkness: 0, energy: 0 });
    const best = sunOnly.rows.find((x) => x.rank === 1)!;
    const other = sunOnly.rows.find((x) => x.rank === 2)!;
    expect(best.metrics!.sunPct).toBeGreaterThanOrEqual(other.metrics!.sunPct);
    expect(best.score).toBeCloseTo(best.metrics!.sunPct / 100, 6);
    expect(evaluatePlan(cands, C, { sun: 0, dte: 0, darkness: 0, energy: 0 }).rankingNote).toMatch(/withheld/);
  });
  it("validates planner input", () => {
    const ok = planInput.safeParse({ name: "P", candidates: [{ kind: "site", siteId: "shackleton" }], startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-20T00:00:00Z" });
    expect(ok.success).toBe(true);
    const bad = planInput.safeParse({ name: "P", candidates: [], startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-14T00:00:00Z", constraints: { minEnergyWh: 10 } });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.path.join("."))).toEqual(expect.arrayContaining(["candidates", "endUtc", "constraints.minEnergyWh"]));
  });
});
