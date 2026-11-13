import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { WorkspacesAdminClient } from "@/components/admin/WorkspacesAdminClient";
import { requirePageRole } from "@/lib/dal";

export const metadata: Metadata = { title: "Workspaces" };

export default async function AdminWorkspaces() {
  await requirePageRole("admin", "/admin/workspaces");
  const d = db();
  const rows = await d
    .select({
      id: schema.workspaces.id, name: schema.workspaces.name, personal: schema.workspaces.personal, createdAt: schema.workspaces.createdAt,
      ownerEmail: schema.user.email,
      members: sql<number>`(select count(*)::int from workspace_members m where m.workspace_id = ${schema.workspaces.id})`,
      projects: sql<number>`(select count(*)::int from projects p where p.workspace_id = ${schema.workspaces.id})`,
      scenarios: sql<number>`(select count(*)::int from scenarios s where s.workspace_id = ${schema.workspaces.id})`,
      analyses: sql<number>`(select count(*)::int from analyses a where a.workspace_id = ${schema.workspaces.id})`,
      activeJobs: sql<number>`(select count(*)::int from analysis_jobs j where j.workspace_id = ${schema.workspaces.id} and j.status in ('queued','running'))`,
    })
    .from(schema.workspaces)
    .leftJoin(schema.user, eq(schema.user.id, schema.workspaces.ownerUserId))
    .orderBy(desc(schema.workspaces.createdAt))
    .limit(500);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: "Administration", href: "/admin" }, { label: "Workspaces" }]} title="Workspaces" description="Shared workspaces can be deleted here when their owner cannot or should not. Deletion needs the exact workspace name and a reason, is refused while analyses are running, and is audited. Personal field books cannot be deleted from here; they go with the account." />
      <WorkspacesAdminClient rows={rows.map((r) => ({ ...r, ownerEmail: r.ownerEmail ?? "—", createdAt: r.createdAt.toISOString() }))} />
    </div>
  );
}
