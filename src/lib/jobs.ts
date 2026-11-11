import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { type AnalysisResult, summarize } from "./analysis-types";
import { ApiError, notFound } from "./http";
import { keys, putObject } from "./storage";
import { assertWorkspaceAccess, audit, type SessionUser } from "./dal";

export const LEASE_SECONDS = 60;

/** On Vercel there is no polling worker: jobs run on demand in the science function. */
export const ON_DEMAND_JOBS = !!process.env.VERCEL || process.env.JOB_MODE === "on-demand";

/** After the response is sent, ask the science service to process queued jobs (serverless mode only). */
export function kickJobDrain() {
  if (!ON_DEMAND_JOBS) return;
  after(async () => {
    const { science } = await import("./science");
    await science("/v1/worker/drain?budget_s=240", { method: "POST", timeoutMs: 270_000 }).catch(() => undefined);
  });
}
const QUEUE_VERSION = "queue-v1";

/** Validate + enqueue an analysis for an immutable scenario. Idempotent per scenario definition. */
export async function submitAnalysis(u: SessionUser, scenarioId: string, requestId?: string, opts?: { rerunKey?: string; supersedes?: string }) {
  const d = db();
  const [sc] = await d.select().from(schema.scenarios).where(eq(schema.scenarios.id, scenarioId)).limit(1);
  if (!sc) throw notFound("Scenario");
  await assertWorkspaceAccess(u, sc.workspaceId, "editor");
  // A deliberate re-run (stale result) gets its own key so the historical analysis is kept, while
  // repeating the same re-run under the same versions is still idempotent.
  const idem = createHash("sha256").update(`${sc.definitionHash}:${QUEUE_VERSION}${opts?.rerunKey ? `:${opts.rerunKey}` : ""}`).digest("hex");

  const existing = await d
    .select({ job: schema.analysisJobs, analysis: schema.analyses })
    .from(schema.analysisJobs)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.analysisJobs.analysisId))
    .where(and(eq(schema.analysisJobs.workspaceId, sc.workspaceId), eq(schema.analysisJobs.idempotencyKey, idem)))
    .limit(1);
  if (existing[0] && ["queued", "running", "completed"].includes(existing[0].job.status)) {
    return { jobId: existing[0].job.id, analysisId: existing[0].analysis.id, status: existing[0].job.status, reused: true };
  }

  const analysisId = `ana_${randomUUID()}`;
  const jobId = `job_${randomUUID()}`;
  await d.transaction(async (tx) => {
    if (existing[0]) {
      // previous attempt failed/cancelled: free the idempotency key for a fresh run
      await tx.update(schema.analysisJobs).set({ idempotencyKey: `${idem}:superseded:${existing[0].job.id}` }).where(eq(schema.analysisJobs.id, existing[0].job.id));
    }
    await tx.insert(schema.analyses).values({ id: analysisId, workspaceId: sc.workspaceId, scenarioId: sc.id, status: "queued", terrainProductId: sc.terrainProductId, createdBy: u.id });
    await tx.insert(schema.analysisJobs).values({
      id: jobId, analysisId, workspaceId: sc.workspaceId, idempotencyKey: idem, status: "queued", createdBy: u.id,
      log: [{ at: new Date().toISOString(), msg: "queued" }],
    });
  });
  await audit({ actorUserId: u.id, action: opts?.rerunKey ? "analysis.rerun" : "analysis.submit", objectType: "analysis", objectId: analysisId, metadata: { scenarioId, jobId, ...(opts?.supersedes ? { supersedes: opts.supersedes } : {}) }, requestId });
  kickJobDrain();
  return { jobId, analysisId, status: "queued", reused: false };
}

type ClaimRow = { id: string; analysis_id: string; attempts: number; lease_token: string };

