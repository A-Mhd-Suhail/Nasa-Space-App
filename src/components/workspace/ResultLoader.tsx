"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { AnalysisResult } from "@/lib/analysis-types";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button, Notice } from "../ui";
import { api } from "./api";
import { StaleBanner } from "./StaleBanner";

const SunView = dynamic(() => import("../analysis/AnalysisViews").then((m) => m.SunView), { ssr: false });
const EarthView = dynamic(() => import("../analysis/AnalysisViews").then((m) => m.EarthView), { ssr: false });

export function useAnalysisResult(analysisId: string | null) {
  return useQuery<{ result: AnalysisResult; downsampleStride: number; totalPoints: number }>({
    queryKey: ["result", analysisId],
    queryFn: () => api(`/api/v1/analyses/${analysisId}/timeseries?full=1&maxPoints=4000`),
    enabled: !!analysisId,
    staleTime: Infinity,
  });
}

export function ExportBar({ analysisId }: { analysisId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (format: "pdf" | "csv" | "json") => {
    setBusy(format);
    setErr(null);
    try {
      const { report } = await api<{ report: { id: string } }>("/api/v1/reports", { method: "POST", body: { analysisId, format } });
      const { url } = await api<{ url: string }>("/api/v1/storage/presign-download", { method: "POST", body: { reportId: report.id } });
      window.location.assign(url);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">Export</span>
      {(["pdf", "csv", "json"] as const).map((f) => (
        <Button key={f} s="sm" onClick={() => run(f)} disabled={!!busy}>
          <Download size={14} /> {busy === f ? "Preparing…" : f.toUpperCase()}
        </Button>
      ))}
      {err && <span role="alert" className="text-xs text-bad">{err}</span>}
    </div>
  );
}

export function ResultView({ analysisId, view }: { analysisId: string; view: "sun" | "earth" }) {
  const q = useAnalysisResult(analysisId);
  if (q.isLoading) return <div className="h-72 animate-pulse rounded-lg border border-line bg-panel-2" />;
  if (q.error) return <Notice tone="bad">{(q.error as Error).message}</Notice>;
  const d = q.data!;
  return (
    <div className="space-y-3">
      <StaleBanner analysisId={analysisId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{d.downsampleStride > 1 ? `Charts show every ${d.downsampleStride}th of ${d.totalPoints.toLocaleString()} samples; interval statistics and exports use the full series.` : `${d.totalPoints.toLocaleString()} samples.`}</p>
        <ExportBar analysisId={analysisId} />
      </div>
      {view === "sun" ? <SunView r={d.result} /> : <EarthView r={d.result} />}
    </div>
  );
}
