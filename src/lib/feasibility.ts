/**
 * Landing feasibility screening over the precomputed SPICE + LOLA grid
 * (science/moonnav_science/feasibility.py → public/data/feasibility/grid.json).
 *
 * Hard constraints only: each cell passes, fails (with the reasons) or is unknown. A missing
 * metric is never treated as passing or failing — the cell stays unknown.
 */

export type FeasibilityGrid = {
  kind: "moonnav.feasibility-grid";
  methodVersion: string;
  window: { startUtc: string; endUtc: string; sampleStepSeconds: number; sampleCount: number };
  grid: { projection: string; halfSizeM: number; spacingM: number; size: number };
  assumptions: Record<string, unknown>;
  provenance: { kernelManifestId: string; terrainProductId: string; terrainSha256: string; methodVersion: string };
  columns: string[];
  rows: (number | null)[][];
  generatedAtUtc: string;
  computeSeconds?: number;
};

export type Cell = {
  row: number;
  col: number;
  lat: number;
  lon: number;
  heightM: number | null;
  slopeDeg: number | null;
  sunFraction: number | null;
  longestDarkHours: number | null;
  dteFraction: number | null;
  unknownFraction: number;
  truncatedRays: number;
};

export type Constraints = { maxSlopeDeg: number; minSunPct: number; maxDarkHours: number; minDtePct: number };
export const DEFAULT_CONSTRAINTS: Constraints = { maxSlopeDeg: 10, minSunPct: 40, maxDarkHours: 240, minDtePct: 20 };

export type Check = { key: keyof Constraints; label: string; value: number | null; limit: number; pass: boolean | null; unit: string };
export type Verdict = { state: "pass" | "fail" | "unknown"; checks: Check[]; failed: Check[] };

export function cells(g: FeasibilityGrid): Cell[] {
  return g.rows.map((r) => Object.fromEntries(g.columns.map((c, i) => [c, r[i]])) as unknown as Cell);
}

export function evaluate(c: Cell, k: Constraints): Verdict {
  const chk = (key: keyof Constraints, label: string, value: number | null, limit: number, ok: (v: number) => boolean, unit: string): Check => ({ key, label, value, limit, pass: value == null ? null : ok(value), unit });
  const checks = [
    chk("maxSlopeDeg", "Slope (480 m baseline)", c.slopeDeg, k.maxSlopeDeg, (v) => v <= k.maxSlopeDeg, "°"),
    chk("minSunPct", "Direct sunlight", c.sunFraction == null ? null : c.sunFraction * 100, k.minSunPct, (v) => v >= k.minSunPct, "%"),
    chk("maxDarkHours", "Longest darkness", c.longestDarkHours, k.maxDarkHours, (v) => v <= k.maxDarkHours, "h"),
    chk("minDtePct", "Geometric DTE", c.dteFraction == null ? null : c.dteFraction * 100, k.minDtePct, (v) => v >= k.minDtePct, "%"),
  ];
  const failed = checks.filter((x) => x.pass === false);
  const state = failed.length ? "fail" : checks.some((x) => x.pass == null) ? "unknown" : "pass";
  return { state, checks, failed };
}

export const FEAS_COLORS = { pass: [70, 112, 77], fail1: [197, 164, 109], fail2: [168, 64, 47], unknown: [120, 116, 108] } as const;

/** RGBA pixels (row-major, row 0 = +y) for the grid; transparent where no cell exists. */
export function rasterize(g: FeasibilityGrid, list: Cell[], k: Constraints): { data: Uint8ClampedArray; size: number; counts: Record<"pass" | "fail" | "unknown", number> } {
  const n = g.grid.size;
  const data = new Uint8ClampedArray(n * n * 4);
  const counts = { pass: 0, fail: 0, unknown: 0 };
  for (const c of list) {
    const v = evaluate(c, k);
    counts[v.state]++;
    const rgb = v.state === "pass" ? FEAS_COLORS.pass : v.state === "unknown" ? FEAS_COLORS.unknown : v.failed.length > 1 ? FEAS_COLORS.fail2 : FEAS_COLORS.fail1;
    const o = (c.row * n + c.col) * 4;
    data.set([rgb[0], rgb[1], rgb[2], v.state === "fail" && v.failed.length > 1 ? 105 : 215], o);
  }
  return { data, size: n, counts };
}

/** Image extent in map metres: cell centres span ±halfSize, so edges extend half a cell further. */
export function gridExtent(g: FeasibilityGrid): [number, number, number, number] {
  const e = g.grid.halfSizeM + g.grid.spacingM / 2;
  return [-e, -e, e, e];
}

/** Nearest grid cell to a map coordinate, or null when the point is outside the grid. */
export function cellAt(g: FeasibilityGrid, list: Cell[], x: number, y: number): Cell | null {
  const { halfSizeM: h, spacingM: s, size } = g.grid;
  const col = Math.round((x + h) / s);
  const row = Math.round((h - y) / s);
  if (col < 0 || row < 0 || col >= size || row >= size) return null;
  return list.find((c) => c.row === row && c.col === col) ?? null;
}
