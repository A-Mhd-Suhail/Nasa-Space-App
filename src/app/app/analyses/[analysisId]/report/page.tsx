import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { MissionReport } from "@/components/workspace/MissionReport";
import type { HorizonsCheck } from "@/components/workspace/HorizonsValidation";
import { requirePageUser } from "@/lib/dal";
import { APP_VERSION, getAnalysis, loadResult } from "@/lib/services";

export const metadata: Metadata = { title: "Mission report" };

export default async function ReportPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const u = await requirePageUser(`/app/analyses/${analysisId}/report`);
  const r = await getAnalysis(u, analysisId).catch(() => null);
  if (!r) return <div className="mx-auto max-w-3xl py-10 text-sm text-text-2">Analysis not found or you do not have access.</div>;
  if (r.analysis.status !== "completed") return <div className="mx-auto max-w-3xl py-10 text-sm text-text-2">The mission report is available once the analysis has completed (current status: {r.analysis.status}).</div>;
  const result = await loadResult(r.analysis);
  const [site] = r.scenario.siteId ? await db().select().from(schema.sites).where(eq(schema.sites.id, r.scenario.siteId)).limit(1) : [];
  const [project] = await db().select().from(schema.projects).where(eq(schema.projects.id, r.scenario.projectId)).limit(1);
  return (
    <MissionReport
      analysisId={analysisId}
      result={result}
      scenario={{ name: r.scenario.name, version: r.scenario.version, project: project?.name ?? "", siteName: site?.name ?? null, siteNote: site?.note ?? null }}
      validation={(r.analysis.validation as HorizonsCheck | null) ?? null}
      resultSha256={r.analysis.resultSha256}
      completedAt={r.analysis.completedAt?.toISOString() ?? null}
      generatedAtUtc={new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}
      appVersion={APP_VERSION}
    />
  );
}
