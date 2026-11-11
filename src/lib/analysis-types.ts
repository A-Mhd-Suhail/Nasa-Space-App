/** Types mirroring the science engine result (science/moonnav_science/analysis.py). */

export type Interval = { startUtc: string; endUtc: string; durationS: number; kind: "visible" | "unknown"; startRefined: boolean; endRefined: boolean };
export type IntervalSummary = { totalVisibleSeconds: number; fractionVisible: number; intervalCount: number; unknownSeconds: number; unknownIntervalCount: number };

export type BodyState = "visible" | "partial" | "terrain_blocked" | "below_horizon" | "below_antenna_mask" | "unknown";

export type TimeRow = {
  utc: string;
  sunAzDeg: number | null;
  sunElDeg: number | null;
  sunHorizonDeg: number | null;
  sunState: BodyState;
  sunVisibleFraction: number | null;
  sunDistanceKm: number | null;
  earthAzDeg: number | null;
  earthElDeg: number | null;
  earthHorizonDeg: number | null;
  earthState: BodyState;
  dteGeometric: boolean | null;
  powerW: number | null;
};

export type HorizonData = {
  azimuthsDeg: number[];
  elevationDeg: (number | null)[];
  blockingDistanceM: (number | null)[];
  coverageDistanceM: (number | null)[];
  status: ("complete" | "truncated")[];
  unseenTerrainBoundDeg: (number | null)[];
  siteHeightM: number;
  params: Record<string, unknown>;
  truncatedRayCount: number;
  notes: string[];
};

export type AnalysisResult = {
  status: string;
  quality: "high" | "medium" | "low" | "insufficient";
  qualityRule: string;
  qualityReasons: string[];
  site: { latitudeDeg: number; longitudeEastDeg: number; heightM: number; observerHeightM: number; datum: string; latitudeType: string };
  timeRange: { startUtc: string; endUtc: string; sampleStepSeconds: number; sampleCount: number; refineToleranceSeconds: number; timeScale: string };
  sun: IntervalSummary & {
    currentAzimuthDeg: number | null;
    currentElevationDeg: number | null;
    terrainHorizonDeg: number | null;
    visibilityState: BodyState;
    visibilityRule: string;
    visibleIntervals: Interval[];
    elevationDuringVisibleDeg: { min: number | null; max: number | null; mean: number | null; definition: string };
    nextTransitionUtc: string | null;
  };
  earth: IntervalSummary & {
    currentAzimuthDeg: number | null;
    currentElevationDeg: number | null;
    terrainHorizonDeg: number | null;
    geometricDteState: BodyState;
    visibilityRule: string;
    antennaMinimumElevationDeg: number | null;
    visibleIntervals: Interval[];
    dteWindows: Interval[];
    dte: IntervalSummary;
    nextTransitionUtc: string | null;
    label: string;
  };
  power: {
    status: string;
    energyWh: number | null;
    peakW?: number | null;
    meanW?: number | null;
    integration?: string;
    message?: string;
    assumptions?: Record<string, unknown>;
  };
  horizon: HorizonData & { cacheKey: string };
  timeseries: TimeRow[];
  provenance: {
    ephemerisSource: string;
    aberrationCorrection: string;
    bodyFixedFrame: string;
    kernelManifestId: string;
    kernelFiles: { fileName: string; sha256: string }[];
    kernelCoverageUtc: [string, string];
    terrainProductId: string;
    terrainProduct: Record<string, unknown>;
    methodVersion: string;
    softwareVersion: string;
  };
  warnings: string[];
  computeSeconds?: number;
  demo?: { label: string; generatedAtUtc: string; siteKey: string; methodVersion: string };
};

/** Compact summary persisted in PostgreSQL (full result lives in object storage). */
export function summarize(r: AnalysisResult) {
  const { visibleIntervals: sv, ...sun } = r.sun;
  const { visibleIntervals: ev, dteWindows: dw, ...earth } = r.earth;
  return {
    quality: r.quality,
    qualityReasons: r.qualityReasons,
    site: r.site,
    timeRange: r.timeRange,
    sun: { ...sun, intervalPreview: sv.slice(0, 50) },
    earth: { ...earth, intervalPreview: ev.slice(0, 50), dtePreview: dw.slice(0, 50) },
    power: r.power,
    horizon: { truncatedRayCount: r.horizon.truncatedRayCount, siteHeightM: r.horizon.siteHeightM, params: r.horizon.params },
    provenance: r.provenance,
    warnings: r.warnings,
  };
}
export type AnalysisSummary = ReturnType<typeof summarize>;

export const STATE_LABEL: Record<BodyState, string> = {
  visible: "Visible",
  partial: "Partial disk",
  terrain_blocked: "Terrain-blocked",
  below_horizon: "Below horizon",
  below_antenna_mask: "Below antenna mask",
  unknown: "Unknown",
};
