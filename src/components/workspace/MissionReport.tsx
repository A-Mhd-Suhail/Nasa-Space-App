"use client";
import { Download, Printer } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult } from "@/lib/analysis-types";
import { EXPLAIN } from "@/lib/explain";
import { IntervalTable } from "../analysis/panels";
import { compass } from "../analysis/PlainLanguage";
import { Button, Card, CardHeader, DataTag, type DataKind, fmtHours, fmtNum, fmtUtc, InfoTip, Notice, StatePill } from "../ui";
import { type HorizonsCheck, ValidationSummary } from "./HorizonsValidation";
import { ExportBar } from "./ResultLoader";

const ElevationTimeline = dynamic(() => import("../viz/charts").then((m) => m.ElevationTimeline), { ssr: false });
const PolarSkyPlot = dynamic(() => import("../viz/PolarSkyPlot").then((m) => m.PolarSkyPlot), { ssr: false });
const HorizonPanorama = dynamic(() => import("../viz/charts").then((m) => m.HorizonPanorama), { ssr: false });

type Props = {
  analysisId: string;
  result: AnalysisResult;
  scenario: { name: string; version: number; project: string; siteName: string | null; siteNote: string | null };
  validation: HorizonsCheck | null;
  resultSha256: string | null;
  completedAt: string | null;
  generatedAtUtc: string;
  appVersion: string;
};

function Row({ k, v, kind, info }: { k: string; v: React.ReactNode; kind?: DataKind; info?: string }) {
  return (
    <div className="relative grid grid-cols-[minmax(9rem,14rem)_1fr_auto] items-baseline gap-3 border-t border-line px-4 py-2 text-sm first:border-0">
      <dt className="flex items-center gap-1 text-muted">{k}{info && <InfoTip text={info} />}</dt>
      <dd className="num text-text">{v}</dd>
      <span>{kind ? <DataTag kind={kind} /> : null}</span>
    </div>
  );
}

