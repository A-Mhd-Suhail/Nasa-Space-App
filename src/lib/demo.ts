import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, like, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { type AnalysisResult, summarize } from "./analysis-types";
import { auth } from "./auth";
import { audit, personalWorkspaceId, type SessionUser } from "./dal";
import { createProject, createScenario } from "./services";
import { keys, putObject } from "./storage";

/**
 * One-click demo accounts.
 * Each click creates an isolated, verified, role "user" account with its own private workspace, seeded
 * with the precomputed demonstration analyses (same engine, same SPICE kernels and LOLA product,
 * generated ahead of time and labelled "Precomputed"). Demo accounts see exactly what a new user sees,
 * cannot reach administration, cannot invite or email anyone, cannot change credentials, and expire
 * after DEMO_TTL_HOURS (their workspace data is deleted and the account disabled).
 */
export const DEMO_DOMAIN = "demo.moonnav.invalid";
export const DEMO_TTL_HOURS = 24;
export const isDemoEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
export const isDemoUser = (u: Pick<SessionUser, "email">) => isDemoEmail(u.email);

const DEMO_SITES = ["mons-malapert", "mons-mouton", "shackleton", "de-gerlache"] as const;

/** Disable expired demo accounts and delete their workspaces (all workspace content cascades). */
export async function cleanupExpiredDemos(): Promise<number> {
  const d = db();
  const cutoff = new Date(Date.now() - DEMO_TTL_HOURS * 3_600_000);
  const old = await d.select({ id: schema.user.id }).from(schema.user).where(and(like(schema.user.email, `%@${DEMO_DOMAIN}`), lt(schema.user.createdAt, cutoff), eq(schema.user.status, "active")));
  if (!old.length) return 0;
  const ids = old.map((o) => o.id);
  await d.delete(schema.workspaces).where(inArray(schema.workspaces.ownerUserId, ids));
  await d.delete(schema.session).where(inArray(schema.session.userId, ids));
  await d.update(schema.user).set({ status: "expired" }).where(inArray(schema.user.id, ids));
  return ids.length;
}

function demoFile(name: string) {
  return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "public/data/demo", name), "utf8"));
}

/** Seed the demo workspace with the precomputed, validated demonstration analyses. */
async function seed(u: SessionUser) {
  const ws = await personalWorkspaceId(u);
  const index = demoFile("index.json") as { window: [string, string, number] };
  const [startUtc, endUtc, step] = index.window;
  const project = await createProject(u, { name: "Demo · South Pole candidates", description: "Precomputed demonstration analyses (NAIF SPICE + NASA LOLA). Add your own scenarios, compare, plan and export like any workspace." });
  const d = db();
  for (const key of DEMO_SITES) {
    const result = demoFile(`${key}.json`) as AnalysisResult;
    const sc = await createScenario(u, {
      projectId: project.id, name: `${result.demo?.label ?? "Demo"} · ${key}`, site: { mode: "catalog", siteId: key }, observerHeightM: result.site.observerHeightM,
      startUtc, endUtc, stepSeconds: step, terrainProductId: result.provenance.terrainProductId, antennaMinimumElevationDeg: result.earth.antennaMinimumElevationDeg,
      solarPanel: null, sunVisibilityRule: "any_disk", earthVisibilityRule: "any_disk", refineToleranceSeconds: result.timeRange.refineToleranceSeconds,
    });
    const analysisId = `ana_${randomUUID()}`;
    const jobId = `job_${randomUUID()}`;
    const put = await putObject(keys.analysisResult(ws, analysisId), JSON.stringify(result), "application/json");
    const now = new Date();
    await d.transaction(async (tx) => {
      await tx.insert(schema.analyses).values({
        id: analysisId, workspaceId: ws, scenarioId: sc.id, status: "completed", quality: result.quality, summary: summarize(result) as unknown as Record<string, unknown>,
        methodVersion: result.provenance.methodVersion, softwareVersion: result.provenance.softwareVersion, kernelManifestId: result.provenance.kernelManifestId,
        terrainProductId: result.provenance.terrainProductId, resultStorageKey: put.key, resultSha256: put.sha256, resultBytes: put.bytes, completedAt: now, createdBy: u.id,
      });
      await tx.insert(schema.analysisJobs).values({
        id: jobId, analysisId, workspaceId: ws, idempotencyKey: createHash("sha256").update(`${sc.definitionHash}:queue-v1`).digest("hex"), status: "completed", progress: 1, stage: "completed",
        createdBy: u.id, startedAt: now, finishedAt: now, log: [{ at: now.toISOString(), msg: `completed from precomputed demonstration result (generated ${result.demo?.generatedAtUtc ?? "ahead of time"} by the same engine)` }],
      });
    });
    await d.insert(schema.savedLocations).values({ id: `loc_${randomUUID()}`, workspaceId: ws, name: key.replace(/-/g, " "), latitudeDeg: result.site.latitudeDeg, longitudeEastDeg: result.site.longitudeEastDeg, siteId: key, note: "Demo saved location", createdBy: u.id });
  }
}

/** Create a demo account, seed it, and return the Better Auth sign-in response (session cookies). */
export async function startDemo(ip: string | null, requestId?: string): Promise<Response> {
  await cleanupExpiredDemos();
  const email = `demo-${randomUUID().slice(0, 12)}@${DEMO_DOMAIN}`;
  const password = `${randomBytes(24).toString("base64url")}-Aa1`;
  await auth().api.signUpEmail({ body: { name: "Demo Explorer", email, password } });
  const now = new Date();
  const [row] = await db().update(schema.user).set({ emailVerified: true, onboardedAt: now, termsAcceptedAt: now, preferredMode: "learn", role: "user" }).where(eq(schema.user.email, email)).returning();
  const u: SessionUser = { id: row.id, name: row.name, email, role: "user", twoFactorEnabled: false, emailVerified: true, onboardedAt: now, preferredMode: "learn", displayTimezone: "UTC" };
  await seed(u);
  await audit({ actorUserId: u.id, action: "demo.start", objectType: "user", objectId: u.id, ip, requestId, metadata: { ttlHours: DEMO_TTL_HOURS } });
  return auth().api.signInEmail({ body: { email, password, rememberMe: false }, asResponse: true });
}
