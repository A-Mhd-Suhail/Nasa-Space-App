import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { auth } from "./auth";
import { ApiError, forbidden, unauthorized } from "./http";

export type Role = "user" | "analyst" | "curator" | "admin";
export const ROLE_RANK: Record<Role, number> = { user: 1, analyst: 2, curator: 3, admin: 4 };
export const MFA_ROLES: Role[] = ["curator", "admin"];

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  onboardedAt: Date | null;
  preferredMode: string | null;
  displayTimezone: string;
};

/** Session lookup, verified server-side by Better Auth (signed cookie + DB session row). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth().api.getSession({ headers: await headers() });
  if (!s) return null;
  const [u] = await db().select().from(schema.user).where(eq(schema.user.id, s.user.id)).limit(1);
  if (!u || u.status !== "active") return null;
  // Demo accounts expire DEMO_TTL_HOURS (24 h) after creation (lib/demo.ts).
  if (u.email.toLowerCase().endsWith("@demo.moonnav.invalid") && Date.now() - u.createdAt.getTime() > 24 * 3_600_000) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: (u.role as Role) ?? "user",
    twoFactorEnabled: !!u.twoFactorEnabled,
    emailVerified: u.emailVerified,
    onboardedAt: u.onboardedAt,
    preferredMode: u.preferredMode,
    displayTimezone: u.displayTimezone ?? "UTC",
  };
});

export function hasRole(u: SessionUser, min: Role): boolean {
  return ROLE_RANK[u.role] >= ROLE_RANK[min];
}

/* ---------- page guards (redirect) ---------- */
export async function requirePageUser(next: string): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requirePageRole(min: Role, next: string): Promise<SessionUser> {
  const u = await requirePageUser(next);
  if (!hasRole(u, min)) redirect("/app?denied=1");
  if (MFA_ROLES.includes(min) && !u.twoFactorEnabled) redirect("/settings/security?mfa=required");
  return u;
}

/* ---------- API guards (throw) ---------- */
export async function requireApiUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requireApiRole(min: Role): Promise<SessionUser> {
  const u = await requireApiUser();
  if (!hasRole(u, min)) throw forbidden();
  if (MFA_ROLES.includes(min) && !u.twoFactorEnabled) throw new ApiError(403, "mfa_required", "Multi-factor authentication is required for this role");
  return u;
}

/* ---------- workspaces ---------- */
export async function personalWorkspaceId(u: SessionUser): Promise<string> {
  const d = db();
  const [m] = await d
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(and(eq(schema.workspaces.ownerUserId, u.id), eq(schema.workspaces.personal, true)))
    .limit(1);
  if (m) return m.id;
  const id = `ws_${randomUUID()}`;
  await d.transaction(async (tx) => {
    await tx.insert(schema.workspaces).values({ id, name: `${u.name.split(" ")[0]}'s field book`, ownerUserId: u.id, personal: true });
    await tx.insert(schema.workspaceMembers).values({ workspaceId: id, userId: u.id, role: "owner" });
  });
  return id;
}

export const WS_RANK = { viewer: 1, editor: 2, owner: 3 } as const;
export type WsRole = keyof typeof WS_RANK;
export const WS_COOKIE = "moonnav_ws";

export type WorkspaceSummary = { id: string; name: string; role: WsRole; personal: boolean; ownerUserId: string; members: number };

/** Workspaces the user belongs to (personal one is created on first use). */
export async function listWorkspaces(u: SessionUser): Promise<WorkspaceSummary[]> {
  await personalWorkspaceId(u);
  const rows = await db()
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      personal: schema.workspaces.personal,
      ownerUserId: schema.workspaces.ownerUserId,
      role: schema.workspaceMembers.role,
      members: sql<number>`(select count(*)::int from workspace_members m2 where m2.workspace_id = "workspaces"."id")`,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, u.id))
    .orderBy(sql`${schema.workspaces.personal} desc, ${schema.workspaces.name}`);
  return rows.map((r) => ({ ...r, role: r.role as WsRole }));
}

/** The workspace selected in this browser (cookie), verified against membership; falls back to the personal one. */
export const currentWorkspace = cache(async (u: SessionUser): Promise<WorkspaceSummary> => {
  const all = await listWorkspaces(u);
  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  return all.find((w) => w.id === wanted) ?? all.find((w) => w.personal) ?? all[0];
});

export async function currentWorkspaceId(u: SessionUser, min: WsRole = "viewer"): Promise<string> {
  const w = await currentWorkspace(u);
  if (WS_RANK[w.role] < WS_RANK[min]) throw forbidden(`Your role in “${w.name}” is ${w.role}; ${min} access is required`);
  return w.id;
}

/** Enforce workspace membership on every object access (prevents IDOR / cross-workspace reads). */
export async function assertWorkspaceAccess(u: SessionUser, workspaceId: string, min: WsRole = "viewer"): Promise<void> {
  const [m] = await db()
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, u.id)))
    .limit(1);
  // Respond 404 rather than 403 so object existence is not revealed.
  if (!m) throw new ApiError(404, "not_found", "Resource not found");
  if (WS_RANK[m.role as keyof typeof WS_RANK] < WS_RANK[min]) throw forbidden();
}

/* ---------- audit ---------- */
export async function audit(e: { actorUserId: string | null; action: string; objectType: string; objectId?: string | null; metadata?: Record<string, unknown>; ip?: string | null; requestId?: string }) {
  await db()
    .insert(schema.auditEvents)
    .values({ id: `aud_${randomUUID()}`, actorUserId: e.actorUserId, action: e.action, objectType: e.objectType, objectId: e.objectId ?? null, metadata: e.metadata ?? {}, ip: e.ip ?? null, requestId: e.requestId ?? null });
}

/* ---------- rate limiting for app endpoints (fixed window, PostgreSQL) ---------- */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  if (process.env.NODE_ENV === "test" && process.env.MOONNAV_RATE_LIMIT_TEST !== "1") return;
  const now = Date.now();
  const k = `app:${key}`;
  const res = await db().execute<{ count: number }>(sql`
    insert into rate_limit (id, key, count, last_request) values (${randomUUID()}, ${k}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limit.last_request < ${now - windowSeconds * 1000} then 1 else rate_limit.count + 1 end,
      last_request = case when rate_limit.last_request < ${now - windowSeconds * 1000} then ${now} else rate_limit.last_request end
    returning count`);
  const count = Number(res.rows[0]?.count ?? 0);
  if (count > max) throw new ApiError(429, "rate_limited", "Too many requests. Please wait and try again.");
}
