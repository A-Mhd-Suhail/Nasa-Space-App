"use client";
import { useMemo, useState } from "react";
import type { HorizonData, TimeRow } from "@/lib/analysis-types";
import type { AnalysisResult } from "@/lib/analysis-types";
import { ElevationTimeline, HorizonPanorama, PowerChart } from "../viz/charts";
import { PolarSkyPlot } from "../viz/PolarSkyPlot";
import { TimeControl, useTimeline } from "../viz/TimeControl";
import { Card, CardHeader, DataTag, fmtHours, fmtNum, fmtUtc, Notice, Stat, StatePill } from "../ui";
import { EXPLAIN } from "@/lib/explain";
import { AdvancedOnly, SimpleOnly } from "../shell/ModeToggle";
import { IntervalTable, PowerPanel, ProvenancePanel, QualityPanel } from "./panels";
import { OperationsPanel } from "./OperationsPanel";
import { LinkBudgetPanel, SolarSurfacePanel } from "./SolarSurfacePanel";
import { BlockExplanation, PlainSummary } from "./PlainLanguage";

function LiveSummary({ r, i }: { r: AnalysisResult; i: number }) {
  const row = r.timeseries[i];
  if (!row) return null;
  return (
    <p className="sr-only" aria-live="polite">
      {`Site ${Math.abs(r.site.latitudeDeg).toFixed(3)} degrees south, ${r.site.longitudeEastDeg.toFixed(3)} degrees east. ${fmtUtc(row.utc)}. Sun ${row.sunState.replace(/_/g, " ")}, elevation ${fmtNum(row.sunElDeg, 2)} degrees. Earth ${row.earthState.replace(/_/g, " ")}, elevation ${fmtNum(row.earthElDeg, 2)} degrees.`}
    </p>
  );
}

export function SunView({ r, precomputed }: { r: AnalysisResult; precomputed?: boolean }) {
  const t = useTimeline(r.timeseries.length);
  const row = r.timeseries[t.index];
  const kind = precomputed ? "precomputed" : "calculated";
  const clearance = row?.sunElDeg != null && row?.sunHorizonDeg != null ? row.sunElDeg - row.sunHorizonDeg : null;
  const rows = useMemo(() => r.timeseries, [r]);
  return (
    <div className="space-y-4">
      <LiveSummary r={r} i={t.index} />
      <TimeControl rows={rows} t={t} />
      <SimpleOnly><PlainSummary r={r} body="sun" index={t.index} /></SimpleOnly>
      <BlockExplanation r={r} body="sun" index={t.index} />
      <OperationsPanel r={r} body="sun" index={t.index} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Sun azimuth" info={EXPLAIN.solarAzimuth} value={fmtNum(row?.sunAzDeg, 2)} unit="°" kind={kind} accent="sun" hint="clockwise from local north" />
        <Stat label="Sun elevation (topocentric)" info={EXPLAIN.solarElevation} value={fmtNum(row?.sunElDeg, 3)} unit="°" kind={kind} accent="sun" hint={`apparent, ${r.provenance.aberrationCorrection}`} />
        <Stat label="Terrain horizon at Sun azimuth" info={EXPLAIN.horizon} value={fmtNum(row?.sunHorizonDeg, 3)} unit="°" kind={kind} hint="LOLA, curvature-aware" />
        <Stat label="Clearance" info={EXPLAIN.clearance} value={fmtNum(clearance, 3)} unit="°" kind={kind} hint="centre elevation − horizon" />
        <div className="rounded-md border border-line bg-panel-2 px-3 py-2.5">
          <div className="text-xs text-muted">State at selected time</div>
          <div className="mt-1.5">{row ? <StatePill state={row.sunState} /> : "—"}</div>
          <div className="mt-1 text-xs text-muted">visible disk {fmtNum(row?.sunVisibleFraction != null ? row.sunVisibleFraction * 100 : null, 0)}% · rule “{r.sun.visibilityRule.replace("_", " ")}”</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Direct sunlight over interval" info={EXPLAIN.sunlightDuration} value={fmtHours(r.sun.totalVisibleSeconds)} unit="h" kind={kind} accent="sun" hint={`${(r.sun.fractionVisible * 100).toFixed(1)}% of ${fmtHours((Date.parse(r.timeRange.endUtc) - Date.parse(r.timeRange.startUtc)) / 1000)} h`} />
        <Stat label="Sunlit intervals" value={r.sun.intervalCount} kind={kind} hint={r.sun.unknownSeconds ? `${fmtHours(r.sun.unknownSeconds)} h unknown` : "no unknown periods"} />
        <Stat label="Sun elevation while lit" value={r.sun.elevationDuringVisibleDeg.mean == null ? "—" : `${fmtNum(r.sun.elevationDuringVisibleDeg.min, 1)} – ${fmtNum(r.sun.elevationDuringVisibleDeg.max, 1)}`} unit="°" kind={kind} hint={`mean ${fmtNum(r.sun.elevationDuringVisibleDeg.mean, 2)}°`} />
        <Stat label="Next transition" value={r.sun.nextTransitionUtc ? fmtUtc(r.sun.nextTransitionUtc).slice(5, 16) : "none"} kind={kind} hint={r.sun.nextTransitionUtc ? "after analysis start (sample resolution)" : "state constant over interval"} />
      </div>
      <Card>
        <CardHeader title="Sunlight timeline" tag={<DataTag kind={kind} />} subtitle="Ochre: Sun centre elevation. Grey area: terrain horizon in the Sun’s direction. Shaded bands: sunlit intervals. Click to select a time." />
        <div className="px-2 py-2"><ElevationTimeline rows={rows} body="sun" intervals={r.sun.visibleIntervals} selectedIndex={t.index} onSelect={t.setIndex} /></div>
      </Card>
      <HorizonCard horizon={r.horizon} rows={rows} selectedIndex={t.index} kind={kind} maskDeg={r.earth.antennaMinimumElevationDeg} subtitle={`360° terrain horizon from ${String(r.provenance.terrainProduct.fileName)} with the Sun and Earth tracks; ${r.horizon.truncatedRayCount} of ${r.horizon.azimuthsDeg.length} rays reach the DEM coverage edge.`} />
      <IntervalTable intervals={r.sun.visibleIntervals} title="Direct-sunlight intervals" emptyText="The Sun is not visible from this site at any time in the analysed interval (for example, a permanently shadowed crater floor)." caption="Sunlit intervals with UTC start, end and duration" />
      <SolarSurfacePanel r={r} row={row} kind={kind} />
      <PowerPanel r={r} />
      {r.power.energyWh != null && (
        <Card>
          <CardHeader title="Idealized panel power" tag={<DataTag kind="modelled" />} />
          <div className="px-2 py-2"><PowerChart rows={rows} /></div>
        </Card>
      )}
      <AdvancedOnly className="grid gap-4 xl:grid-cols-2">
        <QualityPanel r={r} />
        <ProvenancePanel r={r} precomputed={precomputed} />
      </AdvancedOnly>
      <SimpleOnly><p className="text-xs text-muted">Switch to <strong>Advanced</strong> mode (top bar) to see data quality, reference frames, kernel and terrain provenance.</p></SimpleOnly>
    </div>
  );
}

