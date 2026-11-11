import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { DataProductsClient } from "@/components/admin/DataProductsClient";
import { requirePageRole } from "@/lib/dal";

export const metadata: Metadata = { title: "Data products" };

export default async function AdminData() {
  await requirePageRole("curator", "/admin/data");
  const products = await db().select().from(schema.dataProducts);
  const runs = await db().select().from(schema.dataIngestionRuns).orderBy(desc(schema.dataIngestionRuns.createdAt)).limit(30);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: "Administration", href: "/admin" }, { label: "Data products" }]} title="Data-product registry" description="Products move discovered → downloaded → validated → approved, or to failed / blocked / deprecated. Approved versions are immutable; a new release is registered as a new product version." />
      <DataProductsClient
        products={products.map((p) => ({ id: p.id, kind: p.kind, productId: p.productId, release: p.release, status: p.status, statusReason: p.statusReason, sha256: p.sha256, coverage: p.coverage, provider: p.provider, approvedAt: p.approvedAt?.toISOString() ?? null, sourceUrl: p.sourceUrl }))}
        runs={runs.map((r) => ({ id: r.id, dataProductId: r.dataProductId, status: r.status, steps: r.steps, createdAt: r.createdAt.toISOString() }))}
      />
    </div>
  );
}