/** Complete mission report for one stored analysis. Every value is read from the stored result. */
export function MissionReport({ analysisId, result: r, scenario, validation, resultSha256, completedAt, generatedAtUtc, appVersion }: Props) {
  const [slope, setSlope] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    fetch(`/api/v1/terrain/point?lat=${r.site.latitudeDeg}&lon=${r.site.longitudeEastDeg}`)
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => setSlope(d?.slopeDeg ?? null))
      .catch(() => setSlope(null));
  }, [r.site.latitudeDeg, r.site.longitudeEastDeg]);
  const t0 = r.timeseries[0];
  const durS = (Date.parse(r.timeRange.endUtc) - Date.parse(r.timeRange.startUtc)) / 1000;
  const unknownFrac = durS > 0 ? (r.sun.unknownSeconds + r.earth.unknownSeconds) / (2 * durS) : 0;
  // Single-scenario suitability with the default equal weights (0-100). The comparison screen lets users change weights.
  const score = useMemo(() => ({ sun: 50 * r.sun.fractionVisible, dte: 50 * r.earth.dte.fractionVisible }), [r]);
  const lat = r.site.latitudeDeg;
  const constraints: { name: string; value: string; result: "pass" | "fail" | "unknown"; note: string }[] = [
    { name: "Inside LOLA terrain coverage", value: `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"}`, result: lat <= -75 ? "pass" : "fail", note: "LDEM_75S_240M covers 75°S–90°S" },
    { name: "Unknown (coverage-limited) time ≤ 5%", value: `${(unknownFrac * 100).toFixed(1)}%`, result: unknownFrac <= 0.05 ? "pass" : "fail", note: "unknown periods are never counted as visible" },
    { name: "Local slope ≤ 15° (480 m baseline)", value: slope == null ? (slope === undefined ? "loading…" : "unavailable") : `${slope.toFixed(1)}°`, result: slope == null ? "unknown" : slope <= 15 ? "pass" : "fail", note: "screening only; not a landing-hazard assessment" },
    { name: "Any direct sunlight in interval", value: `${fmtHours(r.sun.totalVisibleSeconds)} h`, result: r.sun.totalVisibleSeconds > 0 ? "pass" : r.sun.unknownSeconds > 0 ? "unknown" : "fail", note: "solar power needs direct sunlight" },
    { name: "Any geometric DTE in interval", value: `${fmtHours(r.earth.dte.totalVisibleSeconds)} h`, result: r.earth.dte.totalVisibleSeconds > 0 ? "pass" : r.earth.unknownSeconds > 0 ? "unknown" : "fail", note: "line of sight only, not an RF link budget" },
  ];
  const tradeoff =
    r.sun.fractionVisible > r.earth.dte.fractionVisible + 0.1
      ? "This site favours power: it receives considerably more direct sunlight than direct-to-Earth time. Communication may need relays or careful scheduling of DTE windows."
      : r.earth.dte.fractionVisible > r.sun.fractionVisible + 0.1
        ? "This site favours communication: Earth is in line of sight more often than the Sun is visible. Energy storage must bridge the dark periods."
        : "Sunlight and direct-to-Earth availability are similar at this site over the analysed interval.";

  return (
    <article className="mx-auto max-w-5xl space-y-4" data-testid="mission-report">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.08em] text-muted">MoonNav mission report · {scenario.project}</p>
        <h1 className="font-display text-3xl">{scenario.siteName ?? "Custom site"} — {scenario.name} <span className="text-muted">v{scenario.version}</span></h1>
        <p className="num text-xs text-muted">Analysis {analysisId} · completed {fmtUtc(completedAt)} · report generated {fmtUtc(generatedAtUtc)} · MoonNav {appVersion} · method {r.provenance.methodVersion}</p>
        <div className="no-print flex flex-wrap items-center gap-2 pt-1">
          <Button s="sm" variant="primary" onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</Button>
          <Button s="sm" onClick={() => { const blob = new Blob([JSON.stringify({ schema: "moonnav.mission-report.v1", generatedAtUtc, appVersion, analysisId, scenario, validation, resultSha256, result: r }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `moonnav-report-${analysisId}.json`; a.click(); URL.revokeObjectURL(a.href); }}><Download size={14} /> Report JSON</Button>
          <ExportBar analysisId={analysisId} />
        </div>
      </header>
      <Notice tone="warn">Independent research/education prototype — not NASA-owned, endorsed or flight-certified. Geometric direct-to-Earth visibility is line of sight only, not RF link availability. The suitability score is a simplified MoonNav example, not an official NASA mission feasibility rating.</Notice>

      <Card>
        <CardHeader title="1. Site and mission time" />
        <dl>
          <Row k="Site" v={`${scenario.siteName ?? "Custom coordinates"}${scenario.siteNote ? ` — ${scenario.siteNote}` : ""}`} />
          <Row k="Latitude / longitude" v={`${r.site.latitudeDeg.toFixed(5)}° (planetocentric), ${r.site.longitudeEastDeg.toFixed(5)}° E`} kind="measured" />
          <Row k="Terrain elevation" v={`${r.site.heightM.toFixed(1)} m (${r.site.datum}); observer +${r.site.observerHeightM} m`} kind="measured" info={EXPLAIN.terrainElevation} />
          <Row k="Local slope" v={slope == null ? (slope === undefined ? "loading…" : "unavailable") : `${slope.toFixed(2)}° (480 m baseline)`} kind={slope == null ? "unavailable" : "calculated"} info={EXPLAIN.slope} />
          <Row k="Mission time (UTC)" v={fmtUtc(r.timeRange.startUtc)} />
          <Row k="Analysis interval (UTC)" v={`${fmtUtc(r.timeRange.startUtc)} → ${fmtUtc(r.timeRange.endUtc)} (${(durS / 86400).toFixed(2)} days; a lunar solar day is ≈29.53 days)`} />
          <Row k="Sampling" v={`${r.timeRange.sampleStepSeconds} s · ${r.timeRange.sampleCount} samples · transitions refined to ${r.timeRange.refineToleranceSeconds} s · ${r.timeRange.timeScale}`} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="2. Sun and Earth at mission time" tag={<DataTag kind="calculated" />} />
        <dl>
          <Row k="Solar elevation" v={`${fmtNum(t0?.sunElDeg, 3)}°`} info={EXPLAIN.solarElevation} kind="calculated" />
          <Row k="Solar azimuth" v={t0?.sunAzDeg == null ? "—" : `${t0.sunAzDeg.toFixed(2)}° (${compass(t0.sunAzDeg)})`} info={EXPLAIN.solarAzimuth} kind="calculated" />
          <Row k="Sun status" v={t0 ? <StatePill state={t0.sunState} /> : "—"} />
          <Row k="Earth elevation" v={`${t0?.earthElDeg != null && t0.earthElDeg > 0 ? "+" : ""}${fmtNum(t0?.earthElDeg, 3)}°`} info={EXPLAIN.earthElevation} kind="calculated" />
          <Row k="Earth azimuth" v={t0?.earthAzDeg == null ? "—" : `${t0.earthAzDeg.toFixed(2)}° (${compass(t0.earthAzDeg)})`} info={EXPLAIN.earthAzimuth} kind="calculated" />
          <Row k="Direct communication (geometric)" v={t0 ? <StatePill state={t0.earthState} /> : "—"} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="3. Durations over the interval" tag={<DataTag kind="calculated" />} />
        <dl>
          <Row k="Direct sunlight" v={`${fmtHours(r.sun.totalVisibleSeconds)} h (${(r.sun.fractionVisible * 100).toFixed(1)}%) in ${r.sun.intervalCount} interval(s)`} info={EXPLAIN.sunlightDuration} kind="calculated" />
          <Row k="Sun elevation while lit" v={r.sun.elevationDuringVisibleDeg.mean == null ? "—" : `min ${fmtNum(r.sun.elevationDuringVisibleDeg.min, 2)}° · mean ${fmtNum(r.sun.elevationDuringVisibleDeg.mean, 2)}° · max ${fmtNum(r.sun.elevationDuringVisibleDeg.max, 2)}°`} />
          <Row k="Earth in line of sight" v={`${fmtHours(r.earth.totalVisibleSeconds)} h (${(r.earth.fractionVisible * 100).toFixed(1)}%)`} kind="calculated" />
          <Row k="Geometric DTE windows" v={`${fmtHours(r.earth.dte.totalVisibleSeconds)} h (${(r.earth.dte.fractionVisible * 100).toFixed(1)}%) in ${r.earth.dte.intervalCount} window(s); antenna mask ${r.earth.antennaMinimumElevationDeg ?? "none"}`} info={EXPLAIN.dteWindow} kind="calculated" />
          <Row k="Unknown (coverage)" v={`Sun ${fmtHours(r.sun.unknownSeconds)} h · Earth ${fmtHours(r.earth.unknownSeconds)} h`} kind={r.sun.unknownSeconds + r.earth.unknownSeconds > 0 ? "unavailable" : undefined} />
          <Row k="Panel energy" v={r.power.energyWh == null ? `not modelled (${r.power.status})` : `${r.power.energyWh.toFixed(1)} Wh idealized`} kind={r.power.energyWh == null ? "unavailable" : "modelled"} />
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="avoid-break">
          <CardHeader title="4. Terrain horizon profile" tag={<DataTag kind="calculated" />} subtitle={`${r.horizon.azimuthsDeg.length} azimuth rays to ${Number(r.horizon.params.maxRadiusM) / 1000} km, curvature included; ${r.horizon.truncatedRayCount} rays leave DEM coverage.`} />
          <div className="p-3"><PolarSkyPlot horizon={r.horizon} rows={r.timeseries} selectedIndex={0} maskDeg={r.earth.antennaMinimumElevationDeg} /></div>
        </Card>
        <Card className="avoid-break">
          <CardHeader title="Horizon panorama" subtitle="Terrain skyline vs azimuth with the Sun and Earth tracks." />
          <div className="px-2 py-2"><HorizonPanorama horizon={r.horizon} rows={r.timeseries} selectedIndex={0} height={340} /></div>
        </Card>
      </div>
      <Card className="avoid-break">
        <CardHeader title="Sun and Earth elevation vs terrain" />
        <div className="px-2 py-2"><ElevationTimeline rows={r.timeseries} body="sun" intervals={r.sun.visibleIntervals} height={240} /></div>
        <div className="px-2 py-2"><ElevationTimeline rows={r.timeseries} body="earth" intervals={r.earth.dteWindows} maskDeg={r.earth.antennaMinimumElevationDeg} height={240} /></div>
      </Card>
      <IntervalTable intervals={r.sun.visibleIntervals} title="5. Direct-sunlight intervals" emptyText="The Sun never clears the terrain during this interval." caption="Sunlit intervals" />
      <IntervalTable intervals={r.earth.dteWindows} title="6. Communication (geometric DTE) windows" emptyText="Earth is never in line of sight above the terrain during this interval." caption="Geometric DTE windows" />

      <Card className="print-break">
        <CardHeader title="7. Feasibility assessment" tag={<DataTag kind="modelled" />} subtitle="Hard constraints first; the score is only meaningful for scenarios that pass them." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Hard-constraint assessment</caption>
            <thead className="text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Constraint</th><th className="px-4 py-2 font-medium">Value</th><th className="px-4 py-2 font-medium">Result</th><th className="px-4 py-2 font-medium">Note</th></tr></thead>
            <tbody>{constraints.map((c) => <tr key={c.name} className="border-t border-line"><td className="px-4 py-2">{c.name}</td><td className="num px-4 py-2">{c.value}</td><td className={`px-4 py-2 font-medium uppercase ${c.result === "pass" ? "text-ok" : c.result === "fail" ? "text-bad" : "text-unknown"}`}>{c.result}</td><td className="px-4 py-2 text-xs text-muted">{c.note}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3 text-sm">
          <p><strong className="text-[18px]">{(score.sun + score.dte).toFixed(1)}</strong> / 100 <span className="text-muted">= sunlight {score.sun.toFixed(1)} + direct-to-Earth {score.dte.toFixed(1)} (equal 50/50 weights on the sunlit and DTE fractions)</span></p>
          <p className="mt-1 text-xs text-muted">Simplified MoonNav mission suitability score — not an official NASA mission feasibility rating. A real assessment also needs minimum power, thermal safety, slope and hazard maps at landing scale, and scientific value. Adjust weights and thresholds on the Compare screen.</p>
          <p className="mt-2 text-text-2">{tradeoff}</p>
        </div>
      </Card>

      <Card className="avoid-break">
        <CardHeader title="8. Scientific confidence and validation" />
        <dl>
          <Row k="Sun / Earth directions" v="NAIF SPICE spkcpo, LT+S aberration, MOON_ME frame" kind="calculated" info={EXPLAIN.confidence} />
          <Row k="Terrain blocking" v={`LOLA ${r.provenance.terrainProductId}; ${r.horizon.truncatedRayCount ? `${r.horizon.truncatedRayCount} rays truncated → unknown where undecidable` : "all rays fully covered"}`} kind="calculated" />
          <Row k="Data quality" v={`${r.quality} — ${r.qualityReasons.join("; ")}`} kind={r.quality === "insufficient" ? "unavailable" : "calculated"} />
          <Row k="Live JPL Horizons check" v={<ValidationSummary v={validation} />} />
          <Row k="NASA SVS illumination products" v="Not compared automatically: SVS 4930 is a 2-hour, regional visualization product, not an arbitrary-coordinate reference. See docs/SCIENTIFIC_METHODS.md." kind="unavailable" />
        </dl>
      </Card>

      <Card className="avoid-break">
        <CardHeader title="9. Data provenance" tag={<DataTag kind="cached" />} />
        <dl>
          <Row k="Ephemeris" v={`${r.provenance.ephemerisSource} · ${r.provenance.aberrationCorrection}`} />
          <Row k="Kernel manifest" v={`${r.provenance.kernelManifestId} (coverage ${r.provenance.kernelCoverageUtc[0].slice(0, 10)} → ${r.provenance.kernelCoverageUtc[1].slice(0, 10)})`} />
          {r.provenance.kernelFiles.map((k) => <Row key={k.fileName} k={`  ${k.fileName}`} v={<span className="font-mono text-xs">{k.sha256.slice(0, 32)}…</span>} />)}
          <Row k="Terrain product" v={`${String(r.provenance.terrainProduct.fileName)} · ${String(r.provenance.terrainProduct.dataSetId)} ${String(r.provenance.terrainProduct.productVersion)} · ${String(r.provenance.terrainProduct.pixelSpacingM)} m`} />
          <Row k="Body-fixed frame" v={r.provenance.bodyFixedFrame} />
          <Row k="Algorithm / software" v={`${r.provenance.methodVersion} / ${r.provenance.softwareVersion}`} />
          <Row k="Result SHA-256" v={<span className="font-mono text-xs">{resultSha256 ?? "—"}</span>} />
        </dl>
        {r.warnings.length > 0 && <ul className="border-t border-line px-4 py-3 text-xs text-warn">{r.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
      </Card>
    </article>
  );
}
