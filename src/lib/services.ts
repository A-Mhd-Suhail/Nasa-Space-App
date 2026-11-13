import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AnalysisResult, AnalysisSummary } from "./analysis-types";
import type { CompareItem } from "./compare";
import { canonicalDefinition, normalizeLonEast, type ScenarioInput, stableStringify } from "./contracts";
import { assertWorkspaceAccess, audit, currentWorkspaceId, type SessionUser } from "./dal";
import { assertMayDelete, impactOf, impactSummary, refuseIfBusy, removeStored } from "./deletion";
import { ApiError, notFound } from "./http";
import { buildCsv, buildJson, buildPdf, type ReportContext } from "./report-builders";
import { science } from "./science";
import { getObject, keys, presignDownload, putObject } from "./storage";

export const APP_VERSION = "0.1.0";

/* ----------------------------- projects ----------------------------- */
export async function listProjects(u: SessionUser, includeArchived = false) {
  const ws = await currentWorkspaceId(u);
  const rows = await db()
    .select({
      p: schema.projects,
      scenarios: sql<number>`(select count(*)::int from scenarios s where s.project_id = "projects"."id")`,
    })
    .from(schema.projects)
    .where(includeArchived ? eq(schema.projects.workspaceId, ws) : and(eq(schema.projects.workspaceId, ws), eq(schema.projects.status, "active")))
    .orderBy(desc(schema.projects.updatedAt))
    .limit(200);
  return rows.map((r) => ({ ...r.p, scenarioCount: r.scenarios }));
}

export async function createProject(u: SessionUser, input: { name: string; description?: string }, requestId?: string) {
  const ws = await currentWorkspaceId(u, "editor");
  const id = `prj_${randomUUID()}`;
  await db().insert(schema.projects).values({ id, workspaceId: ws, name: input.name, description: input.description ?? null, createdBy: u.id });
  await audit({ actorUserId: u.id, action: "project.create", objectType: "project", objectId: id, requestId });
  return getProject(u, id);
}

export async function getProject(u: SessionUser, id: string) {
  const [p] = await db().select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  if (!p) throw notFound("Project");
  await assertWorkspaceAccess(u, p.workspaceId);
  return p;
}

export async function patchProject(u: SessionUser, id: string, patch: Partial<{ name: string; description: string | null; notes: string | null; status: "active" | "archived" }>, requestId?: string) {
  const p = await getProject(u, id);
  await assertWorkspaceAccess(u, p.workspaceId, "editor");
  await db().update(schema.projects).set({ ...patch, updatedAt: new Date() }).where(eq(schema.projects.id, id));
  await audit({ actorUserId: u.id, action: "project.update", objectType: "project", objectId: id, metadata: { fields: Object.keys(patch) }, requestId });
  return getProject(u, id);
}

export async function deleteProject(u: SessionUser, id: string, confirmName: string, requestId?: string) {
  const p = await getProject(u, id);
  await assertMayDelete(u, p.workspaceId, p.createdBy);
  if (confirmName.trim() !== p.name.trim()) throw new ApiError(422, "invalid_input", "Type the project name to confirm deletion", [{ field: "confirmName", message: "Name does not match" }]);
  const impact = await impactOf({ projectId: id });
  refuseIfBusy(impact);
  // Rows cascade through scenarios, analyses, jobs, reports, share links and annotations; the audit record is kept.
  await db().delete(schema.projects).where(eq(schema.projects.id, id));
  const failed = await removeStored(impact.storageKeys);
  await audit({ actorUserId: u.id, action: "project.delete", objectType: "project", objectId: id, metadata: { name: p.name, ...impactSummary(impact, failed) }, requestId });
  return impactSummary(impact, failed);
}

export async function duplicateProject(u: SessionUser, id: string, requestId?: string) {
  const p = await getProject(u, id);
  const copy = await createProject(u, { name: `${p.name} (copy)`, description: p.description ?? undefined }, requestId);
  const scs = await db().select().from(schema.scenarios).where(eq(schema.scenarios.projectId, id));
  if (scs.length) await db().insert(schema.scenarios).values(scs.map((s) => ({ ...s, id: `scn_${randomUUID()}`, projectId: copy.id, parentScenarioId: s.id, createdBy: u.id, createdAt: new Date() })));
  return copy;
}

