"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, cx, fmtUtc, Notice } from "../ui";
import { api } from "./api";

export type HorizonsCheck = {
  status: "pass" | "warn" | "fail";
  maxSeparationDeg: number;
  checkedAtUtc: string;
  thresholdsDeg: { pass: number; warn: number };
  window: { startUtc: string; stopUtc: string; step: string };
  method: string;
  bodies: Record<"sun" | "earth", { maxSeparationDeg: number; meanSeparationDeg: number | null; rows: unknown[]; horizons: { apiVersion?: string; retrievedAtUtc?: string; cache?: string } }>;
};

const TONE = { pass: "text-ok border-ok/40 bg-ok-soft", warn: "text-warn border-warn/40 bg-panel-2", fail: "text-bad border-bad/40 bg-bad-soft" } as const;

/** Validation status line, reused in the mission report. */
export function ValidationSummary({ v }: { v: HorizonsCheck | null }) {
  if (!v) return <span className="text-muted">Not yet cross-checked live for this analysis (the science test suite cross-checks SPICE against stored JPL Horizons tables to &lt; 0.01°).</span>;
  return (
    <span>
      <span className={cx("mr-2 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold uppercase", TONE[v.status])}>{v.status}</span>
      max separation {v.maxSeparationDeg.toExponential(2)}° (Sun {v.bodies.sun.maxSeparationDeg.toExponential(1)}°, Earth {v.bodies.earth.maxSeparationDeg.toExponential(1)}°) over {v.bodies.sun.rows.length} epochs · Horizons API v{v.bodies.sun.horizons.apiVersion ?? "?"} · checked {fmtUtc(v.checkedAtUtc)}
    </span>
  );
}

export function HorizonsValidationCard({ analysisId, initial, canRun }: { analysisId: string; initial: HorizonsCheck | null; canRun: boolean }) {
  const [v, setV] = useState<HorizonsCheck | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><ShieldCheck size={16} className="text-accent" aria-hidden /> Independent validation · JPL Horizons</span>}
        subtitle="Re-computes the Sun and Earth directions for this site with NASA/JPL Horizons and measures the angular difference from MoonNav's SPICE engine. Pass < 0.01°."
        actions={canRun ? <Button s="sm" onClick={async () => { setBusy(true); setErr(null); try { setV((await api<{ validation: HorizonsCheck }>(`/api/v1/analyses/${analysisId}/validate`, { method: "POST" })).validation); } catch (e) { setErr((e as Error).message); } setBusy(false); }} disabled={busy} data-testid="run-horizons">{busy ? "Querying JPL Horizons…" : v ? "Re-check" : "Run live cross-check"}</Button> : null}
      />
      <div className="space-y-2 px-4 py-3 text-sm text-text-2" data-testid="horizons-status">
        <ValidationSummary v={v} />
        {v && <p className="adv-only text-xs text-muted">{v.method}. Window {fmtUtc(v.window.startUtc)} → {fmtUtc(v.window.stopUtc)}, step {v.window.step}.</p>}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Card>
  );
}
