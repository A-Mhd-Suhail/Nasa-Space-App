import type { Metadata } from "next";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { requirePageRole } from "@/lib/dal";
import { workerStatus } from "@/lib/jobs";
import { scienceHealth } from "@/lib/science";

export const metadata: Metadata = { title: "Operations" };

export default async function AdminHome() {
  await requirePageRole("curator", "/admin");
  const d = db();
  const [jobs, products, users, audits, worker, sci] = await Promise.all([
    d.select({ status: schema.analysisJobs.status, n: sql<number>`count(*)::int` }).from(schema.analysisJobs).groupBy(schema.analysisJobs.status),
    d.select({ status: schema.dataProducts.status, n: sql<number>`count(*)::int` }).from(schema.dataProducts).groupBy(schema.dataProducts.status),
    d.select({ n: sql<number>`count(*)::int` }).from(schema.user),
    d.select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.createdAt)).limit(8),
    workerStatus(),
    scienceHealth(),
  ]);
  const k = (sci as { kernels?: { status: string; manifestId?: string; coverageUtc?: string[] } }).kernels;
  const t = (sci as { terrain?: { status: string; products?: string[] } }).terrain;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="System and data overview" />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader title="Science service" actions={<StatusBadge status={String(sci.status)} />} /><ul className="space-y-1 px-4 py-3 text-sm text-text-2"><li>Kernels: {k?.status ?? "unknown"} {k?.manifestId}</li><li>Coverage: {k?.coverageUtc?.join(" → ") ?? "—"}</li><li>Terrain: {t?.status ?? "unknown"} {t?.products?.join(", ")}</li></ul></Card>
        <Card><CardHeader title="Workers & jobs" actions={<StatusBadge status={worker.liveWorkers > 0 ? "ok" : "unavailable"} />} /><ul className="space-y-1 px-4 py-3 text-sm text-text-2"><li>Live workers: {worker.liveWorkers}</li><li>Last seen: {worker.lastSeenAt?.replace("T", " ").slice(0, 19) ?? "never"}</li>{jobs.map((j) => <li key={j.status} className="capitalize">{j.status}: {j.n}</li>)}</ul></Card>
        <Card><CardHeader title="Registry" /><ul className="space-y-1 px-4 py-3 text-sm text-text-2">{products.map((p) => <li key={p.status} className="capitalize">{p.status} products: {p.n}</li>)}<li>Users: {users[0]?.n ?? 0}</li></ul></Card>
      </div>
      <Card>
        <CardHeader title="Recent audit events" />
        <ul className="divide-y divide-line text-sm">{audits.map((a) => <li key={a.id} className="num flex flex-wrap justify-between gap-2 px-4 py-2"><span>{a.action} · {a.objectType} {a.objectId?.slice(0, 18)}</span><span className="text-xs text-muted">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</span></li>)}</ul>
      </Card>
    </div>
  );
}
