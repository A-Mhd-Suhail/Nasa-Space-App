import { z } from "zod";
import type { AnalysisResult } from "@/lib/analysis-types";
import { requireServiceToken } from "@/lib/internal-auth";
import { json, readJson, route } from "@/lib/http";
import { completeJob } from "@/lib/jobs";

const body = z.object({
  leaseToken: z.string().min(10),
  result: z.looseObject({
    status: z.literal("completed"),
    quality: z.enum(["high", "medium", "low", "insufficient"]),
    site: z.looseObject({ latitudeDeg: z.number(), longitudeEastDeg: z.number() }),
    timeRange: z.looseObject({ startUtc: z.string(), endUtc: z.string(), sampleStepSeconds: z.number() }),
    sun: z.looseObject({ totalVisibleSeconds: z.number() }),
    earth: z.looseObject({ totalVisibleSeconds: z.number() }),
    power: z.looseObject({ status: z.string() }),
    timeseries: z.array(z.looseObject({ utc: z.string() })).max(25_000),
    provenance: z.looseObject({ methodVersion: z.string(), kernelManifestId: z.string(), terrainProductId: z.string() }),
  }),
});

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  requireServiceToken(req);
  const { jobId } = await params;
  const b = body.parse(await readJson(req));
  await completeJob(jobId, b.leaseToken, b.result as unknown as AnalysisResult);
  return json({ ok: true });
});
