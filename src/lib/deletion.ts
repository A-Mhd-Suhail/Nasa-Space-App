import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, forbidden } from "./http";
import { WS_RANK, type SessionUser } from "./dal";
import { deleteObject } from "./storage";

/**
 * Shared rules for deleting scenarios, projects and workspaces (one implementation, used by the member APIs
 * and the administrator API).
 *
 *  - Workspace owners may delete anything in their workspace; editors only what they created; viewers nothing.
 *  - Nothing with queued or running analyses is deleted: the caller must cancel or wait first (409).
 *  - Rows go first (cascade through analyses, jobs, reports, share links, annotations); stored result/report files
 *    are then removed best-effort, and any that could not be removed are reported in the audit record.
 *  - Every deletion is audited with what it removed; audit records themselves are never deleted.
 */
export type Scope = { scenarioId: string } | { projectId: string } | { workspaceId: string };
export type Impact = { scenarios: number; analyses: number; reports: number; activeShareLinks: number; activeJobs: number };

const scopeConds = (scope: Scope) => {
  if ("scenarioId" in scope) return { scn: eq(schema.scenarios.id, scope.scenarioId), ana: eq(schema.analyses.scenarioId, scope.scenarioId) };
  if ("projectId" in scope) return { scn: eq(schema.scenarios.projectId, scope.projectId), ana: inArray(schema.analyses.scenarioId, db().select({ id: schema.scenarios.id }).from(schema.scenarios).where(eq(schema.scenarios.projectId, scope.projectId))) };
  return { scn: eq(schema.scenarios.workspaceId, scope.workspaceId), ana: eq(schema.analyses.workspaceId, scope.workspaceId) };
};

export async function impactOf(scope: Scope): Promise<Impact & { storageKeys: string[] }> {
  const c = scopeConds(scope);
  const d = db();
  const [scn] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.scenarios).where(c.scn);
  const anas = await d.select({ id: schema.analyses.id, key: schema.analyses.resultStorageKey, status: schema.analyses.status }).from(schema.analyses).where(c.ana);
  const ids = anas.map((a) => a.id);
  const reps = ids.length ? await d.select({ id: schema.reports.id, key: schema.reports.storageKey }).from(schema.reports).where(inArray(schema.reports.analysisId, ids)) : [];
  const links = reps.length ? await d.select({ n: sql<number>`count(*)::int` }).from(schema.shareLinks).where(and(inArray(schema.shareLinks.reportId, reps.map((r) => r.id)), sql`${schema.shareLinks.revokedAt} is null`, sql`${schema.shareLinks.expiresAt} > now()`)) : [{ n: 0 }];
  const jobs = ids.length ? await d.select({ n: sql<number>`count(*)::int` }).from(schema.analysisJobs).where(and(inArray(schema.analysisJobs.analysisId, ids), inArray(schema.analysisJobs.status, ["queued", "running"]))) : [{ n: 0 }];
  return {
    scenarios: scn?.n ?? 0,
    analyses: anas.length,
    reports: reps.length,
    activeShareLinks: links[0]?.n ?? 0,
    activeJobs: jobs[0]?.n ?? 0,
    storageKeys: [...anas.map((a) => a.key), ...reps.map((r) => r.key)].filter((k): k is string => !!k),
  };
}

/** Owner of the workspace: always. Editor: only resources they created. Everyone else: no. */
export async function assertMayDelete(u: SessionUser, workspaceId: string, createdBy: string | null) {
  const [m] = await db()
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, u.id)))
    .limit(1);
  if (!m) throw new ApiError(404, "not_found", "Resource not found");
  const rank = WS_RANK[m.role as keyof typeof WS_RANK];
  if (rank >= WS_RANK.owner) return;
  if (rank >= WS_RANK.editor && createdBy === u.id) return;
  throw forbidden(rank >= WS_RANK.editor ? "Only the workspace owner or the person who created this can delete it" : "Viewers cannot delete anything");
}

export function refuseIfBusy(i: Impact) {
  if (i.activeJobs > 0) throw new ApiError(409, "has_active_jobs", `${i.activeJobs} analysis job${i.activeJobs === 1 ? " is" : "s are"} still queued or running. Cancel or wait for ${i.activeJobs === 1 ? "it" : "them"}, then try again.`);
}

/** Best-effort removal of stored files after the rows are gone; returns how many could not be removed. */
export async function removeStored(keys: string[]): Promise<number> {
  let failed = 0;
  for (const k of keys) {
    try {
      await deleteObject(k);
    } catch {
      failed++;
    }
  }
  return failed;
}

export const impactSummary = (i: Impact, failedFiles = 0) => ({ scenarios: i.scenarios, analyses: i.analyses, reports: i.reports, activeShareLinks: i.activeShareLinks, filesNotRemoved: failedFiles });
