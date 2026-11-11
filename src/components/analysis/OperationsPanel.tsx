"use client";
import type { AnalysisResult } from "@/lib/analysis-types";
import { fmtDuration, operationsAt } from "@/lib/operations";
import { Card, CardHeader, DataTag, fmtNum, fmtUtc } from "../ui";

/** Next sunset / sunrise or Earthset / next DTE window at the time selected in the time controller. */
export function OperationsPanel({ r, index, body }: { r: AnalysisResult; index: number; body: "sun" | "earth" }) {
  const row = r.timeseries[index];
  if (!row) return null;
  const isSun = body === "sun";
  const ivs = isSun ? r.sun.visibleIntervals : r.earth.dteWindows;
  const o = operationsAt(ivs, r.timeRange.startUtc, r.timeRange.endUtc, row.utc);
  const el = isSun ? row.sunElDeg : row.earthElDeg;
  const ev = (e: typeof o.nextEnd) => (e.utc ? `${fmtUtc(e.utc)} (in ${fmtDuration(e.inSeconds)})` : e.beyondWindow ? "after the analysed window — extend the interval" : "—");
  const items: [string, string][] = isSun
    ? [
        ["Solar elevation now", `${fmtNum(el, 3)}°`],
        ["Sun status", o.visibleNow == null ? "unknown (terrain coverage)" : o.visibleNow ? "in direct sunlight" : "no direct sunlight"],
        ["Next sunset (terrain-aware)", o.visibleNow ? ev(o.nextEnd) : "—"],
        ["Time remaining until sunset", o.visibleNow && o.nextEnd.utc ? fmtDuration(o.nextEnd.inSeconds) : "—"],
        ["Next sunrise (terrain-aware)", o.visibleNow ? (o.nextStart.utc ? ev(o.nextStart) : "—") : ev(o.nextStart)],
        ["Longest darkness in window", fmtDuration(o.longestGapS)],
      ]
    : [
        ["Earth elevation now", `${el != null && el > 0 ? "+" : ""}${fmtNum(el, 3)}°`],
        ["Direct-to-Earth now", o.visibleNow == null ? "unknown (terrain coverage)" : o.visibleNow ? "available (geometric)" : "blocked"],
        ["Next Earthset / end of DTE window", o.visibleNow ? ev(o.nextEnd) : "—"],
        ["Time remaining until Earthset", o.visibleNow && o.nextEnd.utc ? fmtDuration(o.nextEnd.inSeconds) : "—"],
        ["Next DTE window", o.visibleNow ? (o.nextStart.utc ? ev(o.nextStart) : "—") : ev(o.nextStart)],
        ["Longest blackout in window", fmtDuration(o.longestGapS)],
      ];
  return (
    <Card>
      <CardHeader title={isSun ? "Operations: sunlight" : "Operations: communication"} tag={<DataTag kind="calculated" />} subtitle={`At ${fmtUtc(row.utc)}. Events are the engine's terrain-aware transitions (refined to ${r.timeRange.refineToleranceSeconds} s; airless Moon, no refraction).`} />
      <dl className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr]" data-testid={`ops-${body}`}>
        {items.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>)}
      </dl>
      {o.gaps.length > 0 && (
        <details className="border-t border-line px-4 py-2 text-xs">
          <summary className="cursor-pointer text-text-2">{isSun ? "Darkness" : "Communication blackout"} intervals ({o.gaps.length})</summary>
          <ul className="num mt-1 space-y-0.5 text-muted">{o.gaps.slice(0, 30).map((g) => <li key={g.startUtc}>{fmtUtc(g.startUtc)} → {fmtUtc(g.endUtc)} · {fmtDuration(g.durationS)}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}
