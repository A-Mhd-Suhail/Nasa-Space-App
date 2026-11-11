import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertWorkspaceAccess, audit, listWorkspaces, type SessionUser, type WsRole } from "./dal";
import { ApiError, notFound } from "./http";

export async function createWorkspace(u: SessionUser, name: string, requestId?: string) {
  const id = `ws_${randomUUID()}`;
  await db().transaction(async (tx) => {
    await tx.insert(schema.workspaces).values({ id, name, ownerUserId: u.id, personal: false });
    await tx.insert(schema.workspaceMembers).values({ workspaceId: id, userId: u.id, role: "owner" });
  });
  await audit({ actorUserId: u.id, action: "workspace.create", objectType: "workspace", objectId: id, metadata: { name }, requestId });
  return (await listWorkspaces(u)).find((w) => w.id === id)!;
}

export async function renameWorkspace(u: SessionUser, id: string, name: string, requestId?: string) {
  await assertWorkspaceAccess(u, id, "owner");
  await db().update(schema.workspaces).set({ name, updatedAt: new Date() }).where(eq(schema.workspaces.id, id));
  await audit({ actorUserId: u.id, action: "workspace.rename", objectType: "workspace", objectId: id, metadata: { name }, requestId });
}

export async function deleteWorkspace(u: SessionUser, id: string, confirmName: string, requestId?: string) {
  await assertWorkspaceAccess(u, id, "owner");
  const [w] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).limit(1);
  if (w.personal) throw new ApiError(409, "personal_workspace", "Your personal field book cannot be deleted (delete the account instead)");
  if (confirmName.trim() !== w.name.trim()) throw new ApiError(422, "invalid_input", "Type the workspace name to confirm", [{ field: "confirmName", message: "Name does not match" }]);
  await db().delete(schema.workspaces).where(eq(schema.workspaces.id, id));
  await audit({ actorUserId: u.id, action: "workspace.delete", objectType: "workspace", objectId: id, metadata: { name: w.name }, requestId });
}

export async function listMembers(u: SessionUser, id: string) {
  await assertWorkspaceAccess(u, id);
  return db()
    .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.workspaceMembers.role, since: schema.workspaceMembers.createdAt })
    .from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, id))
    .orderBy(sql`case ${schema.workspaceMembers.role} when 'owner' then 0 when 'editor' then 1 else 2 end, ${schema.user.name}`);
}

/** Add an existing, verified MoonNav user by email. Unknown addresses get the same response (no account enumeration). */
export async function addMember(u: SessionUser, id: string, email: string, role: Exclude<WsRole, "owner">, requestId?: string) {
  await assertWorkspaceAccess(u, id, "owner");
  const [w] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).limit(1);
  if (w.personal) throw new ApiError(409, "personal_workspace", "Create a shared workspace to collaborate; personal field books are private");
  const [target] = await db().select().from(schema.user).where(and(eq(schema.user.email, email.toLowerCase().trim()), eq(schema.user.status, "active"), eq(schema.user.emailVerified, true))).limit(1);
  if (target) {
    await db().insert(schema.workspaceMembers).values({ workspaceId: id, userId: target.id, role }).onConflictDoNothing();
    await audit({ actorUserId: u.id, action: "workspace.member_add", objectType: "workspace", objectId: id, metadata: { member: target.id, role }, requestId });
  }
  return { ok: true, message: "If that address belongs to a verified MoonNav account, it now has access." };
}

export async function setMemberRole(u: SessionUser, id: string, memberId: string, role: Exclude<WsRole, "owner">, requestId?: string) {
  await assertWorkspaceAccess(u, id, "owner");
  if (memberId === u.id) throw new ApiError(409, "self_change", "Owners cannot change their own role");
  const r = await db().update(schema.workspaceMembers).set({ role }).where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, memberId))).returning();
  if (!r.length) throw notFound("Member");
  await audit({ actorUserId: u.id, action: "workspace.member_role", objectType: "workspace", objectId: id, metadata: { member: memberId, role }, requestId });
}

export async function removeMember(u: SessionUser, id: string, memberId: string, requestId?: string) {
  // Owners remove others; any member may leave.
  if (memberId !== u.id) await assertWorkspaceAccess(u, id, "owner");
  else await assertWorkspaceAccess(u, id);
  const [w] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).limit(1);
  if (w.ownerUserId === memberId) throw new ApiError(409, "owner_required", "The workspace owner cannot be removed");
  await db().delete(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, memberId)));
  await audit({ actorUserId: u.id, action: "workspace.member_remove", objectType: "workspace", objectId: id, metadata: { member: memberId }, requestId });
}
