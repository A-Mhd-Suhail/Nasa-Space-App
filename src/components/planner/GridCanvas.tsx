"use client";
import { useEffect, useRef } from "react";

/** Colour for one cell; null = unknown (drawn grey with hatching — never as "good"). */
export type CellColor = [number, number, number] | null;

/**
 * Square grid heat map on a canvas. Row 0 is drawn at the top. Click selects a cell; arrow keys move
 * the selection when focused. An optional circle (radius in cells) marks the landing zone.
 */
export function GridCanvas({
  n, color, selected, onSelect, size = 360, circleCells, label,
}: {
  n: number;
  color: (row: number, col: number) => CellColor;
  selected?: { row: number; col: number } | null;
  onSelect?: (row: number, col: number) => void;
  size?: number;
  circleCells?: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = size / n;
    ctx.clearRect(0, 0, size, size);
    for (let r = 0; r < n; r++)
      for (let k = 0; k < n; k++) {
        const col = color(r, k);
        if (col) {
          ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
          ctx.fillRect(k * c, r * c, Math.ceil(c), Math.ceil(c));
        } else {
          ctx.fillStyle = "#8d877d";
          ctx.fillRect(k * c, r * c, Math.ceil(c), Math.ceil(c));
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(k * c, (r + 1) * c);
          ctx.lineTo((k + 1) * c, r * c);
          ctx.stroke();
        }
      }
    if (circleCells) {
      ctx.strokeStyle = "#fffcf5";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, circleCells * c, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (selected) {
      ctx.strokeStyle = "#1c1a17";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(selected.col * c + 1, selected.row * c + 1, c - 2, c - 2);
      ctx.strokeStyle = "#fffcf5";
      ctx.lineWidth = 1;
      ctx.strokeRect(selected.col * c + 1, selected.row * c + 1, c - 2, c - 2);
    }
  }, [n, color, selected, size, circleCells]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      tabIndex={onSelect ? 0 : -1}
      style={{ width: size, maxWidth: "100%", height: "auto", aspectRatio: "1 / 1" }}
      className="cursor-crosshair rounded-[4px] border border-line"
      onClick={(e) => {
        if (!onSelect) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const k = Math.floor(((e.clientX - rect.left) / rect.width) * n);
        const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
        if (r >= 0 && k >= 0 && r < n && k < n) onSelect(r, k);
      }}
      onKeyDown={(e) => {
        if (!onSelect || !selected) return;
        const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        const m = d[e.key];
        if (!m) return;
        e.preventDefault();
        onSelect(Math.min(n - 1, Math.max(0, selected.row + m[0])), Math.min(n - 1, Math.max(0, selected.col + m[1])));
      }}
    />
  );
}

/** Perceptually ordered ramps used by the planner maps. */
export const ramp = (stops: [number, number, number][], t: number): [number, number, number] => {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((k) => Math.round(stops[i][k] + f * (stops[i + 1][k] - stops[i][k]))) as [number, number, number];
};
export const SCORE_RAMP: [number, number, number][] = [[226, 216, 196], [184, 190, 150], [112, 146, 104], [58, 98, 66]];
export const SLOPE_RAMP: [number, number, number][] = [[244, 240, 231], [221, 196, 150], [197, 150, 100], [166, 94, 69], [95, 52, 40]];
export const FAIL_RGB: [number, number, number] = [176, 92, 74];
