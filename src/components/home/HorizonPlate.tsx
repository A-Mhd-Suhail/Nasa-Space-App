import type { AnalysisResult } from "@/lib/analysis-types";

/** Server-rendered horizon plate from a real analysis: terrain horizon (0–360°) with the Sun and Earth tracks. */
export function HorizonPlate({ r, title }: { r: AnalysisResult; title: string }) {
  const W = 1000;
  const H = 300;
  const az = r.horizon.azimuthsDeg;
  const el = r.horizon.elevationDeg;
  const step = Math.max(1, Math.floor(r.timeseries.length / 260));
  const sun = r.timeseries.filter((_, i) => i % step === 0).filter((t) => t.sunAzDeg != null && t.sunElDeg != null);
  const earth = r.timeseries.filter((_, i) => i % step === 0).filter((t) => t.earthAzDeg != null && t.earthElDeg != null);
  const vals = [...el.filter((v): v is number => v != null), ...sun.map((s) => s.sunElDeg!), ...earth.map((s) => s.earthElDeg!)];
  const lo = Math.floor(Math.min(...vals)) - 0.5;
  const hi = Math.ceil(Math.max(...vals)) + 0.5;
  const X = (a: number) => (a / 360) * W;
  const Y = (e: number) => H - ((e - lo) / (hi - lo)) * H;
  const ridge = az.map((a, i) => `${i ? "L" : "M"}${X(a).toFixed(1)} ${Y(el[i] ?? lo).toFixed(1)}`).join(" ");
  const ticks = [];
  for (let t = Math.ceil(lo); t <= Math.floor(hi); t += Math.max(1, Math.round((hi - lo) / 5))) ticks.push(t);
  return (
    <figure>
      <svg viewBox={`-44 -14 ${W + 60} ${H + 46}`} className="w-full" role="img" aria-label={`${title}: terrain horizon from 0 to 360 degrees azimuth, with the Sun and Earth paths over the analysis window`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={W} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={-10} y={Y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)" fontFamily="var(--font-plex-mono)">{t}°</text>
          </g>
        ))}
        <path d={`${ridge} L${W} ${H} L0 ${H} Z`} fill="var(--panel-3)" />
        <path d={ridge} fill="none" stroke="var(--text)" strokeWidth={1.4} />
        {sun.map((s, i) => <circle key={`s${i}`} cx={X(s.sunAzDeg!)} cy={Y(s.sunElDeg!)} r={1.9} fill={s.sunState === "visible" || s.sunState === "partial" ? "var(--sun-mark)" : "var(--muted)"} opacity={s.sunState === "visible" ? 1 : 0.55} />)}
        {earth.map((s, i) => <circle key={`e${i}`} cx={X(s.earthAzDeg!)} cy={Y(s.earthElDeg!)} r={1.9} fill="var(--earth-mark)" />)}
        {[0, 90, 180, 270, 360].map((a) => (
          <text key={a} x={X(a)} y={H + 22} textAnchor="middle" fontSize="12" fill="var(--muted)" fontFamily="var(--font-plex-mono)">{["N", "E", "S", "W", "N"][a / 90]} {a}°</text>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><svg width="16" height="8" aria-hidden><line x1="0" y1="4" x2="16" y2="4" stroke="var(--text)" strokeWidth="2" /></svg>Terrain horizon (LOLA, curvature included)</span>
        <span className="flex items-center gap-1.5"><svg width="8" height="8" aria-hidden><circle cx="4" cy="4" r="3.5" fill="var(--sun-mark)" /></svg>Sun lit</span>
        <span className="flex items-center gap-1.5"><svg width="8" height="8" aria-hidden><circle cx="4" cy="4" r="3.5" fill="var(--muted)" /></svg>Sun hidden</span>
        <span className="flex items-center gap-1.5"><svg width="8" height="8" aria-hidden><circle cx="4" cy="4" r="3.5" fill="var(--earth-mark)" /></svg>Earth</span>
      </figcaption>
    </figure>
  );
}
