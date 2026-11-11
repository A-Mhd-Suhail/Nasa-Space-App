import type { AnalysisResult, Interval } from "@/lib/analysis-types";
import { Card, CardHeader, DataTag, fmtHours, fmtNum, fmtUtc, Notice } from "../ui";

export function IntervalTable({ intervals, title, emptyText, caption }: { intervals: Interval[]; title: string; emptyText: string; caption: string }) {
  return (
    <Card>
      <CardHeader title={title} tag={<DataTag kind="calculated" />} subtitle="Boundaries refined by bisection; unrefined edges are clipped by the analysis interval." />
      {intervals.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-panel text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Type</th>
                <th scope="col" className="px-4 py-2 font-medium">Start (UTC)</th>
                <th scope="col" className="px-4 py-2 font-medium">End (UTC)</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Duration (h)</th>
              </tr>
            </thead>
            <tbody className="num">
              {intervals.map((iv, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-1.5">{iv.kind === "unknown" ? <span className="text-unknown">Unknown</span> : "Visible"}</td>
                  <td className="px-4 py-1.5">{fmtUtc(iv.startUtc)}{!iv.startRefined && <span className="ml-1 text-xs text-muted">(interval start)</span>}</td>
                  <td className="px-4 py-1.5">{fmtUtc(iv.endUtc)}{!iv.endRefined && <span className="ml-1 text-xs text-muted">(interval end)</span>}</td>
                  <td className="px-4 py-1.5 text-right">{fmtHours(iv.durationS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ProvenancePanel({ r, precomputed }: { r: AnalysisResult; precomputed?: boolean }) {
  const p = r.provenance;
  const t = p.terrainProduct as Record<string, string | number>;
  const rows: [string, string][] = [
    ["Ephemeris", `${p.ephemerisSource} · correction ${p.aberrationCorrection}`],
    ["Body-fixed frame", p.bodyFixedFrame],
    ["Kernel manifest", `${p.kernelManifestId} (coverage ${p.kernelCoverageUtc[0].slice(0, 10)} → ${p.kernelCoverageUtc[1].slice(0, 10)})`],
    ["Terrain product", `${t.fileName} · ${t.dataSetId} ${t.productVersion} · ${t.pixelSpacingM} m`],
    ["Terrain frame / datum", `${t.frame} · sphere ${Number(t.referenceRadiusM) / 1000} km`],
    ["Terrain SHA-256", String(t.sha256 ?? "").slice(0, 24) + "…"],
    ["Horizon method", `${r.horizon.params.azimuthStepDeg}° azimuth bins · ${Number(r.horizon.params.maxRadiusM) / 1000} km radius · ${r.horizon.params.interpolation} · curvature included`],
    ["Sampling", `${r.timeRange.sampleStepSeconds} s step · ${r.timeRange.sampleCount} samples · boundary tolerance ${r.timeRange.refineToleranceSeconds} s`],
    ["Method / software", `${p.methodVersion} / ${p.softwareVersion}`],
  ];
  return (
    <Card>
      <CardHeader title="Provenance & reproducibility" tag={precomputed ? <DataTag kind="precomputed" /> : <DataTag kind="cached" />} subtitle={precomputed && r.demo ? `Generated ${fmtUtc(r.demo.generatedAtUtc)}` : "Immutable result stored with checksums"} />
      <dl className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="num break-words text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function QualityPanel({ r }: { r: AnalysisResult }) {
  return (
    <Card>
      <CardHeader title={<>Data quality: <span className="capitalize text-accent">{r.quality}</span></>} subtitle={r.qualityRule} />
      <ul className="space-y-1 px-4 py-3 text-sm text-text-2">
        {r.qualityReasons.map((q) => <li key={q}>• {q}</li>)}
        {r.warnings.map((w) => <li key={w} className="text-warn">• {w}</li>)}
      </ul>
    </Card>
  );
}

export function PowerPanel({ r }: { r: AnalysisResult }) {
  const p = r.power;
  if (p.energyWh == null) {
    return (
      <Card>
        <CardHeader title="Solar-panel energy" tag={<DataTag kind="unavailable" />} />
        <div className="px-4 py-3">
          <Notice tone="info" title="Not calculated — panel assumptions missing">
            {p.message ?? "Provide panel area, efficiency, derating and orientation in the Scenario Builder."} Hours of sunlight are shown above; they are not electrical output.
          </Notice>
        </div>
      </Card>
    );
  }
  const a = p.assumptions as Record<string, unknown>;
  return (
    <Card>
      <CardHeader title="Solar-panel energy (idealized)" tag={<DataTag kind="modelled" />} subtitle={p.integration} />
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <div><div className="text-xs text-muted">Energy over interval</div><div className="num text-xl font-semibold text-sun">{fmtNum(p.energyWh, 1)} <span className="text-sm text-muted">Wh</span></div></div>
        <div><div className="text-xs text-muted">Peak power</div><div className="num text-xl font-semibold">{fmtNum(p.peakW ?? null, 1)} <span className="text-sm text-muted">W</span></div></div>
        <div><div className="text-xs text-muted">Mean power</div><div className="num text-xl font-semibold">{fmtNum(p.meanW ?? null, 1)} <span className="text-sm text-muted">W</span></div></div>
      </div>
      <p className="px-4 pb-3 text-xs leading-relaxed text-muted">
        Area {String(a.areaM2)} m² · efficiency {String(a.efficiency)} · derating {String(a.derating)} · {String(a.orientation).replace(/_/g, " ")}
        {a.orientation === "fixed" ? ` (normal az ${String(a.normalAzimuthDeg)}°, el ${String(a.normalElevationDeg)}°)` : ""} · {String(a.irradianceModel)}. Not modelled: {(a.notModelled as string[]).join(", ")}.
      </p>
    </Card>
  );
}
