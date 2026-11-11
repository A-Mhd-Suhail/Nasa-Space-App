"use client";
import { useMemo } from "react";
import type { HorizonData, Interval, TimeRow } from "@/lib/analysis-types";
import { EChart, type ChartTheme, useChartTheme } from "./EChart";

const axes = (T: ChartTheme) => ({
  axisLine: { lineStyle: { color: T.line } },
  splitLine: { lineStyle: { color: T.line, type: "dashed" as const } },
  axisLabel: { color: T.muted, fontFamily: T.mono, fontSize: 11 },
});
const tip = (T: ChartTheme) => ({ backgroundColor: T.panel, borderColor: T.line, textStyle: { color: T.ink, fontSize: 12 } });

function bands(intervals: Interval[], color: string, unknown: string) {
  return intervals.map((iv) => [
    { xAxis: Date.parse(iv.startUtc), itemStyle: { color: iv.kind === "unknown" ? unknown : color } },
    { xAxis: Date.parse(iv.endUtc) },
  ]);
}

export function ElevationTimeline({
  rows, body, intervals, selectedIndex, onSelect, height = 300, maskDeg,
}: {
  rows: TimeRow[];
  body: "sun" | "earth";
  intervals: Interval[];
  selectedIndex?: number;
  onSelect?: (i: number) => void;
  height?: number;
  maskDeg?: number | null;
}) {
  const T = useChartTheme();
  const option = useMemo(() => {
    const axisCommon = axes(T);
    const isSun = body === "sun";
    const col = isSun ? T.sun : T.earth;
    const el = rows.map((r) => [r.utc, isSun ? r.sunElDeg : r.earthElDeg]);
    const hz = rows.map((r) => [r.utc, isSun ? r.sunHorizonDeg : r.earthHorizonDeg]);
    const sel = selectedIndex != null ? rows[selectedIndex]?.utc : null;
    return {
      grid: { left: 52, right: 16, top: 34, bottom: 56 },
      legend: { top: 0, textStyle: { color: T.text }, data: [`${isSun ? "Sun" : "Earth"} centre elevation`, "Terrain horizon at body azimuth"] },
      tooltip: { trigger: "axis", ...tip(T), valueFormatter: (v: number | null) => (v == null ? "unavailable" : `${v.toFixed(3)}°`) },
      xAxis: { type: "time", ...axisCommon, axisLabel: { color: T.muted, hideOverlap: true } },
      yAxis: { type: "value", name: "deg", nameTextStyle: { color: T.muted }, ...axisCommon },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 8, borderColor: T.line, fillerColor: T.fill, handleStyle: { color: T.panel, borderColor: T.muted }, textStyle: { color: T.muted } }],
      series: [
        {
          name: "Terrain horizon at body azimuth", type: "line", data: hz, showSymbol: false, connectNulls: false,
          lineStyle: { color: T.ink, width: 1, type: "solid" }, itemStyle: { color: T.ink }, areaStyle: { color: T.fill, origin: "start" },
        },
        {
          name: "bands", type: "line", data: [], silent: true, legendHoverLink: false,
          markArea: { silent: true, data: bands(intervals, isSun ? T.sunBand : T.earthBand, T.unknownBand) },
        },
        {
          name: `${isSun ? "Sun" : "Earth"} centre elevation`, type: "line", data: el, showSymbol: false, connectNulls: false, lineStyle: { color: col, width: 2.2 }, itemStyle: { color: col },
          markLine: {
            silent: true, symbol: "none",
            data: [
              ...(sel ? [{ xAxis: Date.parse(sel), lineStyle: { color: T.accent, width: 1.5 }, label: { formatter: "selected", color: T.accent } }] : []),
              ...(maskDeg != null ? [{ yAxis: maskDeg, lineStyle: { color: T.earth, type: "dashed" }, label: { formatter: `antenna mask ${maskDeg}°`, color: T.earth, position: "insideStartTop" } }] : []),
              { yAxis: 0, lineStyle: { color: T.line, type: "dotted" }, label: { show: false } },
            ],
          },
        },
      ],
    };
  }, [rows, body, intervals, selectedIndex, maskDeg, T]);
  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={`${body === "sun" ? "Sun" : "Earth"} elevation and terrain horizon over time. Shaded bands mark ${body === "sun" ? "sunlit" : "visible"} intervals; the interval table below lists exact times.`}
      onClick={onSelect ? (p) => onSelect(p.dataIndex) : undefined}
    />
  );
}

