"use client";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult } from "@/lib/analysis-types";
import { RegionalScene, sunDirectionScene, type RegionalGrid, type RegionalSite } from "../viz/RegionalScene";
import { TimeControl, useTimeline } from "../viz/TimeControl";
import { Card, CardHeader, cx, DataTag, fmtNum } from "../ui";

/** Polar-cap 3D with the Sun direction from a real SPICE analysis (Mons Malapert demo) driven by the time control. */
export function RegionView({ regional, sites, selectedKey, onSelect }: { regional: RegionalGrid | null; sites: RegionalSite[]; selectedKey: string | null; onSelect: (k: string) => void }) {
  const [ref, setRef] = useState<AnalysisResult | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/data/demo/mons-malapert.json").then((r) => r.json()).then((d) => live && setRef(d));
    return () => {
      live = false;
    };
  }, []);
  const rows = useMemo(() => ref?.timeseries ?? [], [ref]);
  const t = useTimeline(rows.length);
  const row = rows[t.index];
  const sun = ref && row?.sunAzDeg != null && row?.sunElDeg != null ? sunDirectionScene(ref.site.latitudeDeg, ref.site.longitudeEastDeg, row.sunAzDeg, row.sunElDeg) : null;
  return (
    <div className="space-y-4">
      {rows.length > 0 && <TimeControl rows={rows} t={t} />}
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <RegionalScene data={regional} sites={sites} selectedKey={selectedKey} sun={sun} onSelect={onSelect} height={540} />
        <Card>
          <CardHeader title="Sites on the cap" tag={<DataTag kind="measured" />} subtitle="Select to highlight; click a cone in the view to select it." />
          <ul className="max-h-[420px] overflow-auto py-1">
            {sites.map((s) => (
              <li key={s.key}>
                <button type="button" aria-pressed={s.key === selectedKey} onClick={() => onSelect(s.key)} className={cx("flex w-full items-center justify-between px-5 py-1.5 text-left text-sm", s.key === selectedKey ? "bg-accent-soft text-text" : "text-text-2 hover:bg-panel-3/60")}>
                  <span>{s.name}</span>
                  <span className="num text-[11px] text-muted">{fmtNum(s.heightM, 0)} m</span>
                </button>
              </li>
            ))}
          </ul>
          {row && <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">Sun direction at {row.utc.replace("T", " ").replace("Z", " UTC")}: azimuth {fmtNum(row.sunAzDeg, 1)}°, elevation {fmtNum(row.sunElDeg, 2)}° as seen from Mons Malapert (SPICE). At lunar distances the direction is the same across the cap; local elevation differs with position.</p>}
        </Card>
      </div>
    </div>
  );
}
