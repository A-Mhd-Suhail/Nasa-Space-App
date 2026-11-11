import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { getAnalysis } from "@/lib/services";
import { stalenessFor } from "@/lib/staleness";

export const GET = route<{ params: Promise<{ analysisId: string }> }>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { analysisId } = await params;
  const { analysis, job, scenario } = await getAnalysis(u, analysisId);
  return json({
    analysis: { ...analysis, resultStorageKey: undefined },
    job: job && { id: job.id, status: job.status, attempts: job.attempts, progress: job.progress, stage: job.stage, error: job.error },
    scenario,
    staleness: await stalenessFor(analysis),
  });
});
