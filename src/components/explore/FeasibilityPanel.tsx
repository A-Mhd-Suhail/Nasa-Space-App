"use client";
import { useEffect, useMemo, useState } from "react";
import { type Cell, cells, type Constraints, DEFAULT_CONSTRAINTS, evaluate, FEAS_COLORS, type FeasibilityGrid, gridExtent, rasterize } from "@/lib/feasibility";
import type { RasterOverlay } from "../viz/LunarMap";
import { Card, CardHeader, DataTag, fmtUtc } from "../ui";

const rgb = (c: readonly number[]) => `rgb(${c.join(" ")})`;

/** Loads the precomputed grid and turns the user's hard constraints into a map overlay. */
export function useFeasibility(enabled: boolean) {
  const [grid, setGrid] = useState<FeasibilityGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [k, setK] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  useEffect(() => {
    if (!enabled || grid) return;
    let live = true;
    fetch("/data/feasibility/grid.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => live && setGrid(d))
      .catch((e) => live && setError(`Feasibility grid unavailable (${e.message}).`));
    return () => {
      live = false;
    };
  }, [enabled, grid]);
  const list = useMemo(() => (grid ? cells(grid) : []), [grid]);
  const raster = useMemo(() => (grid ? rasterize(grid, list, k) : null), [grid, list, k]);
  const overlay = useMemo<RasterOverlay | null>(() => {
    if (!grid || !raster || typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = cv.height = raster.size;
    cv.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.size, raster.size), 0, 0);
    return { url: cv.toDataURL("image/png"), extent: gridExtent(grid) };
  }, [grid, raster]);
  return { grid, list, k, setK, overlay, counts: raster?.counts ?? null, error };
}

export function FeasibilityPanel({ f }: { f: ReturnType<typeof useFeasibility> }) {
  const { grid, k, setK, counts, error } = f;
  if (error) return <p className="text-xs text-bad">{error}</p>;
  if (!grid) return <div className="h-40 animate-pulse rounded-[6px] border border-line bg-panel-2" />;
  const slider = (key: keyof Constraints, label: string, min: number, max: number, step: number, unit: string, help: string) => (
    <label className="block text-[13px]">
      <span className="flex justify-between text-text-2">
        <span>{label}</span>
        <span className="num text-text">{k[key]}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={k[key]} onChange={(e) => setK({ ...k, [key]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" aria-describedby={`h-${key}`} />
      <span id={`h-${key}`} className="text-[11px] text-muted">{help}</span>
    </label>
  );
  const total = counts ? counts.pass + counts.fail + counts.unknown : 0;
  return (
    <Card>
      <CardHeader title="Landing feasibility screen" tag={<DataTag kind="precomputed" />} subtitle={`Hard constraints over ${grid.grid.size}×${grid.grid.size} cells at ${grid.grid.spacingM / 1000} km spacing (to ${Math.abs(grid.rows.reduce((m, r) => Math.max(m, r[2] ?? -90), -90)).toFixed(1)}°S). Window ${fmtUtc(grid.window.startUtc).slice(0, 10)} → ${fmtUtc(grid.window.endUtc).slice(0, 10)}, ${grid.window.sampleStepSeconds / 3600} h samples.`} />
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {slider("maxSlopeDeg", "Maximum slope", 2, 30, 1, "°", "LOLA 480 m baseline; regional, not lander-scale hazard")}
        {slider("minSunPct", "Minimum direct sunlight", 0, 80, 5, "%", "share of samples with any of the Sun's disk above terrain")}
        {slider("maxDarkHours", "Maximum continuous darkness", 12, 720, 12, " h", "longest run of unlit samples in the window")}
        {slider("minDtePct", "Minimum geometric DTE", 0, 100, 5, "%", `Earth above terrain and the ${String(grid.assumptions.antennaMinimumElevationDeg)}° antenna mask; not RF link availability`)}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-xs text-text-2" data-testid="feasibility-legend">
        <Swatch color={rgb(FEAS_COLORS.pass)} label={`Meets all (${counts?.pass ?? 0})`} />
        <Swatch color={rgb(FEAS_COLORS.fail1)} label="Fails one" />
        <Swatch color={rgb(FEAS_COLORS.fail2)} label={`Fails two or more (fail total ${counts?.fail ?? 0})`} />
        <Swatch color={rgb(FEAS_COLORS.unknown)} label={`Unknown (${counts?.unknown ?? 0})`} />
        <span className="ml-auto text-muted">{total} cells · click the map for the reasons at a point</span>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-muted">
        Computed with SPICE ({grid.provenance.kernelManifestId}) and {grid.provenance.terrainProductId} by {grid.methodVersion}; sample-based fractions, unknown samples excluded. A screening aid for this window only — not a landing-site certification or hazard map. Run a full analysis for any point before relying on it.
      </p>
    </Card>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-3 w-3 rounded-[2px] border border-line" style={{ background: color }} />
      {label}
    </span>
  );
}

export function CellExplanation({ cell, k }: { cell: Cell; k: Constraints }) {
  const v = evaluate(cell, k);
  return (
    <div className="border-t border-line px-5 py-3 text-xs" data-testid="feasibility-explanation">
      <p className="mb-1.5 font-medium text-text">
        Feasibility cell {Math.abs(cell.lat).toFixed(2)}°S {cell.lon.toFixed(1)}°E:{" "}
        <span className={v.state === "pass" ? "text-ok" : v.state === "fail" ? "text-bad" : "text-muted"}>{v.state === "pass" ? "meets all constraints" : v.state === "fail" ? `fails ${v.failed.length}` : "unknown"}</span>
      </p>
      <ul className="num space-y-0.5 text-text-2">
        {v.checks.map((c) => (
          <li key={c.key}>
            {c.pass == null ? "?" : c.pass ? "✓" : "✗"} {c.label}: {c.value == null ? "unknown" : `${c.value.toFixed(1)}${c.unit}`} (limit {c.key.startsWith("max") ? "≤" : "≥"} {c.limit}{c.unit})
          </li>
        ))}
      </ul>
    </div>
  );
}
