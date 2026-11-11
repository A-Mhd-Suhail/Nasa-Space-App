"use client";
import type { AnalysisResult } from "@/lib/analysis-types";
import { HorizonPanorama } from "../viz/charts";
import { TerrainScene, type TerrainPatch } from "../viz/TerrainScene";
import { TimeControl, useTimeline } from "../viz/TimeControl";
import { Card, CardHeader, DataTag, fmtNum, StatePill } from "../ui";

/** 3D terrain + time control, driven by the analysis time series (never by independent animation). */
export function SiteScene({ r, patch, precomputed }: { r: AnalysisResult; patch: TerrainPatch | null; precomputed?: boolean }) {
  const t = useTimeline(r.timeseries.length);
  const row = r.timeseries[t.index];
  return (
    <div className="space-y-4">
      <TimeControl rows={r.timeseries} t={t} />
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <TerrainScene
          patch={patch}
          horizon={r.horizon}
          sun={row && row.sunAzDeg != null && row.sunElDeg != null ? { az: row.sunAzDeg, el: row.sunElDeg, state: row.sunState } : null}
          earth={row && row.earthAzDeg != null && row.earthElDeg != null ? { az: row.earthAzDeg, el: row.earthElDeg, state: row.earthState } : null}
          height={480}
        />
        <Card>
          <CardHeader title="At selected time" tag={<DataTag kind={precomputed ? "precomputed" : "calculated"} />} />
          <dl className="num space-y-2 px-4 py-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Sun az / el</dt><dd className="text-sun">{fmtNum(row?.sunAzDeg, 2)}° / {fmtNum(row?.sunElDeg, 3)}°</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Horizon @ Sun</dt><dd>{fmtNum(row?.sunHorizonDeg, 3)}°</dd></div>
            <div>{row && <StatePill state={row.sunState} />}</div>
            <div className="flex justify-between pt-2"><dt className="text-muted">Earth az / el</dt><dd className="text-earth">{fmtNum(row?.earthAzDeg, 2)}° / {fmtNum(row?.earthElDeg, 3)}°</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Horizon @ Earth</dt><dd>{fmtNum(row?.earthHorizonDeg, 3)}°</dd></div>
            <div>{row && <StatePill state={row.earthState} />}</div>
            <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Site height</dt><dd>{r.site.heightM.toFixed(1)} m</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Observer</dt><dd>+{r.site.observerHeightM} m</dd></div>
          </dl>
        </Card>
      </div>
      <Card>
        <CardHeader title="360° horizon profile" tag={<DataTag kind={precomputed ? "precomputed" : "calculated"} />} subtitle="The profile used for every visibility decision (up to 300 km, lunar curvature included)." />
        <div className="px-2 py-2"><HorizonPanorama horizon={r.horizon} rows={r.timeseries} selectedIndex={t.index} height={260} /></div>
      </Card>
    </div>
  );
}
