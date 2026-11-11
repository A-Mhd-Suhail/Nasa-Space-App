import type { Metadata } from "next";
import { AnalysisStatusClient } from "@/components/workspace/AnalysisStatusClient";
import { hasRole, requirePageUser } from "@/lib/dal";
import { getAnalysis } from "@/lib/services";

export const metadata: Metadata = { title: "Analysis" };

export default async function AnalysisPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const u = await requirePageUser(`/app/analyses/${analysisId}`);
  const r = await getAnalysis(u, analysisId).catch(() => null);
  if (!r) return <div className="mx-auto max-w-3xl py-10 text-sm text-text-2">Analysis not found or you do not have access.</div>;
  return <AnalysisStatusClient analysisId={analysisId} jobId={r.job?.id ?? null} scenario={{ id: r.scenario.id, name: r.scenario.name, version: r.scenario.version, projectId: r.scenario.projectId, siteId: r.scenario.siteId }} canAnnotate={hasRole(u, "analyst")} me={u.id} />;
}
