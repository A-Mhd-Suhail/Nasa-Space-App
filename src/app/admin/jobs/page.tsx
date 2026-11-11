import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { JobsClient } from "@/components/admin/JobsClient";
import { hasRole, requirePageRole } from "@/lib/dal";

export const metadata: Metadata = { title: "Jobs" };

export default async function AdminJobs({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await requirePageRole("curator", "/admin/jobs");
  const { status } = await searchParams;
  const q = db().select({ j: schema.analysisJobs, s: schema.scenarios.name }).from(schema.analysisJobs).innerJoin(schema.analyses, eq(schema.analyses.id, schema.analysisJobs.analysisId)).innerJoin(schema.scenarios, eq(schema.scenarios.id, schema.analyses.scenarioId));
  const rows = await (status ? q.where(eq(schema.analysisJobs.status, status)) : q).orderBy(desc(schema.analysisJobs.createdAt)).limit(100);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: "Administration", href: "/admin" }, { label: "Jobs" }]} title="Analysis jobs" description="Queued, running, failed, retried and completed jobs with logs. Retrying requires the admin role." />
      <JobsClient canRetry={hasRole(u, "admin")} status={status ?? ""} jobs={rows.map(({ j, s }) => ({ id: j.id, scenario: s, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, workerId: j.workerId, error: j.error, createdAt: j.createdAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null, log: j.log.slice(-8) }))} />
    </div>
  );
}
