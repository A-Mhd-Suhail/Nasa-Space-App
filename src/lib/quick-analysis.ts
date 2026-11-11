import "server-only";
import { z } from "zod";
import type { AnalysisResult } from "./analysis-types";
import { DEFAULT_TERRAIN_PRODUCT, normalizeLonEast } from "./contracts";
import { science } from "./science";

/**
 * Synchronous single-site analysis through the science service (SPICE + LOLA). Used by the
 * checklist endpoints /api/analyze and /api/timeline. Results are not persisted; saved,
 * reproducible analyses go through scenarios + the job queue.
 */
export const quickInput = z
  .object({
    latitudeDeg: z.number().min(-90).max(90),
    longitudeDeg: z.number().min(-360).max(360),
    longitudeConvention: z.enum(["east", "west"]).default("east"),
    startUtc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/, "Use UTC ISO-8601 with a Z suffix"),
    hours: z.number().gt(0).max(24 * 31).default(24),
    stepSeconds: z.number().int().min(60).max(86_400).default(600),
    observerHeightM: z.number().min(0).max(100).default(2),
    antennaMinimumElevationDeg: z.number().min(-10).max(90).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (Number.isNaN(Date.parse(v.startUtc))) ctx.addIssue({ code: "custom", path: ["startUtc"], message: "Invalid date" });
    if ((v.hours * 3600) / v.stepSeconds > 5000) ctx.addIssue({ code: "custom", path: ["stepSeconds"], message: "Too many samples for a synchronous analysis (max 5000); increase the step or save a scenario" });
  });
export type QuickInput = z.infer<typeof quickInput>;

export async function quickAnalysis(i: QuickInput, requestId?: string): Promise<AnalysisResult> {
  const lon = normalizeLonEast(i.longitudeDeg, i.longitudeConvention);
  const start = new Date(Date.parse(i.startUtc));
  const end = new Date(start.getTime() + i.hours * 3_600_000);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const scenario = {
    site: { latitudeDeg: i.latitudeDeg, longitudeEastDeg: lon, observerHeightM: i.observerHeightM },
    timeRange: { startUtc: iso(start), endUtc: iso(end), sampleStepSeconds: i.stepSeconds },
    products: { terrainProductId: DEFAULT_TERRAIN_PRODUCT, ephemerisProvider: "spice" },
    assumptions: { antennaMinimumElevationDeg: i.antennaMinimumElevationDeg, solarPanel: null },
    options: { sunVisibilityRule: "any_disk", earthVisibilityRule: "any_disk", refineToleranceSeconds: 10, aberrationCorrection: "LT+S" },
  };
  return science<AnalysisResult>("/v1/analyze", { method: "POST", body: { scenario }, timeoutMs: 60_000, requestId });
}
