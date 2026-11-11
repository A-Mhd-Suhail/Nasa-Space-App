import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, PageHeader } from "@/components/ui";
import { requirePageRole } from "@/lib/dal";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  await requirePageRole("admin", "/admin/audit");
  const { action } = await searchParams;
  const q = db().select({ a: schema.auditEvents, email: schema.user.email }).from(schema.auditEvents).leftJoin(schema.user, eq(schema.user.id, schema.auditEvents.actorUserId));
  const rows = await (action ? q.where(eq(schema.auditEvents.action, action)) : q).orderBy(desc(schema.auditEvents.createdAt)).limit(300);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: "Administration", href: "/admin" }, { label: "Audit log" }]} title="Audit log" description="Append-only: a database trigger rejects updates and deletes on audit events." />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{["Time (UTC)", "Actor", "Action", "Object", "Details"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ a, email }) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="num px-3 py-2 text-xs">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="px-3 py-2 text-xs">{email ?? a.actorUserId ?? "system"}</td>
                  <td className="px-3 py-2"><a className="hover:text-accent" href={`/admin/audit?action=${a.action}`}>{a.action}</a></td>
                  <td className="num px-3 py-2 text-xs">{a.objectType} {a.objectId?.slice(0, 20)}</td>
                  <td className="num max-w-sm break-words px-3 py-2 text-xs text-muted">{JSON.stringify(a.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
