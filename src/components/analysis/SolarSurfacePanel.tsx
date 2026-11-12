"use client";
import { useMemo, useState } from "react";
import type { AnalysisResult, TimeRow } from "@/lib/analysis-types";
import { Button, Card, CardHeader, DataTag, Field, fmtHours, fmtNum, Input, Notice, Stat } from "../ui";

/**
 * Ground surface and irradiance (method 1.1.0): the DEM surface normal at the site, the angle between that normal and
 * the Sun, and the direct-beam irradiance on the real (sloped) ground. Direct beam only: scattered and reflected light,
 * temperature and dust are not modelled. Incidence is evaluated at the Sun-disk centre.
 */
export function SolarSurfacePanel({ r, row, kind }: { r: AnalysisResult; row: TimeRow | undefined; kind: "calculated" | "precomputed" }) {
  const s = r.surface;
  if (!s) {
    return (
      <Card>
        <CardHeader title="Ground surface and irradiance" tag={<DataTag kind="unavailable" />} />
        <div className="px-4 py-3"><Notice tone="info" title="Not in this analysis">This analysis was computed with an earlier method ({r.provenance.methodVersion}) that did not report surface incidence or irradiance. Re-run it from the analysis page to include them.</Notice></div>
      </Card>
    );
  }
  const t = s.terrain;
  const dark = r.sun;
  return (
    <Card data-testid="surface-panel">
      <CardHeader title="Ground surface and irradiance" tag={<DataTag kind={kind} />} subtitle="Direct-beam sunlight on the real ground from the LOLA surface normal. This is physical irradiance, not electrical output." />
      <div className="space-y-3 px-4 py-3">
        {t.status !== "ok" ? (
          <Notice tone="warn" title="Ground slope unavailable">No DEM heights around the site, so surface incidence and ground irradiance are not calculated. Nothing is assumed flat.</Notice>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Ground slope at the site" value={fmtNum(t.slopeDeg, 1)} unit="°" kind={kind} hint={`${t.baselineM} m baseline (2 × DEM pixel)`} />
            <Stat label="Slope faces (azimuth)" value={t.aspectDeg == null ? "flat" : fmtNum(t.aspectDeg, 0)} unit={t.aspectDeg == null ? "" : "°"} kind={kind} hint="downhill direction, clockwise from north" />
            <Stat label="Sun incidence angle on the ground" value={fmtNum(row?.surfaceIncidenceDeg, 1)} unit="°" kind={kind} hint=">90° means the Sun is behind the local slope" />
            <Stat label="Irradiance on the ground now" value={fmtNum(row?.terrainIrradianceWm2, 0)} unit="W/m²" kind={kind} accent="sun" hint={`available at normal incidence: ${fmtNum(row?.sunIrradianceWm2, 0)} W/m²`} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Mean ground irradiance" value={fmtNum(s.meanTerrainIrradianceWm2, 1)} unit="W/m²" kind={kind} hint="time-weighted over the interval" />
          <Stat label="Peak ground irradiance" value={fmtNum(s.peakTerrainIrradianceWm2, 0)} unit="W/m²" kind={kind} />
          <Stat label="Energy per m² of ground" value={s.terrainEnergyWhPerM2 == null ? "—" : fmtNum(s.terrainEnergyWhPerM2 / 1000, 2)} unit="kWh/m²" kind={kind} hint={s.integration} />
          <Stat label="Longest continuous darkness" value={dark.longestDarkS == null ? "—" : fmtHours(dark.longestDarkS)} unit="h" kind={kind} hint={dark.interruptionCount == null ? undefined : `${dark.interruptionCount} interruption${dark.interruptionCount === 1 ? "" : "s"} between sunlit periods`} />
        </div>
        <p className="text-xs leading-relaxed text-muted">{s.irradianceModel}. Not modelled: {s.notModelled.join("; ")}. Darkness = known not-visible time between sunlit intervals; boundaries are the refined event times.</p>
      </div>
    </Card>
  );
}

/** Optional, illustrative RF link margin from USER-SUPPLIED values (never a mission link analysis). */
export function LinkBudgetPanel({ r }: { r: AnalysisResult }) {
  const [v, setV] = useState({ f: "2.2", eirp: "", gt: "", rate: "", ebn0: "", loss: "0" });
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<null | { summary: { minDb: number; meanDb: number; maxDb: number; fractionPositive: number; samples: number }; fsplDb: { min: number; max: number }; label: string; notModelled: string[] }>(null);
  const [err, setErr] = useState<string | null>(null);
  const dist = useMemo(() => r.timeseries.filter((x) => x.dteGeometric && x.earthDistanceKm != null).map((x) => x.earthDistanceKm as number), [r]);
  const ready = [v.f, v.eirp, v.gt, v.rate, v.ebn0].every((x) => x.trim() !== "" && Number.isFinite(Number(x)));
  async function run() {
    setBusy(true); setErr(null); setOut(null);
    try {
      const res = await fetch("/api/v1/link-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frequencyHz: Number(v.f) * 1e9, eirpDbw: Number(v.eirp), receiverGOverTDbK: Number(v.gt), dataRateBps: Number(v.rate), requiredEbN0Db: Number(v.ebn0), otherLossesDb: Number(v.loss || 0), distancesKm: dist.slice(0, 5000) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? `Request failed (${res.status})`);
      setOut(d);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const f = (k: keyof typeof v, label: string, hint?: string) => (
    <Field label={label} htmlFor={`lb-${k}`} hint={hint}><Input id={`lb-${k}`} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>
  );
  return (
    <Card data-testid="link-budget">
      <CardHeader title="Optional link-margin estimate" tag={<DataTag kind="modelled" />} subtitle="Illustrative free-space link margin from values YOU supply. No defaults are assumed; this is not a mission link analysis." />
      <div className="space-y-3 px-4 py-3">
        <Notice tone="warn" title="Line of sight is not a link">Earth being above the horizon is necessary, not sufficient. This estimate ignores antenna pointing and patterns (put them in “other losses”), ground-station availability and DSN scheduling, weather, and terrain multipath.</Notice>
        <div className="grid gap-3 sm:grid-cols-3">
          {f("f", "Frequency (GHz)", "S-band ≈ 2.2, X-band ≈ 8.4")}
          {f("eirp", "EIRP (dBW)", "transmit power + antenna gain − transmit losses")}
          {f("gt", "Receiver G/T (dB/K)", "ground-station figure of merit")}
          {f("rate", "Data rate (bit/s)")}
          {f("ebn0", "Required Eb/N0 (dB)", "from your modulation and coding")}
          {f("loss", "Other losses (dB)", "pointing, polarisation, atmosphere, implementation")}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={!ready || busy || dist.length === 0} onClick={run} data-testid="link-budget-run">{busy ? "Calculating…" : "Estimate link margin"}</Button>
          <span className="text-xs text-muted">{dist.length === 0 ? "No geometric DTE samples in this analysis, so there is nothing to evaluate." : `Evaluated at the Earth–Moon distance of ${dist.length} geometric-DTE samples.`}</span>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
        {out && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="link-budget-result">
            <Stat label="Margin: worst sample" value={fmtNum(out.summary.minDb, 1)} unit="dB" kind="modelled" />
            <Stat label="Margin: mean" value={fmtNum(out.summary.meanDb, 1)} unit="dB" kind="modelled" />
            <Stat label="Samples with margin ≥ 0 dB" value={`${(out.summary.fractionPositive * 100).toFixed(0)}%`} kind="modelled" hint={`${out.summary.samples} geometric-DTE samples`} />
            <Stat label="Free-space path loss" value={`${fmtNum(out.fsplDb.min, 1)}–${fmtNum(out.fsplDb.max, 1)}`} unit="dB" kind="modelled" />
          </div>
        )}
      </div>
    </Card>
  );
}
