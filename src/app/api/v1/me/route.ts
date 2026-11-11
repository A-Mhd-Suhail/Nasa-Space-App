import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, personalWorkspaceId, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  preferredMode: z.enum(["planning", "learn", "explore"]).optional(),
  displayTimezone: z.string().max(64).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone").optional(),
  completeOnboarding: z.boolean().optional(),
});

export const GET = route(async () => {
  const u = await requireApiUser();
  return json({ user: u });
});

export const PATCH = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  const p = patch.parse(await readJson(req));
  const set: Partial<typeof schema.user.$inferInsert> = { updatedAt: new Date() };
  if (p.name) set.name = p.name;
  if (p.preferredMode) set.preferredMode = p.preferredMode;
  if (p.displayTimezone) set.displayTimezone = p.displayTimezone;
  if (p.completeOnboarding) {
    set.onboardedAt = new Date();
    set.termsAcceptedAt = new Date();
    await personalWorkspaceId(u);
  }
  await db().update(schema.user).set(set).where(eq(schema.user.id, u.id));
  await audit({ actorUserId: u.id, action: "user.update_profile", objectType: "user", objectId: u.id, metadata: { fields: Object.keys(p) }, requestId });
  return json({ ok: true });
});

/** Account deletion: anonymises the user, keeps immutable public source provenance and audit history. */
export const DELETE = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  const b = z.object({ confirm: z.literal("DELETE") }).parse(await readJson(req));
  void b;
  await db().transaction(async (tx) => {
    await tx.delete(schema.workspaces).where(eq(schema.workspaces.ownerUserId, u.id));
    await tx.delete(schema.session).where(eq(schema.session.userId, u.id));
    await tx.delete(schema.account).where(eq(schema.account.userId, u.id));
    await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, u.id));
    await tx.update(schema.user).set({ status: "deleted", email: `deleted+${u.id}@moonnav.invalid`, name: "Deleted user", image: null, updatedAt: new Date() }).where(eq(schema.user.id, u.id));
  });
  await audit({ actorUserId: u.id, action: "user.delete", objectType: "user", objectId: u.id, requestId });
  return json({ ok: true });
});
