import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type Cell, cellAt, cells, DEFAULT_CONSTRAINTS, evaluate, type FeasibilityGrid, gridExtent, rasterize } from "@/lib/feasibility";
import { toXY } from "@/lib/lunar";

const g = JSON.parse(readFileSync(path.join(__dirname, "../../public/data/feasibility/grid.json"), "utf8")) as FeasibilityGrid;
const list = cells(g);
const base: Cell = { row: 0, col: 0, lat: -89, lon: 0, heightM: 0, slopeDeg: 5, sunFraction: 0.6, longestDarkHours: 100, dteFraction: 0.5, unknownFraction: 0, truncatedRays: 0 };

describe("feasibility screening", () => {
  it("passes only when every hard constraint is met", () => {
    expect(evaluate(base, DEFAULT_CONSTRAINTS).state).toBe("pass");
    const v = evaluate({ ...base, slopeDeg: 20, dteFraction: 0.05 }, DEFAULT_CONSTRAINTS);
    expect(v.state).toBe("fail");
    expect(v.failed.map((f) => f.key)).toEqual(["maxSlopeDeg", "minDtePct"]);
  });
  it("keeps missing metrics unknown, never pass", () => {
    expect(evaluate({ ...base, longestDarkHours: null }, DEFAULT_CONSTRAINTS).state).toBe("unknown");
    // a definite failure still wins over unknown
    expect(evaluate({ ...base, longestDarkHours: null, slopeDeg: 40 }, DEFAULT_CONSTRAINTS).state).toBe("fail");
  });
  it("loads the real grid with provenance and a consistent raster", () => {
    expect(g.provenance.terrainProductId).toBe("lola-ldem-75s-240m-v2");
    expect(list.length).toBe(g.grid.size ** 2);
    const r = rasterize(g, list, DEFAULT_CONSTRAINTS);
    expect(r.counts.pass + r.counts.fail + r.counts.unknown).toBe(list.length);
    expect(gridExtent(g)[2]).toBe(g.grid.halfSizeM + g.grid.spacingM / 2);
  });
  it("maps a coordinate to the grid cell that contains it", () => {
    const [x, y] = toXY(-89.67, 129.78); // Shackleton floor: permanently shadowed
    const c = cellAt(g, list, x, y)!;
    expect(Math.abs(c.lat + 89.67)).toBeLessThan(0.2);
    expect(c.sunFraction).toBe(0);
    expect(evaluate(c, DEFAULT_CONSTRAINTS).failed.map((f) => f.key)).toContain("minSunPct");
    expect(cellAt(g, list, 900_000, 0)).toBeNull();
  });
});