/** Lease the next runnable job (queued and due, or running with an expired lease). */
export async function claimJob(workerId: string) {
  const d = db();
  await d.insert(schema.workerHeartbeats).values({ workerId, lastSeenAt: new Date() }).onConflictDoUpdate({ target: schema.workerHeartbeats.workerId, set: { lastSeenAt: new Date() } });
  // Jobs whose lease expired after the final attempt are failed rather than retried forever.
  await d.execute(sql`
    with dead as (
      update analysis_jobs set status = 'failed', finished_at = now(), updated_at = now(),
        error = '{"code":"lease_expired","message":"Worker stopped responding on the final attempt"}'::jsonb
      where status = 'running' and lease_expires_at < now() and attempts >= max_attempts
      returning analysis_id)
    update analyses set status = 'failed', error = '{"code":"lease_expired"}'::jsonb where id in (select analysis_id from dead)`);
  const token = randomUUID();
  const res = await d.execute<ClaimRow>(sql`
    update analysis_jobs set status = 'running', attempts = attempts + 1, lease_token = ${token},
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}), worker_id = ${workerId},
      started_at = coalesce(started_at, now()), updated_at = now(), stage = 'leased',
      log = log || jsonb_build_array(jsonb_build_object('at', now(), 'msg', 'leased by ' || ${workerId}))
    where id = (
      select id from analysis_jobs
      where ((status = 'queued' and run_after <= now()) or (status = 'running' and lease_expires_at < now()))
        and attempts < max_attempts
      order by created_at
      for update skip locked
      limit 1)
    returning id, analysis_id, attempts, lease_token`);
  const row = res.rows[0];
  if (!row) return null;
  const [a] = await d.select().from(schema.analyses).where(eq(schema.analyses.id, row.analysis_id)).limit(1);
  const [sc] = await d.select().from(schema.scenarios).where(eq(schema.scenarios.id, a.scenarioId)).limit(1);
  await d.update(schema.analyses).set({ status: "running" }).where(eq(schema.analyses.id, a.id));
  return { jobId: row.id, analysisId: row.analysis_id, attempt: row.attempts, leaseToken: row.lease_token, scenario: sc.definition };
}

async function leasedJob(jobId: string, leaseToken: string) {
  const [j] = await db()
    .select()
    .from(schema.analysisJobs)
    .where(and(eq(schema.analysisJobs.id, jobId), eq(schema.analysisJobs.leaseToken, leaseToken), eq(schema.analysisJobs.status, "running")))
    .limit(1);
  if (!j) throw new ApiError(409, "lease_lost", "Job is not leased with this token (cancelled, expired or completed)");
  return j;
}

export async function heartbeat(jobId: string, leaseToken: string, progress?: number | null, stage?: string | null) {
  await leasedJob(jobId, leaseToken);
  await db()
    .update(schema.analysisJobs)
    .set({
      leaseExpiresAt: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: new Date(), ...(progress != null ? { progress } : {}),
      ...(stage
        ? {
            stage,
            // one log line per real stage transition (with the reported fraction), not per heartbeat
            log: sql`case when ${schema.analysisJobs.stage} is distinct from ${stage}::text
              then ${schema.analysisJobs.log} || jsonb_build_array(jsonb_build_object('at', now(), 'msg', ${`stage ${stage}`}::text, 'progress', ${progress ?? null}::float8))
              else ${schema.analysisJobs.log} end`,
          }
        : {}),
    })
    .where(eq(schema.analysisJobs.id, jobId));
}

export async function completeJob(jobId: string, leaseToken: string, result: AnalysisResult) {
  const j = await leasedJob(jobId, leaseToken);
  const body = JSON.stringify(result);
  const put = await putObject(keys.analysisResult(j.workspaceId, j.analysisId), body, "application/json");
  const s = summarize(result);
  await db().transaction(async (tx) => {
    await tx
      .update(schema.analyses)
      .set({
        status: "completed", quality: result.quality, summary: s as unknown as Record<string, unknown>, methodVersion: result.provenance.methodVersion,
        softwareVersion: result.provenance.softwareVersion, kernelManifestId: result.provenance.kernelManifestId, terrainProductId: result.provenance.terrainProductId,
        resultStorageKey: put.key, resultSha256: put.sha256, resultBytes: put.bytes, completedAt: new Date(), error: null,
      })
      .where(eq(schema.analyses.id, j.analysisId));
    await tx
      .update(schema.analysisJobs)
      .set({ status: "completed", progress: 1, stage: "completed", finishedAt: new Date(), updatedAt: new Date(), leaseToken: null, log: sql`log || jsonb_build_array(jsonb_build_object('at', now(), 'msg', 'completed'))` })
      .where(eq(schema.analysisJobs.id, jobId));
  });
}

