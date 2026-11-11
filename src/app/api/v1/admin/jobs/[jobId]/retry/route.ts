import { requireApiRole } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { retryJob } from "@/lib/jobs";

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (_req, { params }, requestId) => {
  const u = await requireApiRole("admin");
  const { jobId } = await params;
  await retryJob(u.id, jobId, requestId);
  return json({ ok: true });
});