export function HorizonPanorama({ horizon, rows, selectedIndex, height = 300 }: { horizon: HorizonData; rows: TimeRow[]; selectedIndex?: number; height?: number }) {
  const T = useChartTheme();
  const option = useMemo(() => {
    const axisCommon = axes(T);
    const hz = horizon.azimuthsDeg.map((a, i) => [a, horizon.elevationDeg[i]]);
    const bound = horizon.azimuthsDeg.map((a, i) => [a, horizon.unseenTerrainBoundDeg[i]]).filter((p) => p[1] != null);
    const step = Math.max(1, Math.floor(rows.length / 800));
    const sun = rows.filter((_, i) => i % step === 0).map((r) => [r.sunAzDeg, r.sunElDeg]);
    const earth = rows.filter((_, i) => i % step === 0).map((r) => [r.earthAzDeg, r.earthElDeg]);
    const s = selectedIndex != null ? rows[selectedIndex] : null;
    const ys = [...hz.map((p) => p[1]), ...sun.map((p) => p[1]), ...earth.map((p) => p[1])].filter((v): v is number => v != null);
    return {
      grid: { left: 52, right: 16, top: 34, bottom: 40 },
      legend: { top: 0, textStyle: { color: T.text } },
      tooltip: { trigger: "item", ...tip(T), formatter: (p: { seriesName: string; value: [number, number] }) => `${p.seriesName}<br/>az ${p.value[0]?.toFixed(2)}° · el ${p.value[1]?.toFixed(3)}°` },
      xAxis: { type: "value", min: 0, max: 360, interval: 45, name: "azimuth (° from N, clockwise)", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: T.muted }, ...axisCommon,
        axisLabel: { color: T.muted, formatter: (v: number) => ({ 0: "N 0", 90: "E 90", 180: "S 180", 270: "W 270", 360: "N 360" } as Record<number, string>)[v] ?? `${v}` } },
      yAxis: { type: "value", name: "elevation (°)", nameTextStyle: { color: T.muted }, min: Math.floor(Math.min(...ys, -2)), max: Math.ceil(Math.max(...ys, 2)), ...axisCommon },
      series: [
        { name: "Terrain horizon (LOLA)", type: "line", data: hz, showSymbol: false, lineStyle: { color: T.ink, width: 1.3 }, itemStyle: { color: T.ink }, areaStyle: { color: T.fill, origin: "start" }, z: 1 },
        ...(bound.length ? [{ name: "Upper bound beyond DEM coverage", type: "scatter", data: bound, symbolSize: 2, itemStyle: { color: T.bad }, z: 2 }] : []),
        { name: "Sun track", type: "scatter", data: sun, symbolSize: 3, itemStyle: { color: T.sun }, z: 3 },
        { name: "Earth track", type: "scatter", data: earth, symbolSize: 3, itemStyle: { color: T.earth }, z: 3 },
        ...(s
          ? [{ name: "Selected time", type: "scatter", data: [[s.sunAzDeg, s.sunElDeg], [s.earthAzDeg, s.earthElDeg]], symbolSize: 13, itemStyle: { color: "transparent", borderColor: T.accent, borderWidth: 2.2 }, z: 4 }]
          : []),
      ],
    };
  }, [horizon, rows, selectedIndex, T]);
  return <EChart option={option} height={height} ariaLabel="360-degree terrain horizon profile with the Sun and Earth tracks over the analysis interval. Points below the shaded terrain are blocked." />;
}

export function PowerChart({ rows, height = 240 }: { rows: TimeRow[]; height?: number }) {
  const T = useChartTheme();
  const option = useMemo(
    () => ({
      grid: { left: 52, right: 16, top: 20, bottom: 40 },
      tooltip: { trigger: "axis", ...tip(T), valueFormatter: (v: number | null) => (v == null ? "unavailable" : `${v.toFixed(1)} W`) },
      xAxis: { type: "time", ...axes(T) },
      yAxis: { type: "value", name: "W", nameTextStyle: { color: T.muted }, ...axes(T) },
      series: [{ name: "Idealized panel power", type: "line", data: rows.map((r) => [r.utc, r.powerW]), showSymbol: false, lineStyle: { color: T.sun, width: 1.6 }, itemStyle: { color: T.sun }, areaStyle: { color: T.sunBand } }],
    }),
    [rows, T],
  );
  return <EChart option={option} height={height} ariaLabel="Idealized panel power over time based on the stated panel assumptions." />;
}

export function CompareBars({ labels, series, height = 280, yName = "%", max = 100, stacked = false, ariaLabel }: { labels: string[]; series: { name: string; values: number[]; color: string; unit: string }[]; height?: number; yName?: string; max?: number | null; stacked?: boolean; ariaLabel?: string }) {
  const T = useChartTheme();
  const option = useMemo(
    () => ({
      grid: { left: 48, right: 16, top: 34, bottom: 60 },
      legend: { top: 0, textStyle: { color: T.text } },
      tooltip: { trigger: "axis", ...tip(T), valueFormatter: (v: number) => `${Number(v).toFixed(2)} ${series[0]?.unit ?? ""}` },
      xAxis: { type: "category", data: labels, ...axes(T), axisLabel: { color: T.muted, interval: 0, width: 120, overflow: "break" } },
      yAxis: { type: "value", name: yName, ...(max != null ? { max } : {}), ...axes(T) },
      series: series.map((s, i) => ({ name: s.name, type: "bar", data: s.values, ...(stacked ? { stack: "total" } : {}), itemStyle: { color: s.color === "sun" ? T.sun : s.color === "earth" ? T.earth : s.color, decal: i ? { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [3, 3], rotation: -0.8, color: "rgba(0,0,0,0.12)" } : undefined }, barMaxWidth: 36 })),
      aria: { enabled: true, decal: { show: true } },
    }),
    [labels, series, T, yName, max, stacked],
  );
  return <EChart option={option} height={height} ariaLabel={ariaLabel ?? "Comparison of sunlit and geometric DTE fractions; the table lists exact values."} />;
}

