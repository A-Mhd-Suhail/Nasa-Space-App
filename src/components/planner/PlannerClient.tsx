"use client";
import { Play } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EXPLAIN } from "@/lib/explain";
import { AdvancedOnly } from "../shell/ModeToggle";
import { Button, Card, CardHeader, cx, DataTag, Field, InfoTip, Input, Notice, Select } from "../ui";
import { FAIL_RGB, GridCanvas, ramp, SCORE_RAMP, SLOPE_RAMP } from "./GridCanvas";

const CompareBars = dynamic(() => import("../viz/charts").then((m) => m.CompareBars), { ssr: false });

type Site = { key: string; name: string; latitudeDeg: number; longitudeEastDeg: number };
type Check = { key: string; label: string; value: number | null; limit: number; unit: string; result: "pass" | "fail" | "unknown" };
type Evaluation = { status: "pass" | "fail" | "unknown"; checks: Check[]; score: number | null; breakdown: Record<string, number> | null; missingForScore: string[]; favourable: string[]; unfavourable: string[] };
type Metrics = Record<string, number | boolean | null>;
type Cell = { row: number; col: number; latitudeDeg: number; longitudeEastDeg: number; offsetEastM: number; offsetNorthM: number; metrics: Metrics; evaluation: Evaluation };
type GridResult = { grid: { size: number; spacingM: number; halfSizeM: number }; window: { startUtc: string; endUtc: string; stepSeconds: number; samples: number }; cells: Cell[]; bestPassing: { row: number; col: number; score: number; latitudeDeg: number; longitudeEastDeg: number }[]; counts: Record<string, number>; method: string; disclaimer: string };
type HazardResult = {
  grid: { spacingM: number; size: number; halfSizeM: number }; heightM: (number | null)[][]; slopeDeg: (number | null)[][]; roughnessM: (number | null)[][]; hazardClass: number[][]; rimRidge: number[][];
  summary: Record<string, number | null>; verdict: string; reasons: string[]; thresholds: Record<string, number>; productsUsed: Record<string, number>; finestResolutionM: number; method: string; disclaimer: string;
};
type SensRow = { dayShift: number; startUtc: string; sunHours: number | null; dteHours: number | null; meanSolarElevationLitDeg: number | null; score: number | null; status: string; deltaSunHours: number | null; deltaDteHours: number | null };
type SensLoc = { row: number; col: number; latitudeDeg: number; longitudeEastDeg: number; offsetEastM: number; offsetNorthM: number; distanceKm: number; sunHours: number | null; dteHours: number | null; slopeDeg: number | null; deltaSunHours: number | null; deltaDteHours: number | null; score: number | null; status: string };
type SensResult = {
  original: { metrics: Metrics; evaluation: Evaluation };
  location: { spacingM: number; size: number; cells: SensLoc[]; sunHoursRange: number[] | null; dteHoursRange: number[] | null; maxSunChangeHoursPerKm: number | null; maxDteChangeHoursPerKm: number | null; betterAlternatives: SensLoc[] };
  date: { rows: SensRow[]; sunHoursRange: number[] | null; dteHoursRange: number[] | null; betterAlternatives: SensRow[] };
  resolution: Record<string, unknown>;
};
type MatrixResult = { rows: { key: string; latitudeDeg: number; longitudeEastDeg: number; cells: (Cell & { startUtc: string })[] }[]; startsUtc: string[]; hours: number; method: string };

type TerrainData = { productId: string; resolutionM?: number | null; status?: string; fetched?: number; missing?: number; seconds?: number; reason?: string | null; reasons?: string[] }[];
type Coverage = { covered: boolean; baseResolutionM: number; finestAvailableResolutionM: number | null; layers: { productId: string; resolutionM: number; covered: boolean; tiles: number; cached: number; missing: number; downloadMB?: number; estimatedSeconds?: number | null }[] };

/** Which terrain resolution a result actually used, including any fallback to coarser data. */
function TerrainDataNote({ data }: { data?: TerrainData }) {
  if (!data) return null;
  if (data.length === 0) return <p className="text-xs text-muted" data-testid="terrain-data">Terrain: 240 m LOLA (no higher-resolution product covers this point).</p>;
  const fb = data.filter((d) => d.status === "fallback" || d.status === "partial");
  return (
    <p className={cx("text-xs", fb.length ? "text-warn" : "text-muted")} data-testid="terrain-data">
      Terrain used: {data.map((d) => `${d.resolutionM ?? "?"} m ${d.status === "ok" || d.status === "cached-only" ? "✓" : d.status === "fallback" ? "(fallback)" : d.status === "partial" ? "(partial)" : ""}${d.fetched ? ` · ${d.fetched} tiles downloaded${d.seconds ? ` in ${d.seconds} s` : ""}` : ""}`).join(" · ")}; far field and gaps use 240 m.
      {fb.map((d) => (d.reason ?? d.reasons?.join("; ")) && <span key={d.productId} className="block">{d.resolutionM} m: {d.reason ?? d.reasons?.join("; ")}</span>)}
    </p>
  );
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error?.fieldErrors?.[0] ? `${d.error.fieldErrors[0].field}: ${d.error.fieldErrors[0].message}` : d?.error?.message ?? `Request failed (${r.status})`);
  return d as T;
}

