"use client";
import { Activity, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Lightweight rendering diagnostics (opt-in: Advanced mode "Perf" button or ?perf=1).
 * A single requestAnimationFrame loop records frame intervals into a ring buffer; text is written
 * to DOM refs twice a second, so there is no per-frame React state. Long tasks (main-thread stalls
 * > 50 ms) come from PerformanceObserver where the browser supports it.
 */
const KEY = "moonnav-perf";
const EVT = "moonnav-perf-change";
const N = 600; // ~10 s at 60 Hz

type SceneInfo = { scene: string; detail?: Record<string, unknown> };
declare global {
  interface Window {
    __moonnavScene?: SceneInfo;
  }
}

/** Scenes call this so recordings say what was on screen (scene name, LOD, layers…). */
export function setPerfScene(scene: string, detail?: Record<string, unknown>) {
  if (typeof window !== "undefined") window.__moonnavScene = { scene, detail };
}

export function perfEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1" || new URLSearchParams(window.location.search).get("perf") === "1";
  } catch {
    return false;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}
export function setPerfEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  if (!on) {
    // ?perf=1 would otherwise keep the panel open after Close.
    const u = new URL(window.location.href);
    if (u.searchParams.has("perf")) {
      u.searchParams.delete("perf");
      window.history.replaceState(window.history.state, "", u);
    }
  }
  window.dispatchEvent(new Event(EVT));
}

export type PerfStats = { frames: number; fpsMean: number; fpsCurrent: number; frameMs: { p50: number; p95: number; p99: number; max: number }; slowFrames: number; longTasks: number; longTaskMs: number };

/** Pure statistics over frame intervals (ms); exported for unit tests. */
export function frameStats(intervals: number[], longTasks: { count: number; ms: number } = { count: 0, ms: 0 }): PerfStats {
  const v = intervals.filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return { frames: 0, fpsMean: 0, fpsCurrent: 0, frameMs: { p50: 0, p95: 0, p99: 0, max: 0 }, slowFrames: 0, longTasks: longTasks.count, longTaskMs: longTasks.ms };
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  const total = v.reduce((a, b) => a + b, 0);
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    frames: v.length, fpsMean: r((1000 * v.length) / total), fpsCurrent: r(1000 / v[v.length - 1]),
    frameMs: { p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), max: r(s[s.length - 1]) },
    slowFrames: v.filter((x) => x > 50).length, longTasks: longTasks.count, longTaskMs: r(longTasks.ms),
  };
}

function context() {
  let renderer = "unavailable";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } else renderer = "WebGL not supported";
  } catch {
    renderer = "WebGL check failed";
  }
  const n = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: n.userAgent, webglRenderer: renderer, viewport: `${window.innerWidth}x${window.innerHeight}`, devicePixelRatio: window.devicePixelRatio,
    cpuThreads: n.hardwareConcurrency ?? null, deviceMemoryGB: n.deviceMemory ?? null, path: window.location.pathname,
  };
}

