import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertWorkspaceAccess, requireApiUser } from "@/lib/dal";
import { json, notFound, route } from "@/lib/http";
import { cancelJob, kickJobDrain, workerStatus } from "@/lib/jobs";

// On Vercel a queued job is processed in after(); give it the route's full duration.
export const maxDuration = 300;

type Ctx = { params: Promise<{ jobId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { jobId } = await params;
  const [j] = await db().select().from(schema.analysisJobs).where(eq(schema.analysisJobs.id, jobId)).limit(1);
  if (!j) throw notFound("Job");
  await assertWorkspaceAccess(u, j.workspaceId);
  const w = await workerStatus();
  // Backstop for serverless mode: a job still queued after 20 s gets another drain request.
  if (w.onDemand && j.status === "queued" && Date.now() - j.createdAt.getTime() > 20_000) kickJobDrain();
  return json({
    job: { id: j.id, analysisId: j.analysisId, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, progress: j.progress, stage: j.stage, error: j.error, createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, runAfter: j.runAfter, log: j.log.slice(-20) },
    worker: w,
  });
});

export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { jobId } = await params;
  await cancelJob(u, jobId, requestId);
  return json({ ok: true, status: "cancelled" });
});