export async function failJob(jobId: string, leaseToken: string, f: { retryable: boolean; code: string; message: string; field?: string | null }) {
  const j = await leasedJob(jobId, leaseToken);
  const retry = f.retryable && j.attempts < j.maxAttempts;
  const delay = 15 * 2 ** (j.attempts - 1);
  const error = { code: f.code, message: f.message.slice(0, 500), field: f.field ?? null };
  await db().transaction(async (tx) => {
    await tx
      .update(schema.analysisJobs)
      .set({
        status: retry ? "queued" : "failed", leaseToken: null, leaseExpiresAt: null, error, updatedAt: new Date(),
        runAfter: retry ? sql`now() + make_interval(secs => ${delay})` : undefined, finishedAt: retry ? null : new Date(),
        stage: retry ? `retry in ${delay}s` : "failed",
        log: sql`log || jsonb_build_array(jsonb_build_object('at', now(), 'msg', ${`${f.code}: ${f.message.slice(0, 200)}${retry ? " (will retry)" : ""}`}))`,
      })
      .where(eq(schema.analysisJobs.id, jobId));
    await tx.update(schema.analyses).set({ status: retry ? "queued" : "failed", error: retry ? null : error }).where(eq(schema.analyses.id, j.analysisId));
  });
}

export async function cancelJob(u: SessionUser, jobId: string, requestId?: string) {
  const [j] = await db().select().from(schema.analysisJobs).where(eq(schema.analysisJobs.id, jobId)).limit(1);
  if (!j) throw notFound("Job");
  await assertWorkspaceAccess(u, j.workspaceId, "editor");
  if (!["queued", "running"].includes(j.status)) throw new ApiError(409, "not_cancellable", `Job is already ${j.status}`);
  await db().transaction(async (tx) => {
    await tx.update(schema.analysisJobs).set({ status: "cancelled", leaseToken: null, finishedAt: new Date(), updatedAt: new Date(), stage: "cancelled", log: sql`log || jsonb_build_array(jsonb_build_object('at', now(), 'msg', 'cancelled by user'))` }).where(eq(schema.analysisJobs.id, jobId));
    await tx.update(schema.analyses).set({ status: "cancelled" }).where(eq(schema.analyses.id, j.analysisId));
  });
  await audit({ actorUserId: u.id, action: "analysis.cancel", objectType: "job", objectId: jobId, requestId });
}

/** Admin: re-queue a failed or cancelled job. */
export async function retryJob(adminId: string, jobId: string, requestId?: string) {
  const [j] = await db().select().from(schema.analysisJobs).where(eq(schema.analysisJobs.id, jobId)).limit(1);
  if (!j) throw notFound("Job");
  if (!["failed", "cancelled"].includes(j.status)) throw new ApiError(409, "not_retryable", `Job is ${j.status}`);
  await db().transaction(async (tx) => {
    await tx.update(schema.analysisJobs).set({ status: "queued", attempts: 0, error: null, runAfter: new Date(), finishedAt: null, updatedAt: new Date(), stage: "requeued", log: sql`log || jsonb_build_array(jsonb_build_object('at', now(), 'msg', 'requeued by admin'))` }).where(eq(schema.analysisJobs.id, jobId));
    await tx.update(schema.analyses).set({ status: "queued", error: null }).where(eq(schema.analyses.id, j.analysisId));
  });
  await audit({ actorUserId: adminId, action: "job.retry", objectType: "job", objectId: jobId, requestId });
}

export async function workerStatus() {
  const rows = await db().select().from(schema.workerHeartbeats);
  const now = Date.now();
  const live = rows.filter((r) => now - r.lastSeenAt.getTime() < 30_000);
  const last = rows.reduce<Date | null>((m, r) => (!m || r.lastSeenAt > m ? r.lastSeenAt : m), null);
  const [q] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.analysisJobs)
    .where(inArray(schema.analysisJobs.status, ["queued", "running"]));
  return { liveWorkers: live.length, onDemand: ON_DEMAND_JOBS, lastSeenAt: last?.toISOString() ?? null, activeJobs: q?.n ?? 0 };
}
