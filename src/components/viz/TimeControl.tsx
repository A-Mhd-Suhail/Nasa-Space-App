"use client";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimeRow } from "@/lib/analysis-types";
import { fmtUtc } from "../ui";

/** Playback speeds as multiples of real time (1× = one simulated second per wall-clock second). */
export const SPEEDS = [1, 10, 60, 360, 3600, 21_600, 86_400] as const;
const STEP_OPTIONS: [number, string][] = [[0, "1 sample"], [3600, "1 h"], [6 * 3600, "6 h"], [86_400, "1 day"]];

/**
 * Mission time controller. Scientific values are only ever read from the sampled
 * timeline (`rows`); playback advances a simulated clock and selects the latest sample
 * at or before it, so no calculation runs per animation frame.
 */
export function useTimeline(n: number, initial = 0) {
  const [index, setIndexRaw] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(3600);
  const [stepS, setStepS] = useState(3600);
  const [range, setRange] = useState<[number, number] | null>(null); // custom playback range (sample indices)
  const clamp = useCallback((i: number) => Math.min(Math.max(0, i), Math.max(0, n - 1)), [n]);
  const setIndex = useCallback((i: number) => setIndexRaw(clamp(i)), [clamp]);
  return { index: clamp(index), setIndex, playing, setPlaying, speed, setSpeed, stepS, setStepS, range, setRange };
}
type Timeline = ReturnType<typeof useTimeline>;

function indexAtOrBefore(times: number[], t: number): number {
  let lo = 0, hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

const toLocalInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);

export function TimeControl({ rows, t }: { rows: TimeRow[]; t: Timeline }) {
  const n = rows.length;
  const times = useMemo(() => rows.map((r) => Date.parse(r.utc)), [rows]);
  const [lo, hi] = t.range ?? [0, Math.max(0, n - 1)];
  const r = rows[t.index];
  const sampleStep = n > 1 ? (times[1] - times[0]) / 1000 : 0;
  const clock = useRef<number | null>(null);
  const idxRef = useRef(t.index);
  const { setIndex, playing, speed } = t;
  useEffect(() => {
    idxRef.current = t.index;
  }, [t.index]);

  // Simulated clock driven by requestAnimationFrame; loops within the playback range.
  useEffect(() => {
    if (!playing || n < 2) {
      clock.current = null;
      return;
    }
    let raf = 0;
    let last = performance.now();
    clock.current = times[idxRef.current];
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      let sim = (clock.current ?? times[lo]) + dt * speed;
      if (sim > times[hi]) sim = times[lo];
      clock.current = sim;
      const i = indexAtOrBefore(times, sim);
      if (i !== idxRef.current) {
        idxRef.current = i;
        setIndex(i);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n, times, lo, hi, setIndex]);

  const stepBy = (dir: 1 | -1) => {
    t.setPlaying(false);
    if (t.stepS === 0 || n < 2) return t.setIndex(t.index + dir);
    const target = times[t.index] + dir * t.stepS * 1000;
    t.setIndex(dir > 0 ? Math.min(hi, Math.max(t.index + 1, indexAtOrBefore(times, target))) : Math.max(lo, Math.min(t.index - 1, indexAtOrBefore(times, target))));
  };
  const btn = "grid h-9 w-9 place-items-center rounded-[5px] border border-line-2 bg-panel text-text-2 hover:bg-panel-2 hover:text-text";

  return (
    <div className="no-print rounded-[6px] border border-line bg-panel px-4 py-3 shadow-[var(--shadow-sheet)]" role="group" aria-label="Mission time control">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} aria-label="Reset to start" title="Reset to start" onClick={() => { t.setPlaying(false); t.setIndex(lo); }}>
          <RotateCcw size={15} />
        </button>
        <button type="button" className={btn} aria-label="Step backward" title="Step backward" onClick={() => stepBy(-1)}>
          <SkipBack size={15} />
        </button>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-[5px] bg-accent text-accent-ink hover:brightness-110" aria-label={t.playing ? "Pause" : "Play"} onClick={() => t.setPlaying(!t.playing)}>
          {t.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className={btn} aria-label="Step forward" title="Step forward" onClick={() => stepBy(1)}>
          <SkipForward size={15} />
        </button>
        <div className="num min-w-[13rem] font-mono text-[13px] font-medium text-text" aria-live="polite" data-testid="time-readout">{fmtUtc(r?.utc)}</div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            Speed
            <select value={t.speed} onChange={(e) => t.setSpeed(Number(e.target.value))} className="h-8 rounded-[5px] border border-line-2 bg-panel px-2 text-xs text-text" aria-label="Playback speed (multiple of real time)">
              {SPEEDS.map((s) => (
                <option key={s} value={s}>{s.toLocaleString("en-US")}× {s >= 3600 ? `(${s / 3600} h/s)` : ""}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            Step
            <select value={t.stepS} onChange={(e) => t.setStepS(Number(e.target.value))} className="h-8 rounded-[5px] border border-line-2 bg-panel px-2 text-xs text-text" aria-label="Step size">
              {STEP_OPTIONS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
            </select>
          </label>
          <span className="text-xs text-muted">sampled every {sampleStep >= 3600 ? `${sampleStep / 3600} h` : `${sampleStep / 60} min`} · {t.index + 1}/{n}</span>
        </div>
      </div>
      <input type="range" min={0} max={Math.max(0, n - 1)} value={t.index} onChange={(e) => { t.setPlaying(false); t.setIndex(Number(e.target.value)); }} aria-label="Selected time sample" className="mt-2 w-full accent-[var(--accent)]" />
      <div className="num flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>{fmtUtc(rows[0]?.utc)}</span>
        {n > 1 && (
          <details className="text-[11px]">
            <summary className="cursor-pointer select-none text-text-2">Playback range{t.range ? " (custom)" : ""}</summary>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <label>From (UTC) <input type="datetime-local" className="h-7 rounded border border-line-2 bg-panel px-1 text-text" min={toLocalInput(times[0])} max={toLocalInput(times[n - 1])} value={toLocalInput(times[lo])} onChange={(e) => { const i = indexAtOrBefore(times, Date.parse(`${e.target.value}Z`)); t.setRange([Math.min(i, hi - 1), hi]); }} /></label>
              <label>To (UTC) <input type="datetime-local" className="h-7 rounded border border-line-2 bg-panel px-1 text-text" min={toLocalInput(times[0])} max={toLocalInput(times[n - 1])} value={toLocalInput(times[hi])} onChange={(e) => { const i = indexAtOrBefore(times, Date.parse(`${e.target.value}Z`)); t.setRange([lo, Math.max(i, lo + 1)]); }} /></label>
              {t.range && <button type="button" className="underline" onClick={() => t.setRange(null)}>Full interval</button>}
            </div>
          </details>
        )}
        <span>{fmtUtc(rows[n - 1]?.utc)}</span>
      </div>
    </div>
  );
}
