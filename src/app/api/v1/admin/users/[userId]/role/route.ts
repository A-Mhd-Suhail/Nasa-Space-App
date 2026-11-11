import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, requireApiRole } from "@/lib/dal";
import { ApiError, clientIp, json, notFound, readJson, route } from "@/lib/http";

const body = z.object({ role: z.enum(["user", "analyst", "curator", "admin"]), reason: z.string().trim().min(3).max(300) });

/** Admin-only (MFA enforced by requireApiRole). Curators cannot grant roles. */
export const PATCH = route<{ params: Promise<{ userId: string }> }>(async (req, { params }, requestId) => {
  const admin = await requireApiRole("admin");
  const { userId } = await params;
  const { role, reason } = body.parse(await readJson(req));
  if (userId === admin.id) throw new ApiError(409, "self_change", "Administrators cannot change their own role");
  const [target] = await db().select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!target) throw notFound("User");
  await db().update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  await db().delete(schema.session).where(eq(schema.session.userId, userId)); // force re-auth with new privileges
  await audit({ actorUserId: admin.id, action: "user.role_change", objectType: "user", objectId: userId, metadata: { from: target.role, to: role, reason }, ip: clientIp(req), requestId });
  return json({ ok: true, role });
});