export function PerfPanel() {
  const enabled = useSyncExternalStore(subscribe, perfEnabled, () => false);
  const [record, setRecord] = useState<null | { stats: PerfStats; startedAt: string; durationS: number }>(null);
  const out = useRef<HTMLPreElement>(null);
  const buf = useRef<number[]>([]);
  const lt = useRef<{ t: number; ms: number }[]>([]);
  const rec = useRef<{ start: number; intervals: number[]; lt: { count: number; ms: number } } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = last;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const b = buf.current;
      b.push(dt);
      if (b.length > N) b.shift();
      if (rec.current) rec.current.intervals.push(dt);
      if (now - lastPaint > 500 && out.current) {
        lastPaint = now;
        const cutoff = now - 10_000;
        lt.current = lt.current.filter((x) => x.t >= cutoff);
        const s = frameStats(b.slice(-120), { count: lt.current.length, ms: lt.current.reduce((a, x) => a + x.ms, 0) });
        const sc = window.__moonnavScene;
        out.current.textContent =
          `FPS ${s.fpsCurrent.toFixed(0).padStart(3)} now · ${s.fpsMean.toFixed(1)} avg (last ${s.frames} frames)\n` +
          `frame ms p50 ${s.frameMs.p50} · p95 ${s.frameMs.p95} · p99 ${s.frameMs.p99} · max ${s.frameMs.max}\n` +
          `slow frames >50 ms: ${s.slowFrames} · long tasks (10 s): ${s.longTasks} / ${s.longTaskMs} ms\n` +
          `scene: ${sc ? `${sc.scene} ${sc.detail ? JSON.stringify(sc.detail) : ""}` : "none registered"}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let obs: PerformanceObserver | null = null;
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            lt.current.push({ t: e.startTime, ms: e.duration });
            if (rec.current) {
              rec.current.lt.count++;
              rec.current.lt.ms += e.duration;
            }
          }
        });
        obs.observe({ type: "longtask", buffered: false });
      }
    } catch {
      obs = null;
    }
    return () => {
      cancelAnimationFrame(raf);
      obs?.disconnect();
      buf.current = [];
      lt.current = [];
      rec.current = null;
    };
  }, [enabled]);

  if (!enabled) return null;
  const startRecording = (seconds: number) => {
    rec.current = { start: performance.now(), intervals: [], lt: { count: 0, ms: 0 } };
    const startedAt = new Date().toISOString();
    setRecord(null);
    setTimeout(() => {
      const r = rec.current;
      rec.current = null;
      if (r) setRecord({ stats: frameStats(r.intervals, r.lt), startedAt, durationS: seconds });
    }, seconds * 1000);
  };
  const exportJson = () => {
    if (!record) return;
    const blob = new Blob([JSON.stringify({ kind: "moonnav.perf-sample", ...record, scene: window.__moonnavScene ?? null, context: context() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `moonnav-perf-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="no-print fixed bottom-3 right-3 z-[70] w-[min(94vw,23rem)] rounded-[6px] border border-line-2 bg-panel/95 p-2.5 text-[11px] shadow-[var(--shadow-sheet)] backdrop-blur" role="region" aria-label="Rendering performance diagnostics" data-testid="perf-panel">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-medium text-text"><Activity size={13} aria-hidden /> Rendering diagnostics</span>
        <button type="button" aria-label="Close diagnostics" onClick={() => setPerfEnabled(false)} className="rounded p-0.5 text-muted hover:text-text"><X size={13} /></button>
      </div>
      <pre ref={out} className="num whitespace-pre-wrap font-mono text-[11px] leading-snug text-text-2" aria-live="off" data-testid="perf-live">measuring…</pre>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border border-line-2 px-2 py-0.5 hover:bg-panel-2" onClick={() => startRecording(10)} data-testid="perf-record">Record 10 s</button>
        {record && <button type="button" className="rounded border border-line-2 px-2 py-0.5 hover:bg-panel-2" onClick={exportJson}>Export JSON</button>}
        {record && <span className="num text-muted" data-testid="perf-result">{record.stats.fpsMean} fps avg · p95 {record.stats.frameMs.p95} ms · {record.stats.frames} frames</span>}
      </div>
      <p className="mt-1 text-[10px] text-muted">Numbers depend on this device, browser, viewport and what is on screen; compare only like with like.</p>
    </div>
  );
}

/** Small toggle for the header (Advanced mode only). */
export function PerfToggle() {
  const enabled = useSyncExternalStore(subscribe, perfEnabled, () => false);
  return (
    <button type="button" onClick={() => setPerfEnabled(!enabled)} aria-pressed={enabled} title="Rendering diagnostics (FPS, frame time, long tasks)" className={`adv-only grid h-9 w-9 place-items-center rounded-md border border-line-2 ${enabled ? "bg-accent text-accent-ink" : "bg-panel text-text-2 hover:text-text"}`} data-testid="perf-toggle">
      <Activity size={15} aria-hidden />
      <span className="sr-only">Toggle rendering diagnostics</span>
    </button>
  );
}
