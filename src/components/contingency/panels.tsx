"use client";
import { useEffect, useMemo, useState } from "react";
import { commWindows, type CommInputs } from "@/lib/contingency/relay";
import { LABELS, STATES, stateAt, type HistoryItem, type MissionState } from "@/lib/contingency/machine";
import type { SiteAssessment, SiteEvaluation } from "@/lib/contingency/sites";
import type { Recovery } from "@/lib/contingency/physics";
import { Card, CardHeader, cx } from "../ui";

export function Row({ k, v, tone }: { k: React.ReactNode; v: React.ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return <div className="flex justify-between gap-3 py-0.5 text-sm"><dt className="text-muted">{k}</dt><dd className={cx("num text-right", tone === "ok" && "text-ok", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{v}</dd></div>;
}
export function Led({ state, label }: { state: "ok" | "bad" | "warn" | "off"; label: string }) {
  const c = state === "ok" ? "bg-ok" : state === "bad" ? "bg-bad" : state === "warn" ? "bg-warn" : "bg-muted";
  return <span className="inline-flex items-center gap-2"><span aria-hidden className={cx("inline-block h-2.5 w-2.5 rounded-full", c)} />{label}</span>;
}

export function StateMachine({ history, t }: { history: HistoryItem[]; t: number }) {
  const cur = stateAt(history, t).state;
  const visited = new Set(history.filter((h) => h.tS <= t).map((h) => h.state));
  return (
    <Card>
      <CardHeader title="Mission state machine" subtitle="Only legal transitions occur; each is logged with its reason." />
      <ol className="flex flex-wrap gap-1.5 px-4 pt-3 text-xs" aria-label="Mission states">
        {STATES.map((s) => (
          <li key={s} data-state={s} data-active={s === cur} className={cx("rounded-full border px-2.5 py-1", s === cur ? "border-accent bg-accent/15 text-text" : visited.has(s) ? "border-line text-text-2" : "border-line/60 text-muted")}>{LABELS[s as MissionState]}</li>
        ))}
      </ol>
      <ul className="divide-y divide-line px-4 py-2 text-sm" data-testid="state-log">
        {history.map((h, i) => (
          <li key={i} className={cx("flex flex-wrap justify-between gap-2 py-1.5", h.tS > t && "opacity-45")}><span><span className="num mr-2 text-xs text-muted">t={h.tS.toFixed(0)}s</span>{LABELS[h.state]}</span><span className="text-xs text-muted">{h.reason}</span></li>
        ))}
      </ul>
    </Card>
  );
}

type WinInput = Omit<CommInputs, "tS">;
export function CommTimeline({ input, t, spanS, markers }: { input: WinInput; t: number; spanS: number; markers: { tS: number; label: string }[] }) {
  const rows = useMemo(() => {
    const step = Math.max(20, Math.round(spanS / 240));
    const pick = {
      "Direct Earth": (c: ReturnType<typeof import("@/lib/contingency/relay").evaluateComm>) => c.direct.effective === "available",
      "Lander → relay": (c: ReturnType<typeof import("@/lib/contingency/relay").evaluateComm>) => c.landerToRelay.state === "visible",
      "Relay → Earth": (c: ReturnType<typeof import("@/lib/contingency/relay").evaluateComm>) => c.relayToEarth.state === "visible",
      "Relay path (both)": (c: ReturnType<typeof import("@/lib/contingency/relay").evaluateComm>) => c.relay.available === "AVAILABLE",
    };
    return Object.entries(pick).map(([label, f]) => ({ label, wins: commWindows(input, 0, spanS, step, f) }));
  }, [input, spanS]);
  const W = 640, H = 26;
  const x = (s: number) => (s / spanS) * W;
  return (
    <Card>
      <CardHeader title="Communication windows" subtitle="Geometric visibility over time (terrain-aware). Bars show when each leg has line of sight — not whether a radio link would close." />
      <div className="overflow-x-auto px-4 py-3">
        <svg viewBox={`0 0 ${W + 130} ${rows.length * H + 24}`} className="min-w-[560px]" role="img" aria-label="Communication visibility windows over time" data-testid="comm-timeline">
          {rows.map((r, i) => (
            <g key={r.label} transform={`translate(130, ${i * H})`}>
              <text x={-8} y={16} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.8">{r.label}</text>
              <rect x={0} y={4} width={W} height={16} fill="currentColor" opacity="0.07" rx="2" />
              {r.wins.map((w, k) => <rect key={k} x={x(w.startS)} y={4} width={Math.max(2, x(w.endS) - x(w.startS))} height={16} fill={r.label.startsWith("Relay path") ? "#5aa0e6" : r.label === "Direct Earth" ? "#6fbf73" : "#7a9fc9"} rx="2" data-window={r.label} />)}
            </g>
          ))}
          {markers.map((m) => m.tS <= spanS && <g key={m.label} transform={`translate(${130 + x(m.tS)}, 0)`}><line y1={0} y2={rows.length * H} stroke="#e0584f" strokeDasharray="3 3" /><text y={rows.length * H + 12} fontSize="10" textAnchor="middle" fill="#e0584f">{m.label}</text></g>)}
          <line x1={130 + x(Math.min(t, spanS))} x2={130 + x(Math.min(t, spanS))} y1={0} y2={rows.length * H} stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <p className="mt-1 text-xs text-muted">Horizontal axis: 0–{(spanS / 60).toFixed(0)} min after descent start, lander at its simulated position. The vertical line is the current simulation time.</p>
      </div>
    </Card>
  );
}

export function SitesPanel({ ev, selected, onSelect }: { ev: SiteEvaluation | null; selected: string | null; onSelect: (id: string) => void }) {
  if (!ev) return <Card><CardHeader title="Alternative landing sites" /><p className="px-4 py-4 text-sm text-text-2">Not evaluated yet. Press <strong>Evaluate alternative landing sites</strong>, or trigger a deviation that makes the original target unreachable.</p></Card>;
  return (
    <Card data-testid="sites-panel">
      <CardHeader title="Alternative landing sites" subtitle={ev.note} />
      <div className={cx("mx-4 mt-3 rounded-[5px] border px-3 py-2 text-sm font-semibold", ev.recommended ? "border-ok/50 text-ok" : "border-bad/50 text-bad")} data-testid="sites-headline">{ev.headline}</div>
      <ul className="divide-y divide-line">
        {ev.assessments.map((a) => <SiteRow key={a.candidate.id} a={a} on={selected === a.candidate.id} onSelect={() => onSelect(a.candidate.id)} best={ev.recommended?.candidate.id === a.candidate.id} />)}
      </ul>
    </Card>
  );
}
function SiteRow({ a, on, onSelect, best }: { a: SiteAssessment; on: boolean; onSelect: () => void; best: boolean }) {
  const c = a.candidate;
  return (
    <li className={cx("px-4 py-3", on && "bg-panel-2")} data-testid={`site-${c.id}`} data-verdict={a.verdict}>
      <button type="button" onClick={onSelect} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="font-medium">{c.label}{best && <span className="ml-2 rounded bg-ok/15 px-1.5 text-xs text-ok">recommended</span>}</span>
        <span className={cx("text-xs font-semibold", a.verdict === "PASS" ? "text-ok" : a.verdict === "FAIL" ? "text-bad" : "text-warn")}>{a.verdict === "UNVERIFIED" ? "UNVERIFIED (unknown data)" : a.verdict}</span>
      </button>
      <div className="num mt-1 text-xs text-muted">{a.distanceFromTargetM.toFixed(0)} m from the original target{a.distanceFromTouchdownM != null ? ` · ${a.distanceFromTouchdownM.toFixed(0)} m from the predicted touchdown` : ""} · slope {c.slopeDeg == null ? "unknown" : `${c.slopeDeg.toFixed(1)}°`} · roughness {c.roughnessM == null ? "unknown" : `${c.roughnessM.toFixed(2)} m`} · cell {c.resolutionM ? `${c.resolutionM.toFixed(0)} m` : "unknown"}</div>
      {on && (
        <ul className="mt-2 space-y-1 text-sm">
          {a.checks.map((k) => <li key={k.id} className="flex gap-2"><span className={cx("w-16 shrink-0 text-xs font-semibold uppercase", k.status === "pass" ? "text-ok" : k.status === "fail" ? "text-bad" : "text-warn")}>{k.status}{k.mandatory ? "" : " (advisory)"}</span><span><strong className="font-medium">{k.label}.</strong> <span className="text-text-2">{k.detail}</span></span></li>)}
          {a.score != null && <li className="num text-xs text-muted">Score {a.score.toFixed(0)}/100 among passing sites: {a.breakdown.map((b) => `${b.name} ${b.points.toFixed(0)}/${b.max}`).join(" · ")}</li>}
        </ul>
      )}
    </li>
  );
}

export function RecoveryCard({ rec, label }: { rec: Recovery | null; label: string }) {
  if (!rec) return null;
  const v = (a: [number, number, number]) => `${Math.hypot(a[0], a[1]).toFixed(1)} m/s horizontal · ${a[2].toFixed(1)} m/s vertical`;
  return (
    <div className="space-y-1 rounded-[5px] border border-line px-3 py-2" data-testid="recovery-card" data-feasible={rec.feasible}>
      <div className={cx("text-sm font-semibold", rec.feasible ? "text-ok" : "text-bad")}>{rec.feasible ? "RECOVERY FEASIBLE" : "RECOVERY NOT FEASIBLE"} <span className="font-normal text-muted">— {label}</span></div>
      <dl>
        <Row k="Velocity before" v={v(rec.velocityBefore)} />
        <Row k="Velocity after" v={rec.feasible ? v(rec.velocityAfter) : "not achieved"} />
        <Row k="Required delta-v" v={`${rec.deltaVMs.toFixed(1)} m/s`} />
        <Row k="Propellant needed" v={`${rec.propellantKg.toFixed(1)} kg`} />
        <Row k="Propellant remaining" v={`${rec.remainingPropellantKg.toFixed(1)} kg`} />
        <Row k="Burn time / peak thrust" v={`${rec.burnTimeS.toFixed(0)} s / ${rec.peakThrustN.toFixed(0)} N`} />
        <Row k="Predicted touchdown" v={rec.touchdown ? `${rec.touchdown[0].toFixed(0)} E, ${rec.touchdown[1].toFixed(0)} N m from target` : "none"} />
      </dl>
      {!rec.feasible && <ul className="list-disc pl-5 text-sm text-text-2">{rec.violations.map((x, i) => <li key={i}>{x.message}</li>)}</ul>}
    </div>
  );
}

type Src = { id: string; name: string; organisation: string; url: string; role: string; usedFor: string; retrievedAtUtc: string; checks: { label: string; url: string; status: string; httpStatus: number | null; bytes: number | null; sha256: string | null; detail: string }[]; limitation: string };
const ROLE: Record<string, string> = { "data-integrated": "DATA INTEGRATED", "reference-only": "REFERENCE ONLY", partial: "PARTIAL" };
export function SourcesPanel() {
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; sources: Src[]; at?: string; cached?: boolean }>({ status: "loading", sources: [] });
  useEffect(() => {
    let live = true;
    fetch("/api/v1/contingency/sources").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((d) => live && setState({ status: "ok", sources: d.sources, at: d.cachedAtUtc, cached: d.cached })).catch(() => live && setState({ status: "error", sources: [] }));
    return () => { live = false; };
  }, []);
  const STATIC = [
    { name: "QuickMap (LROC / Arizona State University, NASA LRO data)", url: "https://quickmap.lroc.asu.edu/" },
    { name: "NASA Moon Trek", url: "https://trek.nasa.gov/moon/" },
    { name: "NASA JPL Horizons System", url: "https://ssd.jpl.nasa.gov/horizons/" },
    { name: "JPL Horizons API documentation", url: "https://ssd-api.jpl.nasa.gov/doc/horizons.html" },
    { name: "Canadian Space Agency: Moon exploration", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" },
  ];
  return (
    <Card id="sources" data-testid="sources-panel">
      <CardHeader title="Data sources & scientific provenance" subtitle="What each resource really contributes. Live checks run when this page loads and are cached for 30 minutes." />
      <ul className="flex flex-wrap gap-x-5 gap-y-1 px-4 pt-3 text-sm">{STATIC.map((s) => <li key={s.url}><a className="text-accent hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></li>)}</ul>
      <div className="space-y-3 px-4 py-3">
        {state.status === "loading" && <p className="text-sm text-muted">Checking the sources…</p>}
        {state.status === "error" && <p className="text-sm text-warn">The live source checks could not be completed right now. The descriptions below are static; no check result is shown or implied.</p>}
        {state.status === "ok" && state.sources.map((s) => (
          <div key={s.id} className="rounded-[5px] border border-line p-3" data-testid={`source-${s.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{s.name}</a><span className="rounded bg-panel-2 px-2 py-0.5 text-[11px] font-semibold tracking-wide">{ROLE[s.role] ?? s.role}</span></div>
            <div className="text-xs text-muted">{s.organisation}</div>
            <p className="mt-1 text-sm text-text-2"><strong className="font-medium">Used for:</strong> {s.usedFor}</p>
            <ul className="mt-1 space-y-0.5 text-xs">{s.checks.map((c, i) => <li key={i}><span className={c.status === "ok" ? "text-ok" : "text-bad"}>{c.status === "ok" ? "✓" : "✗"}</span> {c.label}{c.httpStatus ? ` · HTTP ${c.httpStatus}` : ""}{c.bytes ? ` · ${c.bytes.toLocaleString()} bytes` : ""}{c.sha256 ? ` · sha256 ${c.sha256.slice(0, 12)}…` : ""} — <span className="text-text-2">{c.detail}</span></li>)}</ul>
            <p className="mt-1 text-xs text-muted"><strong className="font-medium">Limitation:</strong> {s.limitation}</p>
            <p className="num text-[11px] text-muted">retrieved {s.retrievedAtUtc.replace("T", " ").slice(0, 19)} UTC</p>
          </div>
        ))}
        <p className="text-xs text-muted">Terrain heights, slopes and illumination come from NASA LRO LOLA products (PGDA) through MoonNav&rsquo;s science service; Sun/Earth directions from NAIF SPICE with the live JPL Horizons cross-check. Everything labelled “illustrative” (vehicle, relay orbit, RF values) is an assumption you can change, not a measurement. Full details: DATA_SOURCE_PROVENANCE.md.</p>
      </div>
    </Card>
  );
}

export function HistoryPanel() {
  return (
    <Card data-testid="history-panel">
      <CardHeader title="Why contingency planning matters" subtitle="Historical motivation only. The causes differ, and none is claimed here to be preventable by this simulator." />
      <ul className="space-y-3 px-4 py-3 text-sm text-text-2">
        <li><strong className="text-text">RMS Titanic (1912).</strong> The ship struck an iceberg and sank. Loss of communication was not the cause; it is cited only as an example of how little margin a single-plan voyage can leave.</li>
        <li><strong className="text-text">Chandrayaan-2 (2019).</strong> ISRO reported that Vikram&rsquo;s descent was as planned and normal down to 2.1 km altitude, after which communication with the ground stations was lost. The loss of communication is what was observed; it has not been established as the root technical cause.</li>
        <li><strong className="text-text">Luna 25 (2023).</strong> Roscosmos reported that the correction engine fired for 127 seconds instead of the planned 84 seconds, after which the spacecraft entered an unintended trajectory and crashed. An engine-burn duration error is a different failure from a communication loss.</li>
        <li>MoonNav&rsquo;s simulator explores the <em>kinds</em> of question these events raise: communication resilience, trajectory monitoring, propulsion limits and landing-site alternatives. It does not claim that any of these missions would have been saved.</li>
      </ul>
    </Card>
  );
}
