"use client";
import { useEffect, useMemo, useRef } from "react";
import { useThemeVersion } from "../shell/ThemeToggle";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, AriaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([LineChart, ScatterChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, DataZoomComponent, AriaComponent, CanvasRenderer]);

export type ChartTheme = { text: string; muted: string; line: string; sun: string; earth: string; accent: string; bad: string; ok: string; panel: string; fill: string; sunBand: string; earthBand: string; unknownBand: string; ink: string; sans: string; mono: string };

const FALLBACK: ChartTheme = { text: "#4a463e", muted: "#68635a", line: "#ddd6c9", sun: "#c5a46d", earth: "#8a7fb8", accent: "#9a543c", bad: "#a8402f", ok: "#46704d", panel: "#fffcf5", fill: "rgba(41,39,34,0.08)", sunBand: "rgba(197,164,109,0.2)", earthBand: "rgba(138,127,184,0.16)", unknownBand: "rgba(106,101,91,0.16)", ink: "#292722", sans: "sans-serif", mono: "monospace" };

function readTheme(): ChartTheme {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    text: v("--text-2", FALLBACK.text),
    muted: v("--muted", FALLBACK.muted),
    line: v("--line", FALLBACK.line),
    sun: v("--sun-mark", FALLBACK.sun),
    earth: v("--earth-mark", FALLBACK.earth),
    accent: v("--accent", FALLBACK.accent),
    bad: v("--bad", FALLBACK.bad),
    ok: v("--ok", FALLBACK.ok),
    panel: v("--panel", FALLBACK.panel),
    ink: v("--text", FALLBACK.ink),
    fill: dark ? "rgba(239,233,221,0.08)" : "rgba(41,39,34,0.08)",
    sunBand: dark ? "rgba(226,190,122,0.14)" : "rgba(197,164,109,0.2)",
    earthBand: dark ? "rgba(175,164,214,0.13)" : "rgba(138,127,184,0.16)",
    unknownBand: dark ? "rgba(169,163,150,0.14)" : "rgba(106,101,91,0.16)",
    sans: v("--font-plex-sans", "sans-serif"),
    mono: v("--font-plex-mono", "monospace"),
  };
}

/** Chart colours from the active theme's CSS tokens; recomputed when the theme changes. */
export function useChartTheme(): ChartTheme {
  const v = useThemeVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- v is the change signal for the DOM-derived palette
  return useMemo(() => readTheme(), [v]);
}

/** @deprecated static fallback for non-hook callers */
export const chartTheme = FALLBACK;

export function EChart({ option, height = 320, ariaLabel, onClick }: { option: EChartsCoreOption; height?: number; ariaLabel: string; onClick?: (p: { dataIndex: number; value: unknown }) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    inst.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      inst.current = null;
    };
  }, []);
  useEffect(() => {
    inst.current?.setOption({ aria: { enabled: true }, animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, animationDuration: 500, animationEasing: "cubicOut", textStyle: { color: readTheme().text, fontFamily: readTheme().sans }, ...option }, { notMerge: true });
  }, [option]);
  useEffect(() => {
    const c = inst.current;
    if (!c || !onClick) return;
    const h = (p: unknown) => onClick(p as { dataIndex: number; value: unknown });
    c.on("click", h);
    return () => {
      c.off("click", h);
    };
  }, [onClick]);
  return <div ref={el} role="img" aria-label={ariaLabel} style={{ height, width: "100%" }} />;
}
