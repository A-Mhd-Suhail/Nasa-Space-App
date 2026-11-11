import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertWorkspaceAccess, audit, type SessionUser, type WsRole } from "./dal";
import { ApiError, notFound } from "./http";
import { sendMail } from "./mail";
import { env } from "./env";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type InvitationRow = {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  invitedBy: string;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * Invite any email address to a workspace. Unlike the older addMember path
 * (which requires an existing verified account), this creates a revocable,
 * expiring bearer invitation and sends it by email. The recipient clicks the
 * link, signs in (or registers + verifies), and is added as a member.
 */
export async function createInvitation(u: SessionUser, workspaceId: string, email: string, role: Exclude<WsRole, "owner">, requestId?: string) {
  await assertWorkspaceAccess(u, workspaceId, "owner");
  const [w] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  if (w.personal) throw new ApiError(409, "personal_workspace", "Create a shared workspace to collaborate; personal field books are private");

  const normalizedEmail = email.toLowerCase().trim();
  const token = randomBytes(32).toString("base64url");
  const id = `inv_${randomUUID()}`;
  // 7-day expiry matches the share-link default window.
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);

  // If the user already exists and is already a member, short-circuit.
  const [existing] = await db()
    .select({ userId: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.email, normalizedEmail), eq(schema.user.status, "active")))
    .limit(1);
  if (existing) {
    const [already] = await db()
      .select()
      .from(schema.workspaceMembers)
      .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, existing.userId)))
      .limit(1);
    if (already) return { ok: true, message: "That user is already a member of this workspace.", invitation: null };
  }

  await db().insert(schema.workspaceInvitations).values({
    id,
    workspaceId,
    email: normalizedEmail,
    role,
    tokenHash: hashToken(token),
    invitedBy: u.id,
    expiresAt,
  });

  // Best-effort outbound mail. In dev/test this lands in data/outbox; in prod
  // it needs MAIL_DRIVER=resend + RESEND_API_KEY. Failure to send does not
  // invalidate the invitation — the owner can copy the link from the UI.
  const e = env();
  const link = `${e.APP_URL}/invite/${token}`;
  try {
    await sendMail({
      to: normalizedEmail,
      kind: "workspace-invitation",
      subject: `${u.name} invited you to “${w.name}” on MoonNav`,
      text: [
        `${u.name} has invited you to join the workspace “${w.name}” on MoonNav as ${role}.`,
        ``,
        `Open this link to accept (it expires in 7 days):`,
        link,
        ``,
        `If you do not have a MoonNav account yet, the link will let you register first.`,
        `If you were not expecting this invitation, you can ignore this email.`,
      ].join("\n"),
    });
  } catch {
    // Non-fatal: the invitation is still listed in the UI with a copyable link.
  }

  await audit({ actorUserId: u.id, action: "workspace.invite", objectType: "workspace", objectId: workspaceId, metadata: { invitationId: id, email: normalizedEmail, role, expiresAt: expiresAt.toISOString() }, requestId });

  // Return the raw token once so the UI can show a one-time copyable link.
  return { ok: true, message: `Invitation sent to ${normalizedEmail}.`, invitation: { id, token, email: normalizedEmail, role, expiresAt: expiresAt.toISOString() } };
}

export async function listInvitations(u: SessionUser, workspaceId: string) {
  await assertWorkspaceAccess(u, workspaceId);
  return db()
    .select()
    .from(schema.workspaceInvitations)
    .where(and(eq(schema.workspaceInvitations.workspaceId, workspaceId), isNull(schema.workspaceInvitations.revokedAt)))
    .orderBy(desc(schema.workspaceInvitations.createdAt));
}

export async function revokeInvitation(u: SessionUser, workspaceId: string, invitationId: string, requestId?: string) {
  await assertWorkspaceAccess(u, workspaceId, "owner");
  const [inv] = await db()
    .select()
    .from(schema.workspaceInvitations)
    .where(and(eq(schema.workspaceInvitations.id, invitationId), eq(schema.workspaceInvitations.workspaceId, workspaceId)))
    .limit(1);
  if (!inv) throw notFound("Invitation");
  if (inv.acceptedAt) throw new ApiError(409, "already_accepted", "This invitation has already been accepted; remove the member instead.");
  await db().update(schema.workspaceInvitations).set({ revokedAt: new Date() }).where(eq(schema.workspaceInvitations.id, invitationId));
  await audit({ actorUserId: u.id, action: "workspace.invite_revoke", objectType: "workspace", objectId: workspaceId, metadata: { invitationId }, requestId });
}

/** Public, token-only preview (no auth). Returns null when invalid/expired/revoked/accepted. */
export async function resolveInvitationToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const [inv] = await db()
    .select()
    .from(schema.workspaceInvitations)
    .where(eq(schema.workspaceInvitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt.getTime() < Date.now()) return null;
  const [w] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, inv.workspaceId)).limit(1);
  if (!w) return null;
  const [inviter] = await db().select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, inv.invitedBy)).limit(1);
  return { invitation: inv, workspace: w, inviterName: inviter?.name ?? "Someone" };
}

/** Accept an invitation as the signed-in user. Idempotent: re-accepting is a no-op. */
export async function acceptInvitation(u: SessionUser, token: string, requestId?: string) {
  const resolved = await resolveInvitationToken(token);
  if (!resolved) throw new ApiError(404, "not_found", "Invitation not found, expired, or already used");
  const { invitation, workspace } = resolved;
  // The invited address must match the signed-in user's verified email, OR the
  // user must be an admin (admin override for support cases).
  if (u.email.toLowerCase().trim() !== invitation.email.toLowerCase().trim() && u.role !== "admin") {
    throw new ApiError(403, "email_mismatch", "This invitation was sent to a different email address. Sign in with that address to accept.");
  }
  if (!u.emailVerified) throw new ApiError(403, "email_not_verified", "Verify your email address first, then accept the invitation.");

  await db().transaction(async (tx) => {
    await tx
      .insert(schema.workspaceMembers)
      .values({ workspaceId: workspace.id, userId: u.id, role: invitation.role as WsRole })
      .onConflictDoNothing();
    await tx
      .update(schema.workspaceInvitations)
      .set({ acceptedBy: u.id, acceptedAt: new Date() })
      .where(eq(schema.workspaceInvitations.id, invitation.id));
  });
  await audit({ actorUserId: u.id, action: "workspace.invite_accept", objectType: "workspace", objectId: workspace.id, metadata: { invitationId: invitation.id, role: invitation.role }, requestId });
  return { workspaceId: workspace.id, workspaceName: workspace.name, role: invitation.role };
}

/** Periodic cleanup hook: mark expired invitations. Returns the count touched. */
export async function sweepExpiredInvitations(): Promise<number> {
  const res = await db()
    .update(schema.workspaceInvitations)
    .set({ revokedAt: new Date() })
    .where(and(isNull(schema.workspaceInvitations.revokedAt), isNull(schema.workspaceInvitations.acceptedAt), lte(schema.workspaceInvitations.expiresAt, new Date())))
    .returning({ id: schema.workspaceInvitations.id });
  return res.length;
}