/* ----------------------------- scenarios ----------------------------- */
export async function createScenario(u: SessionUser, input: ScenarioInput, requestId?: string) {
  const p = await getProject(u, input.projectId);
  await assertWorkspaceAccess(u, p.workspaceId, "editor");
  let lat: number;
  let lon: number;
  let siteId: string | null = null;
  if (input.site.mode === "catalog") {
    const [s] = await db().select().from(schema.sites).where(eq(schema.sites.id, input.site.siteId)).limit(1);
    if (!s) throw new ApiError(422, "invalid_input", "Unknown site", [{ field: "site.siteId", message: "Unknown site" }]);
    lat = s.latitudeDeg;
    lon = s.longitudeEastDeg;
    siteId = s.id;
  } else {
    lat = input.site.latitudeDeg;
    lon = normalizeLonEast(input.site.longitudeDeg, input.site.longitudeConvention);
  }
  const [prod] = await db().select().from(schema.dataProducts).where(eq(schema.dataProducts.id, input.terrainProductId)).limit(1);
  if (!prod || prod.kind !== "dem" || prod.status !== "approved") {
    throw new ApiError(422, "invalid_input", "Terrain product is not approved", [{ field: "terrainProductId", message: "Select an approved terrain product" }]);
  }
  const definition = canonicalDefinition(input, lat, lon);
  const definitionHash = createHash("sha256").update(stableStringify(definition)).digest("hex");
  let version = 1;
  if (input.parentScenarioId) {
    const [parent] = await db().select().from(schema.scenarios).where(eq(schema.scenarios.id, input.parentScenarioId)).limit(1);
    if (parent && parent.projectId === p.id) version = parent.version + 1;
  }
  const id = `scn_${randomUUID()}`;
  await db().insert(schema.scenarios).values({
    id, workspaceId: p.workspaceId, projectId: p.id, name: input.name, version, parentScenarioId: input.parentScenarioId ?? null, siteId,
    latitudeDeg: lat, longitudeEastDeg: lon, observerHeightM: input.observerHeightM, startUtc: new Date(input.startUtc), endUtc: new Date(input.endUtc),
    stepSeconds: input.stepSeconds, terrainProductId: input.terrainProductId, ephemerisProvider: "spice", definition, definitionHash, createdBy: u.id,
  });
  await db().update(schema.projects).set({ updatedAt: new Date() }).where(eq(schema.projects.id, p.id));
  await audit({ actorUserId: u.id, action: "scenario.create", objectType: "scenario", objectId: id, metadata: { projectId: p.id, definitionHash }, requestId });
  return getScenario(u, id);
}

export async function getScenario(u: SessionUser, id: string) {
  const [s] = await db().select().from(schema.scenarios).where(eq(schema.scenarios.id, id)).limit(1);
  if (!s) throw notFound("Scenario");
  await assertWorkspaceAccess(u, s.workspaceId);
  return s;
}

export async function listScenarios(u: SessionUser, projectId: string) {
  const p = await getProject(u, projectId);
  const scs = await db().select().from(schema.scenarios).where(eq(schema.scenarios.projectId, p.id)).orderBy(desc(schema.scenarios.createdAt));
  const ids = scs.map((s) => s.id);
  const ans = ids.length
    ? await db().select().from(schema.analyses).where(inArray(schema.analyses.scenarioId, ids)).orderBy(desc(schema.analyses.createdAt))
    : [];
  return scs.map((s) => ({ ...s, analyses: ans.filter((a) => a.scenarioId === s.id) }));
}

/* ----------------------------- analyses ----------------------------- */
export async function getAnalysis(u: SessionUser, id: string) {
  const [a] = await db().select().from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1);
  if (!a) throw notFound("Analysis");
  await assertWorkspaceAccess(u, a.workspaceId);
  const [job] = await db().select().from(schema.analysisJobs).where(eq(schema.analysisJobs.analysisId, id)).orderBy(desc(schema.analysisJobs.createdAt)).limit(1);
  const [sc] = await db().select().from(schema.scenarios).where(eq(schema.scenarios.id, a.scenarioId)).limit(1);
  return { analysis: a, job: job ?? null, scenario: sc };
}

export async function loadResult(a: typeof schema.analyses.$inferSelect): Promise<AnalysisResult> {
  if (a.status !== "completed" || !a.resultStorageKey) throw new ApiError(409, "not_ready", `Analysis is ${a.status}`);
  const buf = await getObject(a.resultStorageKey);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (a.resultSha256 && sha !== a.resultSha256) throw new ApiError(500, "integrity_error", "Stored analysis failed its checksum");
  return JSON.parse(buf.toString("utf8")) as AnalysisResult;
}

