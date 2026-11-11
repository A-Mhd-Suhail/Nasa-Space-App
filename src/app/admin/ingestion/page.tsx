import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { IngestionClient, type IngestionRun } from "@/components/admin/IngestionClient";
import { requirePageRole } from "@/lib/dal";

export const metadata: Metadata = { title: "Ingestion runs" };
export const dynamic = "force-dynamic";

export default async function AdminIngestionPage() {
  await requirePageRole("curator", "/admin/ingestion");
  const rows = await db()
    .select({
      id: schema.dataIngestionRuns.id,
      dataProductId: schema.dataIngestionRuns.dataProductId,
      status: schema.dataIngestionRuns.status,
      steps: schema.dataIngestionRuns.steps,
      error: schema.dataIngestionRuns.error,
      createdBy: schema.dataIngestionRuns.createdBy,
      createdAt: schema.dataIngestionRuns.createdAt,
      finishedAt: schema.dataIngestionRuns.finishedAt,
      productId: schema.dataProducts.productId,
      release: schema.dataProducts.release,
      kind: schema.dataProducts.kind,
      coverage: schema.dataProducts.coverage,
      sha256: schema.dataProducts.sha256,
    })
    .from(schema.dataIngestionRuns)
    .innerJoin(schema.dataProducts, eq(schema.dataProducts.id, schema.dataIngestionRuns.dataProductId))
    .orderBy(desc(schema.dataIngestionRuns.createdAt))
    .limit(100);
  const runs: IngestionRun[] = rows.map((r) => ({
    id: r.id,
    dataProductId: r.dataProductId,
    status: r.status,
    steps: r.steps as { step: string; ok: boolean; detail: string; at: string }[],
    error: r.error,
    productId: r.productId,
    release: r.release,
    kind: r.kind,
    coverage: r.coverage,
    sha256: r.sha256,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin" }, { label: "Ingestion" }]}
        title="Data ingestion pipeline"
        description="Every web-triggered ingestion run is recorded here with its full stage log: discovered → fetching label → label parsed → downloading → downloaded → checksum verified → validated. Products then move to the curator approval workflow on /admin/data."
      />
      <IngestionClient runs={runs} />
    </div>
  );
}
