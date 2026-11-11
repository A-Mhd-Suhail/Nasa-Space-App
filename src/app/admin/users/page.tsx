import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { UsersClient } from "@/components/admin/UsersClient";
import { requirePageRole } from "@/lib/dal";

export const metadata: Metadata = { title: "Users & roles" };

export default async function AdminUsers() {
  const me = await requirePageRole("admin", "/admin/users");
  const users = await db().select().from(schema.user).orderBy(desc(schema.user.createdAt)).limit(500);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: "Administration", href: "/admin" }, { label: "Users & roles" }]} title="Users & roles" description="Role changes require a reason, are audited, and sign the user out so new privileges apply on their next sign-in. Curator and admin roles need MFA before their areas open." />
      <UsersClient meId={me.id} users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, mfa: !!u.twoFactorEnabled, verified: u.emailVerified, status: u.status, createdAt: u.createdAt.toISOString() }))} />
    </div>
  );
}
