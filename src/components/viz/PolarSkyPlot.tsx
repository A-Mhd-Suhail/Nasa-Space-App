"use client";
import { useMemo, useState } from "react";
import type { HorizonData, TimeRow } from "@/lib/analysis-types";

/**
 * Radial 0–360° sky plot: azimuth clockwise from local north (N up, E right, as on GNSS sky plots),
 * elevation mapped linearly from the outer ring (lowest) to the centre (highest).
 * "Polar zoom" shows the few degrees around the horizon that matter at the lunar poles;
 * "Full sky" shows 0–90°. Terrain below the LOLA horizon is shaded. Every point comes from the
 * stored analysis (horizon profile and SPICE timeseries); nothing is interpolated beyond the
 * sampled tracks.
 */
type Scale = "zoom" | "full";
const SIZE = 420;
const C = SIZE / 2;
const R = SIZE / 2 - 34;

export function PolarSkyPlot({ horizon, rows, selectedIndex, maskDeg }: { horizon: HorizonData; rows: TimeRow[]; selectedIndex?: number; maskDeg?: number | null }) {
  const [scale, setScale] = useState<Scale>("zoom");
  const [hover, setHover] = useState<{ az: number; el: number; hz: number | null } | null>(null);

  const range = useMemo(() => {
    if (scale === "full") return { lo: -15, hi: 90, step: 15 };
    const vals = [...horizon.elevationDeg, ...rows.flatMap((r) => [r.sunElDeg, r.earthElDeg])].filter((v): v is number => v != null);
    const lo = Math.floor(Math.min(-2, ...vals) / 2) * 2;
    const hi = Math.ceil(Math.max(4, ...vals) / 2) * 2;
    return { lo, hi, step: hi - lo > 16 ? 4 : 2 };
  }, [scale, horizon, rows]);

  const rOf = (el: number) => R * (1 - (Math.min(Math.max(el, range.lo), range.hi) - range.lo) / (range.hi - range.lo));
  const xy = (az: number, el: number): [number, number] => {
    const a = (az * Math.PI) / 180;
    const r = rOf(el);
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  };

  const terrain = useMemo(() => {
    const pts = horizon.azimuthsDeg.map((az, i) => ({ az, el: horizon.elevationDeg[i] }));
    // outer ring forward, horizon line backward → filled ground band
    const outer = pts.map((p) => xy(p.az, range.lo));
    const line = pts.map((p) => (p.el == null ? null : xy(p.az, p.el)));
    const known = line.every(Boolean);
    const d = known ? `M${outer.map((p) => p.join(",")).join("L")}Z M${(line as [number, number][]).map((p) => p.join(",")).join("L")}Z` : "";
    const stroke = line.map((p, i) => (p ? `${i === 0 || !line[i - 1] ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}` : "")).join("");
    return { d, stroke };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- xy depends only on range
  }, [horizon, range]);

  const track = (key: "sun" | "earth") => {
    const step = Math.max(1, Math.floor(rows.length / 600));
    return rows
      .filter((_, i) => i % step === 0)
      .map((r) => {
        const az = key === "sun" ? r.sunAzDeg : r.earthAzDeg;
        const el = key === "sun" ? r.sunElDeg : r.earthElDeg;
        return az == null || el == null || el < range.lo || el > range.hi ? null : xy(az, el);
      })
      .filter((p): p is [number, number] => !!p);
  };
  const sun = useMemo(() => track("sun"), [rows, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const earth = useMemo(() => track("earth"), [rows, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = selectedIndex != null ? rows[selectedIndex] : null;

  const rings: number[] = [];
  for (let e = range.lo; e <= range.hi; e += range.step) rings.push(e);

  const horizonAt = (az: number) => {
    const step = horizon.azimuthsDeg[1] - horizon.azimuthsDeg[0];
    const i = Math.round((((az % 360) + 360) % 360) / step) % horizon.azimuthsDeg.length;
    return horizon.elevationDeg[i] ?? null;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * SIZE - C;
    const y = ((e.clientY - b.top) / b.height) * SIZE - C;
    const r = Math.hypot(x, y);
    if (r > R) return setHover(null);
    const az = (((Math.atan2(x, -y) * 180) / Math.PI) + 360) % 360;
    const el = range.lo + (1 - r / R) * (range.hi - range.lo);
    setHover({ az, el, hz: horizonAt(az) });
  };

  const sunSel = sel?.sunAzDeg != null && sel.sunElDeg != null ? xy(sel.sunAzDeg, sel.sunElDeg) : null;
  const earthSel = sel?.earthAzDeg != null && sel.earthElDeg != null ? xy(sel.earthAzDeg, sel.earthElDeg) : null;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto aspect-square w-full max-w-[460px] touch-none select-none"
        role="img"
        aria-label={`Polar sky plot. Azimuth clockwise from north, north at top, east at right. Elevation from ${range.lo}° at the outer ring to ${range.hi}° at the centre. Shaded area is terrain above the local horizontal from the LOLA horizon profile; ochre dots are the Sun track and violet dots the Earth track over the analysis interval.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        data-testid="polar-sky-plot"
      >
        <circle cx={C} cy={C} r={R} fill="var(--panel-2)" stroke="var(--line-2)" />
        {terrain.d && <path d={terrain.d} fill="var(--text)" fillOpacity={0.12} fillRule="evenodd" />}
        {rings.map((e) => (
          <g key={e}>
            <circle cx={C} cy={C} r={rOf(e)} fill="none" stroke="var(--line)" strokeDasharray={e === 0 ? undefined : "2 3"} strokeWidth={e === 0 ? 1.2 : 0.8} />
            <text x={C + 3} y={C - rOf(e) - 2} className="num" fontSize={9} fill="var(--muted)">{e}°</text>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, i) => i * 30).map((az) => {
          const [x, y] = xy(az, range.lo);
          return <line key={az} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth={0.6} />;
        })}
        {maskDeg != null && maskDeg >= range.lo && maskDeg <= range.hi && <circle cx={C} cy={C} r={rOf(maskDeg)} fill="none" stroke="var(--earth-mark)" strokeDasharray="5 4" strokeWidth={1} />}
        <path d={terrain.stroke} fill="none" stroke="var(--text)" strokeWidth={1.3} />
        {sun.map(([x, y], i) => <circle key={`s${i}`} cx={x} cy={y} r={1.6} fill="var(--sun-mark)" />)}
        {earth.map(([x, y], i) => <circle key={`e${i}`} cx={x} cy={y} r={1.6} fill="var(--earth-mark)" />)}
        {sunSel && <circle cx={sunSel[0]} cy={sunSel[1]} r={7} fill="none" stroke="var(--accent)" strokeWidth={2}><title>{`Sun at selected time: az ${sel!.sunAzDeg!.toFixed(2)}°, el ${sel!.sunElDeg!.toFixed(3)}°`}</title></circle>}
        {earthSel && <circle cx={earthSel[0]} cy={earthSel[1]} r={7} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="3 2"><title>{`Earth at selected time: az ${sel!.earthAzDeg!.toFixed(2)}°, el ${sel!.earthElDeg!.toFixed(3)}°`}</title></circle>}
        {(
          [
            [0, "N"],
            [90, "E"],
            [180, "S"],
            [270, "W"],
          ] as const
        ).map(([az, l]) => {
          const a = (az * Math.PI) / 180;
          return (
            <text key={l} x={C + (R + 16) * Math.sin(a)} y={C - (R + 16) * Math.cos(a) + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--text-2)">
              {l}
            </text>
          );
        })}
        {hover && <circle cx={xy(hover.az, hover.el)[0]} cy={xy(hover.az, hover.el)[1]} r={3} fill="var(--accent)" />}
      </svg>
      <div className="min-w-[200px] space-y-3 text-xs text-text-2">
        <div role="radiogroup" aria-label="Elevation scale" className="inline-flex rounded-[5px] border border-line p-0.5">
          {(
            [
              ["zoom", "Polar zoom"],
              ["full", "Full sky"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={scale === k} onClick={() => setScale(k)} className={`rounded-[3px] px-2.5 py-1 ${scale === k ? "bg-accent text-accent-ink" : "hover:bg-panel-3/60"}`}>
              {l}
            </button>
          ))}
        </div>
        <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" aria-live="polite">
          <dt className="text-muted">Pointer</dt>
          <dd>{hover ? `az ${hover.az.toFixed(1)}° · el ${hover.el.toFixed(2)}°` : "move over the plot"}</dd>
          <dt className="text-muted">Terrain there</dt>
          <dd>{hover ? (hover.hz == null ? "unknown" : `${hover.hz.toFixed(2)}° (${hover.el > hover.hz ? "open sky" : "below terrain"})`) : "—"}</dd>
          <dt className="text-muted">Sun, selected</dt>
          <dd>{sel?.sunAzDeg != null ? `az ${sel.sunAzDeg.toFixed(2)}° · el ${sel.sunElDeg?.toFixed(3)}°` : "—"}</dd>
          <dt className="text-muted">Earth, selected</dt>
          <dd>{sel?.earthAzDeg != null ? `az ${sel.earthAzDeg.toFixed(2)}° · el ${sel.earthElDeg?.toFixed(3)}°` : "—"}</dd>
        </dl>
        <ul className="space-y-1">
          <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--sun-mark)]" /> Sun track</li>
          <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--earth-mark)]" /> Earth track</li>
          <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-4 bg-[var(--text)] opacity-20" /> Terrain (LOLA horizon)</li>
          {maskDeg != null && <li className="flex items-center gap-2"><span aria-hidden className="h-0 w-4 border-t border-dashed border-[var(--earth-mark)]" /> Antenna mask {maskDeg}°</li>}
          <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-full border-2 border-accent" /> Selected time</li>
        </ul>
        <p className="text-muted">Bodies outside the plotted elevation range are omitted, not clipped to the edge.</p>
      </div>
    </div>
  );
}
