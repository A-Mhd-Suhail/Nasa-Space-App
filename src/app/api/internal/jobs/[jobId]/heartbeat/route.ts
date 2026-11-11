import { z } from "zod";
import { requireServiceToken } from "@/lib/internal-auth";
import { json, readJson, route } from "@/lib/http";
import { heartbeat } from "@/lib/jobs";

const body = z.object({ leaseToken: z.string().min(10), progress: z.number().min(0).max(1).nullable().optional(), stage: z.string().max(60).nullable().optional() });

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  requireServiceToken(req);
  const { jobId } = await params;
  const b = body.parse(await readJson(req));
  await heartbeat(jobId, b.leaseToken, b.progress, b.stage);
  return json({ ok: true });
});