export async function recentAnalyses(u: SessionUser, limit = 20, status?: string) {
  const ws = await currentWorkspaceId(u);
  return db()
    .select({ a: schema.analyses, s: schema.scenarios, p: schema.projects })
    .from(schema.analyses)
    .innerJoin(schema.scenarios, eq(schema.scenarios.id, schema.analyses.scenarioId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.scenarios.projectId))
    .where(status ? and(eq(schema.analyses.workspaceId, ws), eq(schema.analyses.status, status)) : eq(schema.analyses.workspaceId, ws))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(limit);
}

export async function summariesFor(u: SessionUser, ids: string[]) {
  // Independent per analysis (each lookup still enforces workspace access), so run them concurrently; order is kept.
  return Promise.all(
    ids.map(async (id): Promise<CompareItem> => {
      const { analysis, scenario } = await getAnalysis(u, id);
      if (analysis.status !== "completed" || !analysis.summary) throw new ApiError(409, "not_ready", `Analysis ${id} is not completed`);
      const [[site], terrain] = await Promise.all([
        scenario.siteId ? db().select({ name: schema.sites.name }).from(schema.sites).where(eq(schema.sites.id, scenario.siteId)).limit(1) : Promise.resolve([] as { name: string }[]),
        terrainInfo(scenario.latitudeDeg, scenario.longitudeEastDeg),
      ]);
      return { analysisId: id, label: `${scenario.name} (v${scenario.version})`, siteName: site?.name, summary: analysis.summary as unknown as AnalysisSummary, terrain };
    }),
  );
}

/** Local slope / roughness at the finest LOLA resolution cached for a point (null when unavailable). */
async function terrainInfo(lat: number, lon: number) {
  try {
    type P = { slopeDeg: number | null; product: { productId: string; pixelSpacingM: number }; highResolution: { productId: string; resolutionM: number; slopeDeg: number | null; roughnessM: number | null } | null };
    const p = await science<P>(`/v1/terrain/point?lat=${lat}&lon=${lon}`, { timeoutMs: 15_000 });
    const hr = p.highResolution;
    return hr ? { slopeDeg: hr.slopeDeg, roughnessM: hr.roughnessM, resolutionM: hr.resolutionM, productId: hr.productId } : { slopeDeg: p.slopeDeg, roughnessM: null, resolutionM: p.product.pixelSpacingM, productId: p.product.productId };
  } catch {
    return null;
  }
}

/* ----------------------------- reports ----------------------------- */
const MIME = { pdf: "application/pdf", csv: "text/csv; charset=utf-8", json: "application/json" } as const;

export async function createReport(u: SessionUser, analysisId: string, format: "pdf" | "csv" | "json", requestId?: string) {
  const { analysis, scenario } = await getAnalysis(u, analysisId);
  await assertWorkspaceAccess(u, analysis.workspaceId, "editor");
  const result = await loadResult(analysis);
  const [project] = await db().select().from(schema.projects).where(eq(schema.projects.id, scenario.projectId)).limit(1);
  const id = `rep_${randomUUID()}`;
  const ctx: ReportContext = { analysisId, scenarioId: scenario.id, scenarioName: `${scenario.name} (v${scenario.version})`, projectName: project?.name ?? "", generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, "Z"), appVersion: APP_VERSION };
  const body = format === "json" ? buildJson(result, ctx) : format === "csv" ? buildCsv(result, ctx) : Buffer.from(await buildPdf(result, ctx));
  const [{ v }] = await db().select({ v: sql<number>`coalesce(max(version),0)::int + 1` }).from(schema.reports).where(and(eq(schema.reports.analysisId, analysisId), eq(schema.reports.format, format)));
  const put = await putObject(keys.report(analysis.workspaceId, id, v, format), body, MIME[format]);
  await db().insert(schema.reports).values({ id, workspaceId: analysis.workspaceId, analysisId, format, storageKey: put.key, sha256: put.sha256, bytes: put.bytes, version: v, createdBy: u.id });
  await audit({ actorUserId: u.id, action: "report.create", objectType: "report", objectId: id, metadata: { analysisId, format, sha256: put.sha256 }, requestId });
  return getReport(u, id);
}

export async function getReport(u: SessionUser, id: string) {
  const [r] = await db().select().from(schema.reports).where(eq(schema.reports.id, id)).limit(1);
  if (!r) throw notFound("Report");
  await assertWorkspaceAccess(u, r.workspaceId);
  return r;
}

export function reportFilename(r: { id: string; format: string; version: number }) {
  return `moonnav-${r.id.slice(4, 12)}-v${r.version}.${r.format}`;
}

export async function reportDownloadUrl(u: SessionUser, id: string) {
  const r = await getReport(u, id);
  return presignDownload(r.storageKey, reportFilename(r), 300);
}

