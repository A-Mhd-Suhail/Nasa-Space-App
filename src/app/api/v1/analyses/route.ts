import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { submitAnalysis } from "@/lib/jobs";

const body = z.object({ scenarioId: z.string().min(1) });

/** Validate and enqueue. Returns 202 with job and analysis references. */
export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`analysis:${u.id}`, 20, 60);
  const { scenarioId } = body.parse(await readJson(req));
  const r = await submitAnalysis(u, scenarioId, requestId);
  return json({ ...r, statusUrl: `/api/v1/jobs/${r.jobId}`, analysisUrl: `/api/v1/analyses/${r.analysisId}` }, 202);
});
