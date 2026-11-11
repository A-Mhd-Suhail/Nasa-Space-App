"use client";
import type { AnalysisResult, HorizonData } from "@/lib/analysis-types";
import { Card, CardHeader, DataTag, Notice } from "../ui";

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compass = (az: number) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

/** Terrain horizon in a given azimuth: elevation, distance to the blocking terrain, ray status. */
export function horizonAt(h: HorizonData, azDeg: number): { elevDeg: number | null; distM: number | null; truncated: boolean } {
  const n = h.azimuthsDeg.length;
  if (!n) return { elevDeg: null, distM: null, truncated: false };
  const step = 360 / n;
  const i = Math.round((((azDeg % 360) + 360) % 360) / step) % n;
  return { elevDeg: h.elevationDeg[i], distM: h.blockingDistanceM[i], truncated: h.status[i] === "truncated" };
}

const hrs = (s: number) => (s / 3600).toFixed(1);

/** Simple-mode summary: what the numbers mean for a mission, in one paragraph. */
export function PlainSummary({ r, body, index }: { r: AnalysisResult; body: "sun" | "earth"; index: number }) {
  const row = r.timeseries[index];
  const total = (Date.parse(r.timeRange.endUtc) - Date.parse(r.timeRange.startUtc)) / 1000;
  const days = total / 86400;
  const span = days >= 1.5 ? `${days.toFixed(1)} days` : `${hrs(total)} hours`;
  let text: string;
  if (body === "sun") {
    const pct = Math.round(r.sun.fractionVisible * 100);
    const now = row?.sunState === "visible" ? "is shining on the site" : row?.sunState === "partial" ? "is partly hidden behind the skyline" : row?.sunState === "terrain_blocked" ? "is hidden behind nearby terrain" : row?.sunState === "below_horizon" ? "is below the horizon" : "cannot be determined (terrain data gap)";
    text = `Over the ${span} analysed, the Sun is visible from this site about ${pct}% of the time (${hrs(r.sun.totalVisibleSeconds)} h) in ${r.sun.intervalCount} separate period${r.sun.intervalCount === 1 ? "" : "s"}. At the selected moment the Sun ${now}${row?.sunElDeg != null ? (row.sunElDeg >= 0 ? `, ${row.sunElDeg.toFixed(1)}° above the flat horizon` : `, ${Math.abs(row.sunElDeg).toFixed(1)}° below the flat horizon${row.sunState === "visible" || row.sunState === "partial" ? " — the site is high enough to see past the curve of the Moon" : ""}`) : ""}. More sunlight means more solar power for the lander — like a solar panel on a house.`;
    if (r.sun.totalVisibleSeconds === 0) text = `The Sun never clears the terrain from this site during the ${span} analysed. A spot like this could be a permanently shadowed region: very cold, possibly holding water ice, but with no solar power.`;
  } else {
    const pct = Math.round(r.earth.dte.fractionVisible * 100);
    const now = row?.dteGeometric ? "is in direct line of sight" : row?.earthState === "terrain_blocked" ? "is hidden behind nearby terrain" : row?.earthState === "below_horizon" ? "is below the horizon" : row?.earthState === "below_antenna_mask" ? "is too low for the antenna mask" : row?.earthState === "unknown" ? "cannot be determined (terrain data gap)" : "is not in line of sight";
    text = `Over the ${span} analysed, Earth is in direct line of sight about ${pct}% of the time (${hrs(r.earth.dte.totalVisibleSeconds)} h). At the selected moment Earth ${now}. A lander can only talk straight to Earth when nothing blocks the line between them — like a video call from behind a tall building. This is a geometry check, not a full radio-link guarantee.`;
  }
  return (
    <Card>
      <CardHeader title="In plain language" tag={<DataTag kind="calculated" />} />
      <p className="px-4 py-3 text-[15px] leading-relaxed text-text-2" data-testid={`plain-${body}`}>{text}</p>
    </Card>
  );
}

/** Explains *why* a body is blocked at the selected time: direction, skyline angle, distance. */
export function BlockExplanation({ r, body, index }: { r: AnalysisResult; body: "sun" | "earth"; index: number }) {
  const row = r.timeseries[index];
  if (!row) return null;
  const state = body === "sun" ? row.sunState : row.earthState;
  const az = body === "sun" ? row.sunAzDeg : row.earthAzDeg;
  const el = body === "sun" ? row.sunElDeg : row.earthElDeg;
  const name = body === "sun" ? "The Sun" : "Earth";
  if (az == null || el == null) return null;
  const hz = horizonAt(r.horizon, az);
  if (state === "terrain_blocked" || state === "partial") {
    const dist = hz.distM != null ? ` The blocking terrain is about ${(hz.distM / 1000).toFixed(1)} km away.` : "";
    return (
      <Notice tone="warn" title={`Why ${name.toLowerCase().replace("the ", "the ")} is ${state === "partial" ? "partly " : ""}blocked`}>
        <span data-testid={`block-${body}`}>
          {name} is {el.toFixed(2)}° above the flat horizon toward the {compass(az)} (azimuth {az.toFixed(1)}°), but the terrain skyline in that direction rises to {hz.elevDeg != null ? `${hz.elevDeg.toFixed(2)}°` : "an unknown angle"}.{dist} A ridge or crater wall stands between the site and {body === "sun" ? "the Sun" : "Earth"}.
        </span>
      </Notice>
    );
  }
  if (state === "below_horizon")
    return <Notice title={`${name} is below the horizon`}><span data-testid={`block-${body}`}>{name} is {Math.abs(el).toFixed(2)}° below the flat horizon (azimuth {az.toFixed(1)}°, {compass(az)}), so no terrain check is needed.</span></Notice>;
  if (state === "unknown")
    return <Notice tone="warn" title="Visibility unknown"><span data-testid={`block-${body}`}>The terrain ray toward azimuth {az.toFixed(1)}° leaves the LOLA DEM coverage before it is certain whether terrain blocks {body === "sun" ? "the Sun" : "Earth"}. MoonNav reports unknown rather than guessing.</span></Notice>;
  return null;
}
