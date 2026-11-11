import { z } from "zod";
import { requireServiceToken } from "@/lib/internal-auth";
import { json, readJson, route } from "@/lib/http";
import { failJob } from "@/lib/jobs";

const body = z.object({ leaseToken: z.string().min(10), retryable: z.boolean(), code: z.string().max(60), message: z.string().max(2000), field: z.string().max(120).nullable().optional() });

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  requireServiceToken(req);
  const { jobId } = await params;
  const b = body.parse(await readJson(req));
  await failJob(jobId, b.leaseToken, b);
  return json({ ok: true });
});