const fmt = (v: unknown, d = 1, unit = "") => (v == null || typeof v !== "number" ? "unavailable" : `${v.toFixed(d)}${unit}`);
const STATUS_CLS: Record<string, string> = { pass: "text-ok", fail: "text-bad", unknown: "text-unknown" };
const isoUtc = (dateStr: string, timeStr: string) => `${dateStr}T${timeStr}:00Z`;
const TABS = [["suitability", "Suitability map"], ["matrix", "Site × date matrix"], ["hazards", "Terrain hazards"], ["sensitivity", "Sensitivity"]] as const;
type Tab = (typeof TABS)[number][0];

function Explain({ e, m }: { e: Evaluation; m: Metrics }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={cx("text-[15px] font-semibold uppercase", STATUS_CLS[e.status])}>{e.status === "pass" ? "passes constraints" : e.status === "fail" ? "fails a constraint" : "unknown — missing data"}</span>
        <span className="num">score {e.score == null ? "— (not scored)" : `${e.score.toFixed(1)}/100`}</span>
      </div>
      {e.breakdown && <p className="num text-xs text-muted">{Object.entries(e.breakdown).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" + ")} = {e.score?.toFixed(1)}</p>}
      {e.missingForScore.length > 0 && <p className="text-xs text-unknown">Not scored: {e.missingForScore.join(", ")} unavailable (missing data is never treated as favourable).</p>}
      <table className="w-full text-xs">
        <caption className="sr-only">Hard-constraint checks</caption>
        <tbody>
          {e.checks.map((c) => (
            <tr key={c.key} className="border-t border-line">
              <td className="py-1 pr-2">{c.label}</td>
              <td className="num py-1 pr-2">{c.value == null ? "unavailable" : `${c.value}${c.unit}`}</td>
              <td className="num py-1 pr-2 text-muted">limit {c.limit}{c.unit}</td>
              <td className={cx("py-1 font-medium uppercase", STATUS_CLS[c.result])}>{c.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="num grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {[
          ["Direct sunlight", fmt(m.sunHours, 1, " h"), fmt(m.sunPct, 1, "%")],
          ["Mean solar elevation while lit", fmt(m.meanSolarElevationLitDeg, 2, "°"), ""],
          ["Earth in line of sight", fmt(m.earthPct, 1, "%"), ""],
          ["Geometric DTE", fmt(m.dteHours, 1, " h"), fmt(m.dtePct, 1, "%")],
          ["Longest darkness", fmt(m.longestDarkHours, 1, " h"), "sample resolution"],
          ["Longest DTE blackout", fmt(m.longestBlackoutHours, 1, " h"), "sample resolution"],
          ["Sun up but terrain-blocked", fmt(m.sunTerrainBlockedPct, 1, "%"), "terrain obstruction"],
          ["Elevation", fmt(m.heightM, 1, " m"), "LOLA, measured"],
          ["Slope", fmt(m.slopeDeg, 2, "°"), `${fmt(m.terrainResolutionM, 0, " m")} grid`],
          ["Roughness (RMS)", fmt(m.roughnessM, 2, " m"), "3×3 plane residual"],
          ["Unknown time", fmt(m.unknownPct, 1, "%"), "DEM coverage"],
        ].map(([k, v, h]) => (
          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v} <span className="text-muted">{h}</span></dd></div>
        ))}
      </dl>
    </div>
  );
}