export function EarthView({ r, precomputed }: { r: AnalysisResult; precomputed?: boolean }) {
  const t = useTimeline(r.timeseries.length);
  const row = r.timeseries[t.index];
  const kind = precomputed ? "precomputed" : "calculated";
  const rows = r.timeseries;
  const clearance = row?.earthElDeg != null && row?.earthHorizonDeg != null ? row.earthElDeg - row.earthHorizonDeg : null;
  return (
    <div className="space-y-4">
      <LiveSummary r={r} i={t.index} />
      <Notice tone="warn" title="Geometric Direct-to-Earth visibility — not RF link availability">
        These results say whether Earth is in line of sight above the local terrain{r.earth.antennaMinimumElevationDeg != null ? ` and above the ${r.earth.antennaMinimumElevationDeg}° antenna elevation mask` : ""}. They do not model transmitter power, frequency, antenna patterns, pointing, ground-station scheduling or link margin, so they are not a guarantee of communication.
      </Notice>
      <TimeControl rows={rows} t={t} />
      <SimpleOnly><PlainSummary r={r} body="earth" index={t.index} /></SimpleOnly>
      <BlockExplanation r={r} body="earth" index={t.index} />
      <OperationsPanel r={r} body="earth" index={t.index} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Earth azimuth" info={EXPLAIN.earthAzimuth} value={fmtNum(row?.earthAzDeg, 2)} unit="°" kind={kind} accent="earth" hint="clockwise from local north" />
        <Stat label="Earth elevation" info={EXPLAIN.earthElevation} value={fmtNum(row?.earthElDeg, 3)} unit="°" kind={kind} accent="earth" hint="libration moves Earth by several degrees" />
        <Stat label="Terrain horizon at Earth azimuth" info={EXPLAIN.horizon} value={fmtNum(row?.earthHorizonDeg, 3)} unit="°" kind={kind} />
        <Stat label="Clearance" info={EXPLAIN.clearance} value={fmtNum(clearance, 3)} unit="°" kind={kind} />
        <div className="rounded-md border border-line bg-panel-2 px-3 py-2.5">
          <div className="text-xs text-muted">Geometric DTE at selected time</div>
          <div className="mt-1.5">{row ? <StatePill state={row.earthState} /> : "—"}</div>
          <div className="mt-1 text-xs text-muted">Earth apparent diameter ≈ 1.9°; rule “{r.earth.visibilityRule.replace("_", " ")}”</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Earth in line of sight" value={fmtHours(r.earth.totalVisibleSeconds)} unit="h" kind={kind} accent="earth" hint={`${(r.earth.fractionVisible * 100).toFixed(1)}% of interval`} />
        <Stat label="Geometric DTE windows" info={EXPLAIN.dteWindow} value={fmtHours(r.earth.dte.totalVisibleSeconds)} unit="h" kind={kind} accent="earth" hint={`${(r.earth.dte.fractionVisible * 100).toFixed(1)}% · mask ${r.earth.antennaMinimumElevationDeg ?? "none"}${r.earth.antennaMinimumElevationDeg != null ? "°" : ""}`} />
        <Stat label="DTE window count" value={r.earth.dte.intervalCount} kind={kind} hint={r.earth.unknownSeconds ? `${fmtHours(r.earth.unknownSeconds)} h unknown` : "no unknown periods"} />
        <Stat label="Next DTE transition" value={r.earth.nextTransitionUtc ? fmtUtc(r.earth.nextTransitionUtc).slice(5, 16) : "none"} kind={kind} hint="Earth rise/set estimate at sample resolution" />
      </div>
      <Card>
        <CardHeader title="Earth visibility timeline" tag={<DataTag kind={kind} />} subtitle="Violet: Earth centre elevation. Grey area: terrain horizon in Earth’s direction. Dashed: antenna mask. Shaded bands: geometric DTE windows." />
        <div className="px-2 py-2"><ElevationTimeline rows={rows} body="earth" intervals={r.earth.dteWindows} selectedIndex={t.index} onSelect={t.setIndex} maskDeg={r.earth.antennaMinimumElevationDeg} /></div>
      </Card>
      <HorizonCard horizon={r.horizon} rows={rows} selectedIndex={t.index} kind={kind} maskDeg={r.earth.antennaMinimumElevationDeg} subtitle="Earth stays within a small region of the sky because of libration; terrain in that direction decides DTE." />
      <AdvancedOnly><LinkBudgetPanel r={r} /></AdvancedOnly>
      <IntervalTable intervals={r.earth.dteWindows} title="Geometric DTE windows" emptyText="Earth is never in line of sight above the terrain (and antenna mask) in the analysed interval." caption="Geometric direct-to-Earth windows" />
      <AdvancedOnly className="grid gap-4 xl:grid-cols-2">
        <QualityPanel r={r} />
        <ProvenancePanel r={r} precomputed={precomputed} />
      </AdvancedOnly>
      <SimpleOnly><p className="text-xs text-muted">Switch to <strong>Advanced</strong> mode (top bar) to see data quality, reference frames, kernel and terrain provenance.</p></SimpleOnly>
    </div>
  );
}

function HorizonCard({ horizon, rows, selectedIndex, kind, subtitle, maskDeg }: { horizon: HorizonData; rows: TimeRow[]; selectedIndex: number; kind: "precomputed" | "calculated"; subtitle: string; maskDeg: number | null }) {
  const [view, setView] = useState<"panorama" | "sky">("panorama");
  return (
    <Card>
      <CardHeader
        title={view === "panorama" ? "Horizon panorama" : "Polar sky plot"}
        tag={<DataTag kind={kind} />}
        subtitle={subtitle}
        actions={
          <div role="tablist" aria-label="Horizon view" className="flex rounded-[5px] border border-line p-0.5 text-[12px]">
            {(
              [
                ["panorama", "Panorama"],
                ["sky", "Polar sky plot"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-[3px] px-2.5 py-1 ${view === k ? "bg-accent text-accent-ink" : "text-text-2 hover:bg-panel-3/60"}`}>
                {l}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-2 py-2">{view === "panorama" ? <HorizonPanorama horizon={horizon} rows={rows} selectedIndex={selectedIndex} /> : <div className="p-3"><PolarSkyPlot horizon={horizon} rows={rows} selectedIndex={selectedIndex} maskDeg={maskDeg} /></div>}</div>
    </Card>
  );
}
