import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, CardHeader, DataTag, fmtHours, LinkButton, Notice, PageHeader } from "@/components/ui";
import type { AnalysisSummary } from "@/lib/analysis-types";
import { presignDownload } from "@/lib/storage";
import { reportFilename, resolveShareToken } from "@/lib/services";

export const metadata: Metadata = { title: "Shared report", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await resolveShareToken(token);
  if (!res) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Notice tone="warn" title="This link is invalid, expired or revoked">Ask the report owner for a new link.</Notice>
      </div>
    );
  }
  const { report, share } = res;
  const [a] = await db().select().from(schema.analyses).where(eq(schema.analyses.id, report.analysisId)).limit(1);
  const [s] = await db().select().from(schema.scenarios).where(eq(schema.scenarios.id, a.scenarioId)).limit(1);
  const sum = a.summary as unknown as AnalysisSummary;
  const url = await presignDownload(report.storageKey, reportFilename(report), 300);
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <PageHeader title={`${s.name} (v${s.version})`} description={`${report.format.toUpperCase()} report version ${report.version} · link expires ${share.expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC`} actions={<LinkButton href={url} variant="primary">Download {report.format.toUpperCase()}</LinkButton>} />
      <Card>
        <CardHeader title="Summary" tag={<DataTag kind="cached" />} subtitle={`Analysis ${a.id} · ${sum.provenance.methodVersion}`} />
        <dl className="num grid gap-3 px-4 py-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Site</dt><dd>{Math.abs(sum.site.latitudeDeg).toFixed(4)}°S {sum.site.longitudeEastDeg.toFixed(4)}°E, {sum.site.heightM.toFixed(0)} m</dd></div>
          <div><dt className="text-muted">Interval (UTC)</dt><dd>{sum.timeRange.startUtc} → {sum.timeRange.endUtc}</dd></div>
          <div><dt className="text-muted">Direct sunlight</dt><dd className="text-sun">{fmtHours(sum.sun.totalVisibleSeconds)} h ({(sum.sun.fractionVisible * 100).toFixed(1)}%)</dd></div>
          <div><dt className="text-muted">Geometric DTE</dt><dd className="text-earth">{fmtHours(sum.earth.dte.totalVisibleSeconds)} h ({(sum.earth.dte.fractionVisible * 100).toFixed(1)}%)</dd></div>
          <div><dt className="text-muted">Quality</dt><dd className="capitalize">{sum.quality}</dd></div>
          <div><dt className="text-muted">Report SHA-256</dt><dd className="truncate text-xs">{report.sha256}</dd></div>
        </dl>
      </Card>
      <p className="text-xs text-muted">MoonNav is an independent research/education prototype; geometric DTE is line of sight only, not RF link availability.</p>
    </div>
  );
}