export function PlannerClient({ sites }: { sites: Site[] }) {
  const [tab, setTab] = useState<Tab>("suitability");
  const [siteKey, setSiteKey] = useState("mons-malapert");
  const [custom, setCustom] = useState({ lat: "", lon: "" });
  const [date, setDate] = useState("2026-12-15");
  const [time, setTime] = useState("00:00");
  const [days, setDays] = useState("7");
  const [step, setStep] = useState("3600");
  const [cfg, setCfg] = useState({ minSunPct: "30", minDtePct: "20", maxSlopeDeg: "15", maxRoughnessM: "1.5", maxUnknownPct: "5", maxDarkHours: "", antennaMaskDeg: "" });
  const [w, setW] = useState({ sun: 35, dte: 30, slope: 20, roughness: 10, solarElevation: 5 });
  const [busy, setBusy] = useState<string | null>(null);
  const [fetchHighRes, setFetchHighRes] = useState(true);
  const [cov, setCov] = useState<{ key: string; data: Coverage | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const site = useMemo(() => {
    if (siteKey !== "custom") {
      const s = sites.find((x) => x.key === siteKey);
      return s ? { lat: s.latitudeDeg, lon: s.longitudeEastDeg, label: s.name } : null;
    }
    const la = Number(custom.lat), lo = Number(custom.lon);
    if (custom.lat.trim() === "" || custom.lon.trim() === "" || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
    return { lat: la, lon: lo, label: `${Math.abs(la).toFixed(3)}°S ${(((lo % 360) + 360) % 360).toFixed(3)}°E` };
  }, [siteKey, custom, sites]);
  const siteError = siteKey === "custom" && site && (site.lat < -90 || site.lat > -75) ? "Latitude must be between −90° and −75° (LOLA polar terrain coverage)" : siteKey === "custom" && site && Math.abs(site.lon) > 360 ? "Longitude must be within ±360° (east-positive)" : null;
  const covKey = site && !siteError ? `${site.lat.toFixed(4)},${site.lon.toFixed(4)}` : "";
  useEffect(() => {
    if (!covKey) return;
    const [la, lo] = covKey.split(",");
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/terrain/coverage?lat=${la}&lon=${lo}&radiusM=1620`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setCov({ key: covKey, data: d }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [covKey, busy]);
  const coverage = cov && cov.key === covKey ? cov.data : null;
  const startUtc = isoUtc(date, time);
  const hours = Number(days) * 24;
  const endUtc = useMemo(() => {
    const t = Date.parse(startUtc) + hours * 3_600_000;
    return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z") : "";
  }, [startUtc, hours]);
  const config = () => ({
    ...Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v.trim() === "" ? null : Number(v)])),
    maxUnknownPct: cfg.maxUnknownPct.trim() === "" ? 5 : Number(cfg.maxUnknownPct),
    weights: w,
  });

  const [grid, setGrid] = useState<GridResult | null>(null);
  const [gridSize, setGridSize] = useState("7");
  const [extentKm, setExtentKm] = useState("3");
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const [haz, setHaz] = useState<HazardResult | null>(null);
  const [hazHalf, setHazHalf] = useState("1000");
  const [hazTh, setHazTh] = useState({ slopeCautionDeg: "8", slopeMaxDeg: "15", roughnessCautionM: "0.5", roughnessMaxM: "1.5", landingRadiusM: "100" });
  const [hazLayer, setHazLayer] = useState<"class" | "slope" | "roughness" | "height">("class");
  const [hazSel, setHazSel] = useState<{ row: number; col: number } | null>(null);
  const [sens, setSens] = useState<SensResult | null>(null);
  const [sensSpacing, setSensSpacing] = useState("500");
  const [matrix, setMatrix] = useState<MatrixResult | null>(null);
  const [mxSites, setMxSites] = useState<string[]>(["mons-malapert", "mons-mouton"]);
  const [mxStarts, setMxStarts] = useState("2026-12-01, 2026-12-08, 2026-12-15");
  const [mxSel, setMxSel] = useState<{ r: number; c: number } | null>(null);

  const run = useCallback(async (what: Tab) => {
    if (!site || siteError) return setErr(siteError ?? "Choose a site or enter valid coordinates");
    setBusy(what);
    setErr(null);
    try {
      const base = { latitudeDeg: site.lat, longitudeEastDeg: site.lon };
      if (what === "suitability") {
        const n = Number(gridSize);
        const r = await post<GridResult>("/api/v1/suitability/grid", { ...base, startUtc, endUtc, stepSeconds: Number(step), gridSize: n, halfSizeM: n === 1 ? 0 : Number(extentKm) * 1000, config: config(), fetchHighRes });
        setGrid(r);
        setSel({ row: (n - 1) / 2, col: (n - 1) / 2 });
      } else if (what === "hazards") {
        const r = await post<HazardResult>("/api/v1/terrain/hazards", { ...base, halfSizeM: Number(hazHalf), ...Object.fromEntries(Object.entries(hazTh).map(([k, v]) => [k, Number(v)])), fetchHighRes });
        setHaz(r);
        setHazSel({ row: Math.floor(r.grid.size / 2), col: Math.floor(r.grid.size / 2) });
      } else if (what === "sensitivity") {
        setSens(await post<SensResult>("/api/v1/sensitivity", { ...base, startUtc, hours, stepSeconds: Number(step), spacingM: Number(sensSpacing), gridSize: 5, config: config(), fetchHighRes }));
      } else {
        const starts = mxStarts.split(/[,\s]+/).filter(Boolean).map((d) => (d.includes("T") ? d : `${d}T${time}:00Z`));
        const chosen = mxSites.map((k) => (k === "custom" && site ? { key: site.label, latitudeDeg: site.lat, longitudeEastDeg: site.lon } : sites.find((s) => s.key === k))).filter(Boolean) as { key?: string; name?: string; latitudeDeg: number; longitudeEastDeg: number }[];
        const r = await post<MatrixResult>("/api/v1/suitability/matrix", { sites: chosen.map((s) => ({ key: s.name ?? s.key, latitudeDeg: s.latitudeDeg, longitudeEastDeg: s.longitudeEastDeg })), startsUtc: starts, hours, stepSeconds: Number(step), config: config(), fetchHighRes });
        setMatrix(r);
        setMxSel(null);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config() reads current state
  }, [site, siteError, gridSize, extentKm, startUtc, endUtc, step, hazHalf, hazTh, sensSpacing, mxStarts, mxSites, hours, time, sites, cfg, w]);

  const selCell = grid && sel ? grid.cells.find((c) => c.row === sel.row && c.col === sel.col) ?? null : null;
  const gridColor = useCallback((r: number, c: number) => {
    const cell = grid?.cells.find((x) => x.row === r && x.col === c);
    if (!cell || cell.evaluation.status === "unknown") return null;
    if (cell.evaluation.status === "fail") return FAIL_RGB;
    return ramp(SCORE_RAMP, (cell.evaluation.score ?? 0) / 100);
  }, [grid]);
  const hazColor = useCallback((r: number, c: number) => {
    if (!haz) return null;
    if (hazLayer === "class") {
      const k = haz.hazardClass[r][c];
      return k < 0 ? null : k === 0 ? [112, 146, 104] as [number, number, number] : k === 1 ? [214, 178, 104] as [number, number, number] : FAIL_RGB;
    }
    const v = hazLayer === "slope" ? haz.slopeDeg[r][c] : hazLayer === "roughness" ? haz.roughnessM[r][c] : haz.heightM[r][c];
    if (v == null) return null;
    if (hazLayer === "height") {
      const all = haz.heightM.flat().filter((x): x is number => x != null);
      const lo = Math.min(...all), hi = Math.max(...all);
      return ramp(SLOPE_RAMP, hi > lo ? (v - lo) / (hi - lo) : 0.5);
    }
    return ramp(SLOPE_RAMP, hazLayer === "slope" ? v / 30 : v / 3);
  }, [haz, hazLayer]);
  const sensColor = useCallback((r: number, c: number) => {
    const cell = sens?.location.cells.find((x) => x.row === r && x.col === c);
    if (!cell || cell.deltaSunHours == null) return null;
    const span = Math.max(1, ...(sens?.location.cells.map((x) => Math.abs(x.deltaSunHours ?? 0)) ?? [1]));
    const t = 0.5 + cell.deltaSunHours / (2 * span);
    return ramp([[166, 94, 69], [244, 240, 231], [58, 98, 66]], t);
  }, [sens]);

  const n = (k: keyof typeof cfg, label: string, unit: string) => (
    <Field label={`${label} (${unit})`} htmlFor={`cfg-${k}`}><Input id={`cfg-${k}`} inputMode="decimal" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} placeholder="none" /></Field>
  );

  return (
    <div className="space-y-4">
      <p className="simple-only rounded-[6px] border border-line bg-panel px-4 py-3 text-[15px] leading-relaxed text-text-2" data-testid="planner-simple">Pick a site and dates, then press <strong>Run</strong>. Green squares are places that meet your mission&apos;s needs (enough sunlight, Earth in view, gentle slopes); red ones fail at least one; grey means we don&apos;t have enough data to say. Click any square to see why.</p>
      <Notice tone="warn">Preliminary screening from NASA LOLA terrain and NAIF SPICE geometry — not a certified landing-safety assessment and not an official NASA rating. Missing data is shown as unknown (grey, hatched) and never counted as safe. Sunlight alone never establishes landing safety.</Notice>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader title="Site and window" subtitle="Shared by all four tools" />
          <div className="space-y-3 p-4">
            <Field label="Landing site" htmlFor="pl-site">
              <Select id="pl-site" value={siteKey} onChange={(e) => setSiteKey(e.target.value)}>
                {sites.map((s) => <option key={s.key} value={s.key}>{s.name} ({Math.abs(s.latitudeDeg).toFixed(2)}°S)</option>)}
                <option value="custom">Custom coordinates…</option>
              </Select>
            </Field>
            {siteKey === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Latitude (°, −90…−75)" htmlFor="pl-lat"><Input id="pl-lat" inputMode="decimal" value={custom.lat} onChange={(e) => setCustom({ ...custom, lat: e.target.value })} placeholder="-89.45" /></Field>
                <Field label="Longitude (°E)" htmlFor="pl-lon"><Input id="pl-lon" inputMode="decimal" value={custom.lon} onChange={(e) => setCustom({ ...custom, lon: e.target.value })} placeholder="222.69" /></Field>
              </div>
            )}
            {siteError && <p role="alert" className="text-xs text-bad">{siteError}</p>}
            <div className="rounded-md border border-line bg-panel-2 p-2.5 text-xs text-text-2" data-testid="coverage-box" aria-live="polite">
              {!coverage ? "Checking high-resolution terrain coverage…" : !coverage.covered ? "Outside LOLA polar terrain coverage." : (() => {
                const best = coverage.layers.find((l) => l.covered);
                if (!best) return <>Best terrain here: <strong>240 m</strong> LOLA (no 5/20/40 m product covers this point).</>;
                return (
                  <>
                    Best terrain here: <strong>{best.resolutionM} m</strong> LOLA ({best.cached}/{best.tiles} tiles cached around the site).
                    {best.missing > 0 && <span className="block">First run downloads {best.missing} tile{best.missing === 1 ? "" : "s"} (~{best.downloadMB} MB) from NASA PDS{best.estimatedSeconds ? `, about ${Math.max(1, Math.round(best.estimatedSeconds))} s` : ""}; later runs are instant.</span>}
                  </>
                );
              })()}
              <label className="mt-1.5 flex items-center gap-2"><input type="checkbox" checked={fetchHighRes} onChange={(e) => setFetchHighRes(e.target.checked)} data-testid="fetch-highres" /> Download missing high-resolution tiles</label>
              {!fetchHighRes && <span className="mt-1 block text-warn">Fast mode: only cached tiles are used; elsewhere results fall back to 240 m and say so.</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start date (UTC)" htmlFor="pl-date"><Input id="pl-date" type="date" min="2023-01-01" max="2049-12-31" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Start time (UTC)" htmlFor="pl-time"><Input id="pl-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
              <Field label="Length (days)" htmlFor="pl-days"><Input id="pl-days" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
              <Field label="Sample step" htmlFor="pl-step"><Select id="pl-step" value={step} onChange={(e) => setStep(e.target.value)}><option value="1800">30 min</option><option value="3600">1 h</option><option value="7200">2 h</option><option value="21600">6 h</option></Select></Field>
            </div>
            <p className="num text-xs text-muted">{startUtc} → {endUtc || "—"} · a lunar day is ≈29.53 Earth days</p>
            <details className="rounded-md border border-line p-2.5 text-sm">
              <summary className="cursor-pointer text-text-2">Mission requirements & weights</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {n("minSunPct", "Min. sunlight", "%")}
                {n("minDtePct", "Min. DTE", "%")}
                {n("maxSlopeDeg", "Max. slope", "°")}
                {n("maxRoughnessM", "Max. roughness", "m")}
                {n("maxUnknownPct", "Max. unknown", "%")}
                {n("maxDarkHours", "Max. darkness", "h")}
                {n("antennaMaskDeg", "Antenna mask", "°")}
              </div>
              <fieldset className="relative mt-2 space-y-1">
                <legend className="flex items-center gap-1 text-xs text-muted">Score weights <InfoTip text={EXPLAIN.feasibility} /></legend>
                {(Object.keys(w) as (keyof typeof w)[]).map((k) => (
                  <label key={k} className="block text-xs text-text-2"><span className="flex justify-between"><span>{k}</span><span className="num">{w[k]}</span></span>
                    <input type="range" min={0} max={100} step={5} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-full accent-[var(--accent)]" aria-label={`${k} weight`} />
                  </label>
                ))}
              </fieldset>
            </details>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div role="tablist" aria-label="Planner tools" className="flex flex-wrap gap-1 rounded-[6px] border border-line bg-panel p-1 text-sm">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("rounded-[4px] px-3 py-1.5", tab === k ? "bg-accent text-accent-ink" : "text-text-2 hover:bg-panel-3/60")}>{l}</button>
            ))}
          </div>
          {err && <Notice tone="bad" title="Calculation failed">{err}</Notice>}

          {tab === "suitability" && (
            <Card>
              <CardHeader title="Landing suitability map" tag={<DataTag kind="calculated" />} subtitle="Each cell is evaluated for the chosen window: SPICE Sun/Earth, terrain horizon, LOLA slope and roughness, then hard constraints and an explainable score." />
              <div className="flex flex-wrap items-end gap-2 border-b border-line p-4">
                <Field label="Grid (cells per side)" htmlFor="g-n"><Select id="g-n" value={gridSize} onChange={(e) => setGridSize(e.target.value)}>{["1", "3", "5", "7", "9", "11", "15"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
                <Field label="Half-width (km)" htmlFor="g-km"><Input id="g-km" inputMode="decimal" value={extentKm} onChange={(e) => setExtentKm(e.target.value)} /></Field>
                <Button variant="primary" onClick={() => run("suitability")} disabled={!!busy} data-testid="run-suitability"><Play size={14} /> {busy === "suitability" ? "Calculating…" : "Run suitability"}</Button>
              </div>
              {grid ? (
                <div className="grid gap-4 p-4 xl:grid-cols-[auto_1fr]" data-testid="suitability-result">
                  <div>
                    <GridCanvas n={grid.grid.size} color={gridColor} selected={sel} onSelect={(row, col) => setSel({ row, col })} label={`Suitability grid ${grid.grid.size} by ${grid.grid.size}`} />
                    <p className="num mt-2 text-xs text-muted">{grid.counts.pass} pass · {grid.counts.fail} fail · {grid.counts.unknown} unknown · cell {(grid.grid.spacingM / 1000).toFixed(2)} km · {grid.window.samples} epochs</p>
                    <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted"><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[rgb(58,98,66)]" />high score</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[rgb(226,216,196)]" />low score</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[rgb(176,92,74)]" />fails</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[#8d877d]" />unknown</span></p>
                  </div>
                  <div className="min-w-0 space-y-3">
                    {selCell && (
                      <div data-testid="cell-explanation">
                        <h3 className="font-medium">Cell {selCell.row + 1},{selCell.col + 1} — {Math.abs(selCell.latitudeDeg).toFixed(4)}°S {selCell.longitudeEastDeg.toFixed(4)}°E <span className="text-xs text-muted">({(selCell.offsetEastM / 1000).toFixed(2)}, {(selCell.offsetNorthM / 1000).toFixed(2)} km)</span></h3>
                        <Explain e={selCell.evaluation} m={selCell.metrics} />
                      </div>
                    )}
                    {grid.bestPassing.length > 0 && <p className="text-xs text-text-2">Highest-scoring passing cells: {grid.bestPassing.map((b) => <button key={`${b.row}-${b.col}`} type="button" className="mr-2 underline" onClick={() => setSel({ row: b.row, col: b.col })}>{b.score.toFixed(1)} at ({b.row + 1},{b.col + 1})</button>)}</p>}
                    <TerrainDataNote data={(grid as GridResult & { terrainData?: TerrainData }).terrainData} />
                    <AdvancedOnly><p className="text-xs text-muted">{grid.method}</p></AdvancedOnly>
                    <p className="text-xs text-muted">{grid.disclaimer}</p>
                  </div>
                </div>
              ) : <p className="p-4 text-sm text-muted">Choose a site and window, then run. A 7×7 grid over ±3 km for one week at 1 h steps takes a few seconds (longer the first time a high-resolution area is fetched from NASA PDS).</p>}
            </Card>
          )}

          {tab === "matrix" && (
            <Card>
              <CardHeader title="Site × date suitability matrix" tag={<DataTag kind="calculated" />} subtitle="The same requirements evaluated at several sites and window start dates." />
              <div className="space-y-3 border-b border-line p-4">
                <fieldset>
                  <legend className="mb-1 text-xs text-muted">Sites (up to 8)</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {[...sites.map((s) => [s.key, s.name] as const), ...(siteKey === "custom" && site ? [["custom", `Custom (${site.label})`] as const] : [])].map(([k, l]) => (
                      <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={mxSites.includes(k)} disabled={!mxSites.includes(k) && mxSites.length >= 8} onChange={() => setMxSites((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))} />{l}</label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Window start dates (UTC, comma-separated; window length from the panel)" htmlFor="mx-starts"><Input id="mx-starts" value={mxStarts} onChange={(e) => setMxStarts(e.target.value)} /></Field>
                <Button variant="primary" onClick={() => run("matrix")} disabled={!!busy || mxSites.length === 0} data-testid="run-matrix"><Play size={14} /> {busy === "matrix" ? "Calculating…" : "Run matrix"}</Button>
              </div>
              {matrix && (
                <div className="space-y-3 p-4" data-testid="matrix-result">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <caption className="sr-only">Suitability by site and window</caption>
                      <thead className="text-left text-xs text-muted"><tr><th scope="col" className="px-2 py-1.5 font-medium">Site</th>{matrix.startsUtc.map((s) => <th key={s} scope="col" className="px-2 py-1.5 font-medium">{s.slice(0, 16).replace("T", " ")}</th>)}</tr></thead>
                      <tbody className="num">
                        {matrix.rows.map((r, i) => (
                          <tr key={r.key} className="border-t border-line">
                            <th scope="row" className="px-2 py-1.5 text-left font-medium">{r.key}</th>
                            {r.cells.map((c, j) => (
                              <td key={j} className="px-2 py-1.5">
                                <button type="button" onClick={() => setMxSel({ r: i, c: j })} className={cx("w-full rounded px-1.5 py-1 text-left hover:bg-panel-2", mxSel?.r === i && mxSel.c === j && "ring-1 ring-accent")}>
                                  <span className={cx("font-semibold uppercase", STATUS_CLS[c.evaluation.status])}>{c.evaluation.status}</span> {c.evaluation.score == null ? "" : `· ${c.evaluation.score.toFixed(1)}`}
                                  <span className="block text-xs text-muted"><span className="text-sun">{fmt(c.metrics.sunHours, 0, " h")}</span> / <span className="text-earth">{fmt(c.metrics.dteHours, 0, " h")}</span></span>
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mxSel && <div className="rounded-md border border-line p-3"><h3 className="mb-1 font-medium">{matrix.rows[mxSel.r].key} · {matrix.startsUtc[mxSel.c]}</h3><Explain e={matrix.rows[mxSel.r].cells[mxSel.c].evaluation} m={matrix.rows[mxSel.r].cells[mxSel.c].metrics} /></div>}
                  <AdvancedOnly><p className="text-xs text-muted">{matrix.method}</p></AdvancedOnly>
                </div>
              )}
            </Card>
          )}

          {tab === "hazards" && (
            <Card>
              <CardHeader title="Terrain hazard screening" tag={<DataTag kind="calculated" />} subtitle="Slope, roughness, relief and rim/ridge signatures from the finest LOLA product at the site (5 m / 20 m / 40 m tiles or 240 m)." />
              <div className="flex flex-wrap items-end gap-2 border-b border-line p-4">
                <Field label="Half-width (m)" htmlFor="hz-half"><Input id="hz-half" inputMode="decimal" value={hazHalf} onChange={(e) => setHazHalf(e.target.value)} /></Field>
                {(Object.keys(hazTh) as (keyof typeof hazTh)[]).map((k) => (
                  <Field key={k} label={k.replace(/([A-Z])/g, " $1").toLowerCase()} htmlFor={`hz-${k}`}><Input id={`hz-${k}`} inputMode="decimal" value={hazTh[k]} onChange={(e) => setHazTh({ ...hazTh, [k]: e.target.value })} className="w-24" /></Field>
                ))}
                <Button variant="primary" onClick={() => run("hazards")} disabled={!!busy} data-testid="run-hazards"><Play size={14} /> {busy === "hazards" ? "Screening…" : "Screen terrain"}</Button>
              </div>
              {haz && (
                <div className="grid gap-4 p-4 xl:grid-cols-[auto_1fr]" data-testid="hazard-result">
                  <div>
                    <div role="tablist" aria-label="Hazard layer" className="mb-2 flex gap-1 text-xs">
                      {(["class", "slope", "roughness", "height"] as const).map((l) => <button key={l} type="button" role="tab" aria-selected={hazLayer === l} onClick={() => setHazLayer(l)} className={cx("rounded px-2 py-1", hazLayer === l ? "bg-accent text-accent-ink" : "border border-line text-text-2")}>{l}</button>)}
                    </div>
                    <GridCanvas n={haz.grid.size} color={hazColor} selected={hazSel} onSelect={(row, col) => setHazSel({ row, col })} circleCells={haz.thresholds.landingRadiusM / haz.grid.spacingM} label={`Terrain ${hazLayer} map`} />
                    <p className="num mt-2 text-xs text-muted">{haz.grid.size}×{haz.grid.size} cells of {haz.grid.spacingM.toFixed(0)} m · dashed circle = landing zone ({haz.thresholds.landingRadiusM} m) · {Object.entries(haz.productsUsed).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
                    {hazLayer === "class" && <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted"><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[rgb(112,146,104)]" />within thresholds</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[rgb(214,178,104)]" />caution</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[rgb(176,92,74)]" />exceeds</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-[#8d877d]" />unknown</span></p>}
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className={cx("font-semibold uppercase", haz.verdict === "within_thresholds" ? "text-ok" : haz.verdict === "exceeds" ? "text-bad" : haz.verdict === "caution" ? "text-warn" : "text-unknown")} data-testid="hazard-verdict">{haz.verdict.replace(/_/g, " ")}</span> in the {haz.thresholds.landingRadiusM} m landing zone</p>
                    <ul className="list-disc pl-5 text-text-2">{haz.reasons.map((r) => <li key={r}>{r}</li>)}{haz.reasons.length === 0 && <li>No screened indicator exceeds its threshold at {haz.grid.spacingM.toFixed(0)} m resolution.</li>}</ul>
                    <dl className="num grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {Object.entries(haz.summary).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{v == null ? "unavailable" : v}</dd></div>)}
                    </dl>
                    {hazSel && (
                      <p className="num rounded border border-line p-2 text-xs">Selected cell: height {fmt(haz.heightM[hazSel.row][hazSel.col], 1, " m")} · slope {fmt(haz.slopeDeg[hazSel.row][hazSel.col], 2, "°")} · roughness {fmt(haz.roughnessM[hazSel.row][hazSel.col], 2, " m")} · class {["unknown", "within thresholds", "caution", "exceeds"][haz.hazardClass[hazSel.row][hazSel.col] + 1]}{haz.rimRidge[hazSel.row][hazSel.col] ? " · rim/ridge" : ""}</p>
                    )}
                    <AdvancedOnly><p className="text-xs text-muted">{haz.method}</p></AdvancedOnly>
                    <TerrainDataNote data={(haz as HazardResult & { terrainData?: TerrainData }).terrainData} />
                    <p className="text-xs text-muted">{haz.disclaimer}</p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {tab === "sensitivity" && (
            <Card>
              <CardHeader title="Location and date sensitivity" tag={<DataTag kind="calculated" />} subtitle="Recalculates sunlight and direct-to-Earth time on a 5×5 grid around the site and for date shifts of −7 to +7 days. Every alternative listed was actually computed." />
              <div className="flex flex-wrap items-end gap-2 border-b border-line p-4">
                <Field label="Grid spacing (m)" htmlFor="s-sp"><Input id="s-sp" inputMode="decimal" value={sensSpacing} onChange={(e) => setSensSpacing(e.target.value)} /></Field>
                <Button variant="primary" onClick={() => run("sensitivity")} disabled={!!busy} data-testid="run-sensitivity"><Play size={14} /> {busy === "sensitivity" ? "Calculating…" : "Run sensitivity"}</Button>
              </div>
              {sens && (
                <div className="space-y-4 p-4" data-testid="sensitivity-result">
                  <div className="grid gap-4 xl:grid-cols-[auto_1fr]">
                    <div>
                      <GridCanvas n={sens.location.size} color={sensColor} label="Change in sunlight hours around the site" size={260} selected={{ row: 2, col: 2 }} />
                      <p className="mt-1 text-xs text-muted">Δ sunlight vs the original point (centre): green more, copper less.</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p>Within ±{(sens.location.spacingM * 2 / 1000).toFixed(1)} km, sunlight ranges <strong className="num">{sens.location.sunHoursRange?.join("–") ?? "—"} h</strong> and direct-to-Earth <strong className="num">{sens.location.dteHoursRange?.join("–") ?? "—"} h</strong>. Steepest change: <span className="num">{fmt(sens.location.maxSunChangeHoursPerKm, 1)} h of sunlight per km</span>.</p>
                      <p>Shifting the window by −7…+7 days, sunlight ranges <strong className="num">{sens.date.sunHoursRange?.join("–") ?? "—"} h</strong> and direct-to-Earth <strong className="num">{sens.date.dteHoursRange?.join("–") ?? "—"} h</strong>.</p>
                      <h3 className="pt-1 font-medium">Better alternatives (computed, passing all constraints)</h3>
                      {sens.location.betterAlternatives.length + sens.date.betterAlternatives.length === 0 ? <p className="text-text-2">None of the evaluated alternatives scores higher while passing every constraint.</p> : (
                        <ul className="num list-disc pl-5 text-text-2">
                          {sens.location.betterAlternatives.map((a) => <li key={`l${a.row}${a.col}`}>Move {(a.offsetEastM / 1000).toFixed(2)} km E, {(a.offsetNorthM / 1000).toFixed(2)} km N ({Math.abs(a.latitudeDeg).toFixed(4)}°S {a.longitudeEastDeg.toFixed(4)}°E): score {a.score?.toFixed(1)}, sunlight {fmt(a.sunHours, 0, " h")}, DTE {fmt(a.dteHours, 0, " h")}</li>)}
                          {sens.date.betterAlternatives.map((a) => <li key={`d${a.dayShift}`}>Start {a.startUtc.slice(0, 16).replace("T", " ")} UTC ({a.dayShift > 0 ? "+" : ""}{a.dayShift} d): score {a.score?.toFixed(1)}, sunlight {fmt(a.sunHours, 0, " h")}, DTE {fmt(a.dteHours, 0, " h")}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                  <CompareBars yName="h" max={null} ariaLabel="Sunlight and direct-to-Earth hours for each date shift" labels={sens.date.rows.map((r) => `${r.dayShift > 0 ? "+" : ""}${r.dayShift} d`)} series={[{ name: "Sunlight (h)", values: sens.date.rows.map((r) => r.sunHours ?? 0), color: "sun", unit: "h" }, { name: "Direct-to-Earth (h)", values: sens.date.rows.map((r) => r.dteHours ?? 0), color: "earth", unit: "h" }]} />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-xs">
                      <caption className="sr-only">Date sensitivity</caption>
                      <thead className="text-left text-muted"><tr>{["Shift", "Start (UTC)", "Sunlight", "Δ", "DTE", "Δ", "Status", "Score"].map((h, i) => <th key={i} scope="col" className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
                      <tbody className="num">{sens.date.rows.map((r) => <tr key={r.dayShift} className={cx("border-t border-line", r.dayShift === 0 && "bg-accent-soft")}><td className="px-2 py-1">{r.dayShift > 0 ? "+" : ""}{r.dayShift} d</td><td className="px-2 py-1">{r.startUtc.slice(0, 16).replace("T", " ")}</td><td className="px-2 py-1">{fmt(r.sunHours, 1, " h")}</td><td className="px-2 py-1">{fmt(r.deltaSunHours, 1)}</td><td className="px-2 py-1">{fmt(r.dteHours, 1, " h")}</td><td className="px-2 py-1">{fmt(r.deltaDteHours, 1)}</td><td className={cx("px-2 py-1 uppercase", STATUS_CLS[r.status])}>{r.status}</td><td className="px-2 py-1">{r.score == null ? "—" : r.score.toFixed(1)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <TerrainDataNote data={(sens as SensResult & { terrainData?: TerrainData }).terrainData} />
                  <p className="text-xs text-muted">Resolution: {Object.entries(sens.resolution).map(([k, v]) => `${k} ${String(v)}`).join(" · ")}</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
