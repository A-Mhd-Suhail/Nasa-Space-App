import { requireApiUser } from "@/lib/dal";
import { ApiError, json, route } from "@/lib/http";
import { submitAnalysis } from "@/lib/jobs";
import { getAnalysis } from "@/lib/services";
import { currentVersions, stalenessFor } from "@/lib/staleness";
import { rerunKey } from "@/lib/staleness-core";

// On Vercel a queued job is processed in after(); give it the route's full duration.
export const maxDuration = 300;

/** Re-run a stale analysis under the current method/kernel/DEM versions. The original result is kept. */
export const POST = route<{ params: Promise<{ analysisId: string }> }>(async (req, { params }) => {
  const u = await requireApiUser();
  const { analysisId } = await params;
  const { analysis, scenario } = await getAnalysis(u, analysisId);
  const cur = await currentVersions();
  const st = await stalenessFor(analysis, cur);
  if (!cur || !st) throw new ApiError(503, "versions_unavailable", "Current science versions are unavailable; try again when the science service is up.");
  if (st.state !== "stale") throw new ApiError(409, "not_stale", "This analysis already uses the current versions.");
  const r = await submitAnalysis(u, scenario.id, req.headers.get("x-request-id") ?? undefined, { rerunKey: rerunKey(cur, scenario.terrainProductId), supersedes: analysis.id });
  return json(r, { status: 202 });
});