export async function listReports(u: SessionUser) {
  const ws = await currentWorkspaceId(u);
  return db()
    .select({ r: schema.reports, s: schema.scenarios })
    .from(schema.reports)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.reports.analysisId))
    .innerJoin(schema.scenarios, eq(schema.scenarios.id, schema.analyses.scenarioId))
    .where(eq(schema.reports.workspaceId, ws))
    .orderBy(desc(schema.reports.createdAt))
    .limit(200);
}

/* ----------------------------- share links ----------------------------- */
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createShareLink(u: SessionUser, reportId: string, hours: number, requestId?: string) {
  const r = await getReport(u, reportId);
  await assertWorkspaceAccess(u, r.workspaceId, "editor");
  const token = randomBytes(32).toString("base64url");
  const id = `shr_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  await db().insert(schema.shareLinks).values({ id, tokenHash: hashToken(token), reportId, workspaceId: r.workspaceId, scope: "report:read", expiresAt, createdBy: u.id });
  await audit({ actorUserId: u.id, action: "share.create", objectType: "report", objectId: reportId, metadata: { shareId: id, expiresAt: expiresAt.toISOString() }, requestId });
  return { id, token, expiresAt };
}

export async function revokeShareLink(u: SessionUser, shareId: string, requestId?: string) {
  const [s] = await db().select().from(schema.shareLinks).where(eq(schema.shareLinks.id, shareId)).limit(1);
  if (!s) throw notFound("Share link");
  await assertWorkspaceAccess(u, s.workspaceId, "editor");
  await db().update(schema.shareLinks).set({ revokedAt: new Date() }).where(eq(schema.shareLinks.id, shareId));
  await audit({ actorUserId: u.id, action: "share.revoke", objectType: "report", objectId: s.reportId, metadata: { shareId }, requestId });
}

export async function listShareLinks(u: SessionUser, reportId: string) {
  const r = await getReport(u, reportId);
  return db().select().from(schema.shareLinks).where(eq(schema.shareLinks.reportId, r.id)).orderBy(desc(schema.shareLinks.createdAt));
}

/** Public, read-only resolution of a share token. Returns null when invalid, expired or revoked. */
export async function resolveShareToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const [s] = await db().select().from(schema.shareLinks).where(eq(schema.shareLinks.tokenHash, hashToken(token))).limit(1);
  if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now()) return null;
  const [r] = await db().select().from(schema.reports).where(eq(schema.reports.id, s.reportId)).limit(1);
  if (!r) return null;
  await db().update(schema.shareLinks).set({ accessCount: sql`${schema.shareLinks.accessCount} + 1` }).where(eq(schema.shareLinks.id, s.id));
  return { share: s, report: r };
}

/* ----------------------------- scenario management ----------------------------- */
/** All scenarios in the current workspace (newest first), with their latest analysis. */
export async function listWorkspaceScenarios(u: SessionUser, limit = 200) {
  const ws = await currentWorkspaceId(u);
  const scs = await db().select().from(schema.scenarios).where(eq(schema.scenarios.workspaceId, ws)).orderBy(desc(schema.scenarios.createdAt)).limit(limit);
  const ids = scs.map((s) => s.id);
  const ans = ids.length ? await db().select().from(schema.analyses).where(inArray(schema.analyses.scenarioId, ids)).orderBy(desc(schema.analyses.createdAt)) : [];
  return scs.map((s) => ({ ...s, latestAnalysis: ans.find((a) => a.scenarioId === s.id) ?? null }));
}

/** Rename only: the scientific definition (and its hash) is immutable for reproducibility. */
export async function renameScenario(u: SessionUser, id: string, name: string, requestId?: string) {
  const s = await getScenario(u, id);
  await assertWorkspaceAccess(u, s.workspaceId, "editor");
  await db().update(schema.scenarios).set({ name }).where(eq(schema.scenarios.id, id));
  await audit({ actorUserId: u.id, action: "scenario.rename", objectType: "scenario", objectId: id, metadata: { from: s.name, to: name }, requestId });
  return getScenario(u, id);
}

export async function deleteScenario(u: SessionUser, id: string, requestId?: string) {
  const sc = await getScenario(u, id);
  await assertMayDelete(u, sc.workspaceId, sc.createdBy);
  const impact = await impactOf({ scenarioId: id });
  refuseIfBusy(impact);
  await db().delete(schema.scenarios).where(eq(schema.scenarios.id, id));
  const failed = await removeStored(impact.storageKeys);
  await audit({ actorUserId: u.id, action: "scenario.delete", objectType: "scenario", objectId: id, metadata: { name: sc.name, projectId: sc.projectId, ...impactSummary(impact, failed) }, requestId });
  return impactSummary(impact, failed);
}
