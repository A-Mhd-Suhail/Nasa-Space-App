import { assertWorkspaceAccess, audit, rateLimit, requireApiUser } from "@/lib/dal";
import { ApiError, json, route } from "@/lib/http";
import { science } from "@/lib/science";
import { getAnalysis } from "@/lib/services";
import { repos } from "@/repositories";

type Check = { status: "pass" | "warn" | "fail"; maxSeparationDeg: number; checkedAtUtc: string; [k: string]: unknown };

/**
 * Live, independent JPL Horizons cross-check of an analysis' SPICE Sun/Earth geometry.
 * The latest result is stored on the analysis and shown in the app and the mission report.
 */
export const POST = route<{ params: Promise<{ analysisId: string }> }>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`horizons:${u.id}`, 6, 60);
  const { analysisId } = await params;
  const { analysis, scenario } = await getAnalysis(u, analysisId);
  await assertWorkspaceAccess(u, analysis.workspaceId, "editor");
  if (analysis.status !== "completed") throw new ApiError(409, "not_ready", "Validate a completed analysis");
  const heightM = Number((analysis.summary as { site?: { heightM?: number } } | null)?.site?.heightM ?? 0) + scenario.observerHeightM;
  // Up to 13 epochs spread over the first 14 days of the analysis window (bounded request size).
  const start = scenario.startUtc.getTime();
  const stop = Math.min(scenario.endUtc.getTime(), start + 14 * 86_400_000);
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const check = await science<Check>("/v1/validate/horizons", {
    method: "POST",
    body: { latitudeDeg: scenario.latitudeDeg, longitudeEastDeg: scenario.longitudeEastDeg, heightM, startUtc: iso(start), stopUtc: iso(stop), samples: 13 },
    timeoutMs: 120_000,
    requestId,
  });
  await repos().analyses.setValidation(analysisId, check);
  await audit({ actorUserId: u.id, action: "analysis.validate_horizons", objectType: "analysis", objectId: analysisId, metadata: { status: check.status, maxSeparationDeg: check.maxSeparationDeg }, requestId });
  return json({ validation: check });
});
