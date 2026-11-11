import { z } from "zod";

/** Shared request contracts (validated in forms and again on the server). */

export const DEFAULT_TERRAIN_PRODUCT = "lola-ldem-75s-240m-v2";
export const DEM_MAX_LATITUDE = -75; // LDEM_75S coverage edge
export const MAX_SAMPLES = 20_000;

const isoUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?Z$/, "Use UTC ISO-8601 with a Z suffix, e.g. 2026-11-15T00:00:00Z")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export const visibilityRule = z.enum(["any_disk", "full_disk", "center"]);

export const solarPanelSchema = z
  .object({
    areaM2: z.number().positive().max(1000),
    efficiency: z.number().gt(0).max(0.5),
    derating: z.number().gt(0).max(1),
    orientation: z.enum(["fixed", "two_axis_tracking"]),
    normalAzimuthDeg: z.number().min(0).lt(360).nullable().optional(),
    normalElevationDeg: z.number().min(-90).max(90).nullable().optional(),
    maxOutputW: z.number().positive().nullable().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.orientation === "fixed" && (p.normalAzimuthDeg == null || p.normalElevationDeg == null)) {
      ctx.addIssue({ code: "custom", path: ["normalAzimuthDeg"], message: "Fixed panels need a normal azimuth and elevation" });
    }
  });

export function normalizeLonEast(lon: number, convention: "east" | "west" = "east"): number {
  const v = convention === "west" ? -lon : lon;
  const r = ((v % 360) + 360) % 360;
  return r === 360 ? 0 : r;
}

export const siteInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("catalog"), siteId: z.string().min(1).max(64) }),
  z.object({
    mode: z.literal("custom"),
    latitudeDeg: z.number().min(-90).max(DEM_MAX_LATITUDE, `Terrain coverage is limited to latitudes south of ${Math.abs(DEM_MAX_LATITUDE)}°S`),
    longitudeDeg: z.number().min(-360).max(360),
    longitudeConvention: z.enum(["east", "west"]).default("east"),
    label: z.string().max(80).optional(),
  }),
]);

export const scenarioInput = z
  .object({
    projectId: z.string().min(1).max(80),
    name: z.string().trim().min(1, "Name is required").max(120),
    site: siteInput,
    observerHeightM: z.number().min(0).max(100).default(2),
    startUtc: isoUtc,
    endUtc: isoUtc,
    stepSeconds: z.number().int().min(60).max(86_400),
    terrainProductId: z.string().default(DEFAULT_TERRAIN_PRODUCT),
    antennaMinimumElevationDeg: z.number().min(-10).max(90).nullable().default(null),
    solarPanel: solarPanelSchema.nullable().default(null),
    sunVisibilityRule: visibilityRule.default("any_disk"),
    earthVisibilityRule: visibilityRule.default("any_disk"),
    refineToleranceSeconds: z.number().min(1).max(600).default(10),
    parentScenarioId: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    const a = Date.parse(s.startUtc);
    const b = Date.parse(s.endUtc);
    if (!(b > a)) ctx.addIssue({ code: "custom", path: ["endUtc"], message: "Stop time must be after start time" });
    const days = (b - a) / 86_400_000;
    if (days > 400) ctx.addIssue({ code: "custom", path: ["endUtc"], message: "Interval is limited to 400 days" });
    const n = (b - a) / 1000 / s.stepSeconds;
    if (n > MAX_SAMPLES) ctx.addIssue({ code: "custom", path: ["stepSeconds"], message: `Too many samples (${Math.ceil(n)}); max ${MAX_SAMPLES}. Increase the step.` });
  });
export type ScenarioInput = z.infer<typeof scenarioInput>;

export const projectInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).optional() });
export const projectPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const compareInput = z.object({
  analysisIds: z.array(z.string().min(1)).min(2, "Select at least two analyses").max(8, "Compare up to eight analyses"),
  gates: z
    .object({
      minSunFraction: z.number().min(0).max(1).nullable().default(null),
      minDteFraction: z.number().min(0).max(1).nullable().default(null),
      maxUnknownFraction: z.number().min(0).max(1).nullable().default(null),
      minSunHours: z.number().min(0).max(24 * 400).nullable().optional(),
      minDteHours: z.number().min(0).max(24 * 400).nullable().optional(),
      maxSlopeDeg: z.number().min(0).max(90).nullable().optional(),
    })
    .default({ minSunFraction: null, minDteFraction: null, maxUnknownFraction: null }),
  weights: z
    .object({ sun: z.number().min(0).max(10), dte: z.number().min(0).max(10), energy: z.number().min(0).max(10) })
    .default({ sun: 1, dte: 1, energy: 0 }),
});
export type CompareInput = z.infer<typeof compareInput>;

export const reportInput = z.object({ analysisId: z.string().min(1), format: z.enum(["pdf", "csv", "json"]) });
export const shareLinkInput = z.object({ reportId: z.string().min(1), expiresInHours: z.number().int().min(1).max(24 * 30).default(72) });

/** Canonical worker-facing definition. Sorted keys -> stable hash. */
export function canonicalDefinition(s: ScenarioInput, lat: number, lonEast: number) {
  return {
    site: { latitudeDeg: lat, longitudeEastDeg: lonEast, observerHeightM: s.observerHeightM },
    timeRange: { startUtc: s.startUtc, endUtc: s.endUtc, sampleStepSeconds: s.stepSeconds },
    products: { terrainProductId: s.terrainProductId, ephemerisProvider: "spice" },
    assumptions: { antennaMinimumElevationDeg: s.antennaMinimumElevationDeg, solarPanel: s.solarPanel },
    options: {
      sunVisibilityRule: s.sunVisibilityRule,
      earthVisibilityRule: s.earthVisibilityRule,
      refineToleranceSeconds: s.refineToleranceSeconds,
      aberrationCorrection: "LT+S",
    },
  };
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}
