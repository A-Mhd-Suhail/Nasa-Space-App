"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { AnalysisSummary } from "@/lib/analysis-types";
import { Button, Card, CardHeader, DataTag, fmtHours, fmtUtc, LinkButton, Notice, PageHeader, Stat, StatusBadge } from "../ui";
import { api } from "./api";
import { StaleBanner } from "./StaleBanner";
import { AnnotationsPanel } from "./AnnotationsPanel";
import { type HorizonsCheck, HorizonsValidationCard } from "./HorizonsValidation";

type JobResp = { job: { id: string; status: string; attempts: number; maxAttempts: number; progress: number | null; stage: string | null; error: { code: string; message: string } | null; createdAt: string; startedAt: string | null; finishedAt: string | null; runAfter: string; log: { at: string; msg: string }[] }; worker: { liveWorkers: number; onDemand?: boolean; lastSeenAt: string | null } };
type AnaResp = { analysis: { id: string; status: string; quality: string | null; summary: AnalysisSummary | null; completedAt: string | null; resultSha256: string | null; validation: HorizonsCheck | null } };

export function AnalysisStatusClient({ analysisId, jobId, scenario, canAnnotate, me }: { analysisId: string; jobId: string | null; scenario: { id: string; name: string; version: number; projectId: string; siteId: string | null }; canAnnotate?: boolean; me?: string }) {
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const job = useQuery<JobResp>({
    queryKey: ["job", jobId],
    queryFn: () => api(`/api/v1/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ["completed", "failed", "cancelled"].includes(q.state.data.job.status) ? false : 1500),
  });
  const done = job.data?.job.status === "completed";
  const ana = useQuery<AnaResp>({ queryKey: ["analysis", analysisId, done], queryFn: () => api(`/api/v1/analyses/${analysisId}`) });
  const j = job.data?.job;
  const s = ana.data?.analysis.summary;
  const status = j?.status ?? ana.data?.analysis.status ?? "loading";
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader crumbs={[{ label: "Projects", href: "/app/projects" }, { label: "Project", href: `/app/projects/${scenario.projectId}` }, { label: `${scenario.name} v${scenario.version}` }]} title={<span className="flex items-center gap-3">{scenario.name} <span className="text-muted">v{scenario.version}</span> <StatusBadge status={status} /></span>} description={`Analysis ${analysisId}`}
        actions={["queued", "running"].includes(status) && jobId ? <Button variant="danger" s="sm" onClick={async () => { try { await api(`/api/v1/jobs/${jobId}`, { method: "DELETE" }); job.refetch(); } catch (e) { setCancelErr((e as Error).message); } }}>Cancel analysis</Button> : null} />
      {cancelErr && <Notice tone="bad">{cancelErr}</Notice>}
      {!done && j && (
        <Card>
          <CardHeader title="Job progress" subtitle={`Attempt ${j.attempts}/${j.maxAttempts}${j.stage ? ` · ${j.stage}` : ""}`} />
          <div className="space-y-3 p-4">
            <JobProgress status={status} stage={j.stage} progress={j.progress} log={j.log} />
            {status === "queued" && job.data!.worker.liveWorkers === 0 && !job.data!.worker.onDemand && <Notice tone="warn" title="Waiting for a worker">No analysis worker has polled in the last 30 seconds (last seen {job.data!.worker.lastSeenAt ? fmtUtc(job.data!.worker.lastSeenAt) : "never"}). The job stays queued and will run as soon as a worker starts.</Notice>}
            {status === "queued" && j.attempts > 0 && <Notice>Retrying: next attempt not before {fmtUtc(j.runAfter)}.</Notice>}
            {status === "failed" && <Notice tone="bad" title="Analysis failed">{j.error?.message ?? "Unknown error"} ({j.error?.code}). {j.error?.code === "invalid_input" ? "Create a new scenario version with corrected inputs." : "An administrator can retry it from Admin → Jobs."}</Notice>}
            {status === "cancelled" && <Notice>This analysis was cancelled.</Notice>}
            <details><summary className="cursor-pointer text-xs text-muted">Job log</summary><ul className="num mt-2 space-y-0.5 text-xs text-text-2">{j.log.map((l, i) => <li key={i}>{l.at.slice(0, 19).replace("T", " ")} · {l.msg}</li>)}</ul></details>
          </div>
        </Card>
      )}
      {done && s && (
        <>
          <StaleBanner analysisId={analysisId} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Direct sunlight" value={fmtHours(s.sun.totalVisibleSeconds)} unit="h" kind="calculated" accent="sun" hint={`${(s.sun.fractionVisible * 100).toFixed(1)}% · ${s.sun.intervalCount} intervals`} />
            <Stat label="Earth in line of sight" value={fmtHours(s.earth.totalVisibleSeconds)} unit="h" kind="calculated" accent="earth" hint={`${(s.earth.fractionVisible * 100).toFixed(1)}%`} />
            <Stat label="Geometric DTE windows" value={fmtHours(s.earth.dte.totalVisibleSeconds)} unit="h" kind="calculated" accent="earth" hint={`mask ${s.earth.antennaMinimumElevationDeg ?? "none"}`} />
            <Stat label="Panel energy" value={s.power.energyWh == null ? "—" : s.power.energyWh.toFixed(0)} unit={s.power.energyWh == null ? undefined : "Wh"} kind={s.power.energyWh == null ? "unavailable" : "modelled"} hint={s.power.energyWh == null ? "no panel assumptions" : "idealized"} />
          </div>
          <Card>
            <CardHeader title="Open the analysis" tag={<DataTag kind="cached" />} subtitle={`Quality ${s.quality} · ${s.provenance.methodVersion} · completed ${fmtUtc(ana.data?.analysis.completedAt)}`} />
            <div className="flex flex-wrap gap-2 p-4">
              <LinkButton variant="primary" href={`/app/analysis/sun?analysisId=${analysisId}`}>Sun & Power</LinkButton>
              <LinkButton href={`/app/analyses/${analysisId}/report`}>Mission report</LinkButton>
              <LinkButton href={`/app/analysis/earth?analysisId=${analysisId}`}>Earth & DTE</LinkButton>
              <LinkButton href={`/app/sites/${scenario.siteId ?? "custom"}?analysisId=${analysisId}`}>Site detail / 3D</LinkButton>
              <LinkButton href={`/app/reports?analysisId=${analysisId}`}>Export report</LinkButton>
              <LinkButton href={`/app/compare?ids=${analysisId}`}>Compare…</LinkButton>
            </div>
            {s.warnings.length > 0 && <ul className="border-t border-line px-4 py-3 text-xs text-warn">{s.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
            <p className="num border-t border-line px-4 py-2 text-xs text-muted">Result SHA-256 {ana.data?.analysis.resultSha256}</p>
          </Card>
          <HorizonsValidationCard analysisId={analysisId} initial={ana.data?.analysis.validation ?? null} canRun />
        </>
      )}
      <AnnotationsPanel analysisId={analysisId} canAnnotate={!!canAnnotate} me={me ?? ""} />
    </div>
  );
}

/** Processing stages reported by the worker (science/moonnav_science/analysis.py STAGES + worker). */
export const JOB_STAGES: [string, string][] = [
  ["leased", "Leased by a worker"],
  ["initializing", "Initializing"],
  ["validating_input", "Validating inputs"],
  ["loading_spice_kernels", "Loading SPICE kernels"],
  ["loading_dem", "Loading LOLA DEM"],
  ["computing_terrain_horizon", "Computing terrain horizon"],
  ["sampling_sun_and_earth", "Sampling Sun and Earth geometry"],
  ["extracting_sun_intervals", "Sun visibility intervals"],
  ["extracting_earth_and_dte_windows", "Earth visibility and DTE windows"],
  ["integrating_solar_power", "Solar power"],
  ["assembling_result", "Quality and provenance"],
  ["uploading_result", "Persisting result"],
  ["completed", "Completed"],
];

function JobProgress({ status, stage, progress, log }: { status: string; stage: string | null; progress: number | null; log: { at: string; msg: string }[] }) {
  const reached = new Set(log.map((l) => l.msg.replace(/^stage /, "")).concat(stage ?? []));
  if (log.some((l) => l.msg.startsWith("leased"))) reached.add("leased");
  const current = JOB_STAGES.findIndex(([k]) => k === stage);
  const pct = progress == null ? null : Math.round(progress * 100);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span>{status === "queued" ? "Waiting in queue" : current >= 0 ? JOB_STAGES[current][1] : stage ?? status}</span>
          <span className="num text-xs text-muted">{pct == null ? "no progress reported yet" : `${pct}% reported by worker`}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>
      <ol className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2" aria-label="Job stages">
        {JOB_STAGES.map(([k, label], i) => {
          const done = reached.has(k) && (i < current || status === "completed");
          const active = i === current && status === "running";
          return (
            <li key={k} className={`flex items-center gap-2 ${done ? "text-text-2" : active ? "text-text" : "text-muted"}`}>
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${done ? "bg-ok" : active ? "bg-accent" : "border border-line-2"}`} />
              {label}
              <span className="sr-only">{done ? " (done)" : active ? " (in progress)" : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