/** Sunlight vs geometric DTE hours, one point per scenario; Pareto-optimal points are highlighted. */
export function TradeoffScatter({ points, height = 320 }: { points: { label: string; sun: number; dte: number; pareto: boolean; excluded: boolean }[]; height?: number }) {
  const T = useChartTheme();
  const option = useMemo(() => {
    const front = points.filter((p) => p.pareto).sort((a, b) => a.sun - b.sun);
    const pt = (p: (typeof points)[number]) => ({ value: [p.sun, p.dte], name: p.label });
    return {
      grid: { left: 64, right: 32, top: 40, bottom: 76 },
      legend: { bottom: 0, textStyle: { color: T.text } },
      labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
      tooltip: { trigger: "item", ...tip(T), formatter: (q: { name: string; value: [number, number]; seriesName: string }) => `${q.name}<br/>Sunlight ${q.value[0].toFixed(2)} h<br/>Geometric DTE ${q.value[1].toFixed(2)} h<br/>${q.seriesName}` },
      xAxis: { type: "value", name: "Direct sunlight (h)", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: T.muted }, scale: true, ...axes(T) },
      yAxis: { type: "value", name: "Geometric DTE (h)", nameLocation: "middle", nameGap: 44, nameTextStyle: { color: T.muted }, scale: true, ...axes(T) },
      series: [
        { name: "Pareto front", type: "line", data: front.map((p) => [p.sun, p.dte]), showSymbol: false, lineStyle: { color: T.accent, type: "dashed", width: 1.5 }, silent: true },
        { name: "Pareto-optimal", type: "scatter", symbolSize: 16, data: points.filter((p) => p.pareto).map(pt), itemStyle: { color: T.accent }, label: { show: true, position: "right", color: T.text, formatter: "{b}", fontSize: 11 } },
        { name: "Dominated", type: "scatter", symbolSize: 11, data: points.filter((p) => !p.pareto && !p.excluded).map(pt), itemStyle: { color: T.muted }, label: { show: true, position: "right", color: T.muted, formatter: "{b}", fontSize: 11 } },
        { name: "Fails a constraint", type: "scatter", symbol: "diamond", symbolSize: 11, data: points.filter((p) => p.excluded).map(pt), itemStyle: { color: T.bad }, label: { show: true, position: "bottom", color: T.bad, formatter: "{b}", fontSize: 11 } },
      ],
      aria: { enabled: true },
    };
  }, [points, T]);
  return <EChart option={option} height={height} ariaLabel="Trade-off scatter of sunlight hours against geometric direct-to-Earth hours; Pareto-optimal scenarios highlighted. The table lists exact values." />;
}

/** One line per site across analysis windows (multi-date comparison). */
export function MultiDateLines({ windows, series, unit, height = 280 }: { windows: string[]; series: { name: string; values: (number | null)[] }[]; unit: string; height?: number }) {
  const T = useChartTheme();
  const option = useMemo(() => {
    const palette = [T.sun, T.earth, T.accent, T.ok, T.bad, T.ink, T.muted];
    return {
      grid: { left: 52, right: 16, top: 40, bottom: 56 },
      legend: { top: 0, textStyle: { color: T.text }, type: "scroll" },
      tooltip: { trigger: "axis", ...tip(T), valueFormatter: (v: number | null) => (v == null ? "not analysed" : `${v.toFixed(2)} ${unit}`) },
      xAxis: { type: "category", data: windows, ...axes(T), axisLabel: { color: T.muted, hideOverlap: true } },
      yAxis: { type: "value", name: unit, nameTextStyle: { color: T.muted }, ...axes(T) },
      series: series.map((s, i) => ({ name: s.name, type: "line", data: s.values, connectNulls: false, symbolSize: 8, lineStyle: { width: 2, color: palette[i % palette.length] }, itemStyle: { color: palette[i % palette.length] } })),
      aria: { enabled: true },
    };
  }, [windows, series, unit, T]);
  return <EChart option={option} height={height} ariaLabel={`Multi-date comparison in ${unit}; the matrix lists exact values.`} />;
}
