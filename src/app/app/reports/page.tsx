import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ReportsClient } from "@/components/workspace/ReportsClient";
import { requirePageUser } from "@/lib/dal";
import { listReports, recentAnalyses } from "@/lib/services";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ analysisId?: string }> }) {
  const u = await requirePageUser("/app/reports");
  const { analysisId } = await searchParams;
  const [reports, done] = await Promise.all([listReports(u), recentAnalyses(u, 200, "completed")]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reports & exports" description="PDF mission briefs, CSV time series and machine-readable JSON — all generated from the same stored analysis, with inputs, versions, coverage flags and limitations. Downloads use short-lived signed links." />
      <ReportsClient
        analyses={done.map(({ a, s }) => ({ id: a.id, label: `${s.name} v${s.version} · ${s.startUtc.toISOString().slice(0, 10)}` }))}
        reports={reports.map(({ r, s }) => ({ id: r.id, format: r.format, version: r.version, bytes: r.bytes, sha256: r.sha256, createdAt: r.createdAt.toISOString(), analysisId: r.analysisId, scenario: s.name }))}
        initialAnalysis={analysisId ?? null}
      />
    </div>
  );
}
