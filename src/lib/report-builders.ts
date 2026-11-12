import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type { AnalysisResult } from "./analysis-types";

/** Pure report builders: every export is derived from the same stored analysis result. */

export type ReportContext = {
  analysisId: string;
  scenarioId: string;
  scenarioName: string;
  projectName: string;
  generatedAtUtc: string;
  appVersion: string;
};

const DISCLAIMER =
  "MoonNav is an independent research/educational prototype. It is not NASA-owned, NASA-endorsed or flight-certified. " +
  "Results are geometric/idealized calculations with the stated data products and assumptions. Geometric Direct-to-Earth visibility is line of sight only, not RF link availability.";

export function buildJson(r: AnalysisResult, c: ReportContext): string {
  return JSON.stringify(
    {
      schema: "moonnav.analysis-report.v1",
      report: { ...c, disclaimer: DISCLAIMER },
      analysis: r,
    },
    null,
    2,
  );
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // neutralise spreadsheet formula injection and quote when needed
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(r: AnalysisResult, c: ReportContext): string {
  const p = r.provenance;
  const header = [
    `# MoonNav analysis time series`,
    `# analysisId=${c.analysisId} scenarioId=${c.scenarioId} generatedAtUtc=${c.generatedAtUtc}`,
    `# site lat=${r.site.latitudeDeg} lonEast=${r.site.longitudeEastDeg} heightM=${r.site.heightM} observerHeightM=${r.site.observerHeightM} datum=${r.site.datum}`,
    `# time UTC; step=${r.timeRange.sampleStepSeconds}s; refineTolerance=${r.timeRange.refineToleranceSeconds}s`,
    `# ephemeris=${p.ephemerisSource} correction=${p.aberrationCorrection} frame=${p.bodyFixedFrame} kernels=${p.kernelManifestId}`,
    `# terrain=${p.terrainProductId} method=${p.methodVersion} software=${p.softwareVersion}`,
    `# sunVisibilityRule=${r.sun.visibilityRule} earthVisibilityRule=${r.earth.visibilityRule} antennaMaskDeg=${r.earth.antennaMinimumElevationDeg ?? "none"}`,
    `# angles in degrees, azimuth clockwise from north; empty cell = unavailable (never zero-filled)`,
    `# dteGeometric is line-of-sight only (not RF link availability)`,
  ];
  const cols = ["utc", "sunAzDeg", "sunElDeg", "sunHorizonDeg", "sunState", "sunVisibleFraction", "sunDistanceKm", "earthAzDeg", "earthElDeg", "earthHorizonDeg", "earthState", "dteGeometric", "powerW"] as const;
  const lines = r.timeseries.map((row) => cols.map((k) => csvCell(row[k])).join(","));
  return [...header, cols.join(","), ...lines].join("\n") + "\n";
}

function fmtH(s: number) {
  return `${(s / 3600).toFixed(2)} h`;
}

export async function buildPdf(r: AnalysisResult, c: ReportContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`MoonNav mission brief - ${c.scenarioName}`);
  doc.setProducer(`MoonNav ${c.appVersion}`);
  doc.setCreationDate(new Date(c.generatedAtUtc));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  let page = doc.addPage([595, 842]);
  let y = 800;
  const ink = rgb(0.161, 0.153, 0.133); // basalt ink #292722
  const mute = rgb(0.408, 0.388, 0.353); // muted #68635a

  const text = (s: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = o.size ?? 9.5;
    const f = o.f ?? font;
    const maxW = 595 - 48 - (o.x ?? 48);
    const words = s.replace(/[^\x20-\x7E°]/g, "?").split(" ");
    let line = "";
    const flush = () => {
      if (y < 60) {
        page = doc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line, { x: o.x ?? 48, y, size, font: f, color: o.color ?? ink });
      y -= size * 1.45;
      line = "";
    };
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxW && line) {
        flush();
        line = w;
      } else line = t;
    }
    if (line) flush();
  };
  const gap = (n = 6) => (y -= n);
  const h2 = (s: string) => {
    gap(6);
    text(s, { size: 12, f: bold });
    gap(2);
  };
  const kv = (k: string, v: string) => {
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
    page.drawText(k, { x: 48, y, size: 9, font: bold, color: mute });
    page.drawText(v.replace(/[^\x20-\x7E°]/g, "?").slice(0, 95), { x: 210, y, size: 9, font, color: ink });
    y -= 13.5;
  };

  text("MoonNav - Lunar Landing Site Navigator", { size: 9, color: mute });
  text(`Mission brief: ${c.scenarioName}`, { size: 18, f: bold });
  text(`Project: ${c.projectName}   |   Analysis ${c.analysisId}   |   Generated ${c.generatedAtUtc}`, { size: 8.5, color: mute });
  gap(4);
  text(DISCLAIMER, { size: 8, color: mute });

  h2("Scenario inputs");
  kv("Site (planetocentric)", `${r.site.latitudeDeg.toFixed(5)}° lat, ${r.site.longitudeEastDeg.toFixed(5)}° E`);
  kv("Height / datum", `${r.site.heightM.toFixed(1)} m (${r.site.datum}); observer +${r.site.observerHeightM} m`);
  kv("Interval (UTC)", `${r.timeRange.startUtc} to ${r.timeRange.endUtc}`);
  kv("Sampling", `${r.timeRange.sampleStepSeconds} s step, boundaries refined to ${r.timeRange.refineToleranceSeconds} s`);
  kv("Visibility rules", `Sun: ${r.sun.visibilityRule}; Earth: ${r.earth.visibilityRule}`);
  kv("Antenna mask", r.earth.antennaMinimumElevationDeg == null ? "none configured" : `${r.earth.antennaMinimumElevationDeg}° minimum elevation`);

  h2("Results");
  kv("Quality", `${r.quality} - ${r.qualityReasons.join("; ")}`);
  kv("Direct sunlight", `${fmtH(r.sun.totalVisibleSeconds)} (${(r.sun.fractionVisible * 100).toFixed(1)}%), ${r.sun.intervalCount} interval(s)`);
  const el = r.sun.elevationDuringVisibleDeg;
  kv("Sun elevation while lit", el.min == null ? "n/a" : `min ${el.min.toFixed(2)}°, mean ${el.mean?.toFixed(2)}°, max ${el.max?.toFixed(2)}°`);
  kv("Earth visible (terrain-aware)", `${fmtH(r.earth.totalVisibleSeconds)} (${(r.earth.fractionVisible * 100).toFixed(1)}%)`);
  kv("Geometric DTE windows", `${fmtH(r.earth.dte.totalVisibleSeconds)} (${(r.earth.dte.fractionVisible * 100).toFixed(1)}%), ${r.earth.dte.intervalCount} window(s)`);
  kv("Unknown (coverage)", `Sun ${fmtH(r.sun.unknownSeconds)}, Earth ${fmtH(r.earth.unknownSeconds)}`);
  kv("Panel energy", r.power.energyWh == null ? `not calculated (${r.power.status})` : `${r.power.energyWh.toFixed(1)} Wh idealized (${r.power.integration})`);
  if (r.sun.longestDarkS != null) kv("Longest Sun darkness", `${fmtH(r.sun.longestDarkS)}; ${r.sun.interruptionCount ?? 0} interruption(s) between sunlit periods`);
  if (r.earth.longestDarkS != null) kv("Longest Earth blockage", `${fmtH(r.earth.longestDarkS)} (geometric line of sight, not RF link availability)`);
  if (r.surface) {
    const t = r.surface.terrain;
    kv("Ground slope at site (DEM)", t.status === "ok" ? `${t.slopeDeg?.toFixed(1)}°, facing ${t.aspectDeg == null ? "n/a (flat)" : `${t.aspectDeg.toFixed(0)}°`}, ${t.baselineM} m baseline` : "UNAVAILABLE - no DEM heights at the site");
    kv("Direct-beam irradiance on the ground", r.surface.meanTerrainIrradianceWm2 == null ? "unavailable or partial" : `mean ${r.surface.meanTerrainIrradianceWm2} W/m2, peak ${r.surface.peakTerrainIrradianceWm2} W/m2, ${((r.surface.terrainEnergyWhPerM2 ?? 0) / 1000).toFixed(2)} kWh/m2 (physical irradiance, not electrical output)`);
  } else kv("Ground slope and irradiance", `not in this analysis (computed with ${r.provenance.methodVersion})`);

  // Sun & Earth elevation vs terrain horizon chart
  h2("Sun and Earth elevation vs terrain horizon");
  const W = 499;
  const H = 150;
  if (y - H < 60) {
    page = doc.addPage([595, 842]);
    y = 800;
  }
  const x0 = 48;
  const y0 = y - H;
  const rows = r.timeseries;
  const vals = rows.flatMap((p) => [p.sunElDeg, p.earthElDeg, p.sunHorizonDeg, p.earthHorizonDeg]).filter((v): v is number => v != null);
  const lo = Math.floor(Math.min(...vals, 0));
  const hi = Math.ceil(Math.max(...vals, 1));
  page.drawRectangle({ x: x0, y: y0, width: W, height: H, borderColor: rgb(0.867, 0.839, 0.788) /* rule #ddd6c9 */, borderWidth: 0.6 });
  const px = (i: number) => x0 + (i / Math.max(rows.length - 1, 1)) * W;
  const py = (v: number) => y0 + ((v - lo) / (hi - lo)) * H;
  const series: [keyof (typeof rows)[number], ReturnType<typeof rgb>, number][] = [
    ["sunHorizonDeg", rgb(0.773, 0.643, 0.427), 0.5], // champagne #c5a46d
    ["sunElDeg", rgb(0.51, 0.376, 0.122), 1.1], // sun ink #82601f
    ["earthHorizonDeg", rgb(0.541, 0.498, 0.722), 0.5], // earth mark #8a7fb8
    ["earthElDeg", rgb(0.373, 0.333, 0.537), 1.1], // lunar violet #5f5589
  ];
  const stride = Math.max(1, Math.floor(rows.length / 600));
  for (const [k, col, wd] of series) {
    let prev: [number, number] | null = null;
    for (let i = 0; i < rows.length; i += stride) {
      const v = rows[i][k] as number | null;
      if (v == null) {
        prev = null;
        continue;
      }
      const pt: [number, number] = [px(i), py(v)];
      if (prev) page.drawLine({ start: { x: prev[0], y: prev[1] }, end: { x: pt[0], y: pt[1] }, thickness: wd, color: col });
      prev = pt;
    }
  }
  if (lo < 0 && hi > 0) page.drawLine({ start: { x: x0, y: py(0) }, end: { x: x0 + W, y: py(0) }, thickness: 0.4, color: rgb(0.796, 0.761, 0.694) /* rule-strong #cbc2b1 */, dashArray: [2, 2] });
  page.drawText(`${hi}°`, { x: x0 - 22, y: y0 + H - 6, size: 7, font, color: mute });
  page.drawText(`${lo}°`, { x: x0 - 22, y: y0, size: 7, font, color: mute });
  y = y0 - 14;
  text("Solid: body centre elevation (Sun ochre, Earth violet). Thin: terrain horizon at the body's azimuth.", { size: 7.5, color: mute });

  // Terrain horizon profile: horizon elevation vs azimuth (0-360 deg), truncated rays marked.
  h2("Terrain horizon profile (LOLA, curvature-aware)");
  if (y - H < 60) {
    page = doc.addPage([595, 842]);
    y = 800;
  }
  {
    const hz = r.horizon;
    const hv = hz.elevationDeg.filter((v): v is number => v != null);
    const hlo = Math.floor(Math.min(...hv, 0));
    const hhi = Math.ceil(Math.max(...hv, 1));
    const hy0 = y - H;
    page.drawRectangle({ x: x0, y: hy0, width: W, height: H, borderColor: rgb(0.867, 0.839, 0.788), borderWidth: 0.6 });
    const ax = (az: number) => x0 + (az / 360) * W;
    const ay = (v: number) => hy0 + ((v - hlo) / (hhi - hlo)) * H;
    let prev: [number, number] | null = null;
    hz.azimuthsDeg.forEach((az, i) => {
      const v = hz.elevationDeg[i];
      if (v == null) return void (prev = null);
      const pt: [number, number] = [ax(az), ay(v)];
      if (prev) page.drawLine({ start: { x: prev[0], y: prev[1] }, end: { x: pt[0], y: pt[1] }, thickness: 0.9, color: hz.status[i] === "truncated" ? rgb(0.6, 0.58, 0.55) : ink });
      prev = pt;
    });
    if (hlo < 0 && hhi > 0) page.drawLine({ start: { x: x0, y: ay(0) }, end: { x: x0 + W, y: ay(0) }, thickness: 0.4, color: rgb(0.796, 0.761, 0.694), dashArray: [2, 2] });
    for (const [az, l] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"], [360, "N"]] as const) page.drawText(l, { x: ax(az) - 2, y: hy0 - 9, size: 7, font, color: mute });
    page.drawText(`${hhi}°`, { x: x0 - 22, y: hy0 + H - 6, size: 7, font, color: mute });
    page.drawText(`${hlo}°`, { x: x0 - 22, y: hy0, size: 7, font, color: mute });
    y = hy0 - 22;
    text(`Maximum terrain elevation angle per ${String(hz.params.azimuthStepDeg)}° azimuth bin out to ${Number(hz.params.maxRadiusM) / 1000} km. Grey segments: ray leaves DEM coverage (${hz.truncatedRayCount} rays).`, { size: 7.5, color: mute });
  }

  const ivTable = (title: string, ivs: AnalysisResult["sun"]["visibleIntervals"]) => {
    h2(title);
    if (!ivs.length) return text("None in the analysed interval.", { size: 9, color: mute });
    for (const iv of ivs.slice(0, 40)) {
      text(`${iv.kind.padEnd(8)} ${iv.startUtc}  ->  ${iv.endUtc}   ${fmtH(iv.durationS).padStart(9)}${iv.startRefined && iv.endRefined ? "" : "  (bounded by analysis interval)"}`, { size: 8, f: mono });
    }
    if (ivs.length > 40) text(`... ${ivs.length - 40} more in the CSV/JSON exports`, { size: 8, color: mute });
  };
  ivTable("Direct-sunlight intervals", r.sun.visibleIntervals);
  ivTable("Geometric DTE windows", r.earth.dteWindows);

  h2("Provenance");
  kv("Ephemeris", `${r.provenance.ephemerisSource}, ${r.provenance.aberrationCorrection}`);
  kv("Body-fixed frame", r.provenance.bodyFixedFrame);
  kv("Kernel manifest", r.provenance.kernelManifestId);
  for (const k of r.provenance.kernelFiles) kv(`  ${k.fileName}`, k.sha256.slice(0, 32) + "...");
  kv("Terrain product", `${r.provenance.terrainProductId} (${String(r.provenance.terrainProduct.pixelSpacingM)} m)`);
  kv("Terrain SHA-256", String(r.provenance.terrainProduct.sha256 ?? "").slice(0, 48));
  kv("Method / software", `${r.provenance.methodVersion} / ${r.provenance.softwareVersion}`);
  kv("Horizon", `${r.horizon.params.azimuthStepDeg}° bins to ${Number(r.horizon.params.maxRadiusM) / 1000} km; ${r.horizon.truncatedRayCount} truncated rays`);
  h2("Scientific confidence per metric");
  kv("Sun / Earth az-el", "CALCULATED - NAIF SPICE spkcpo (DE440s, MOON_PA_DE440 via MOON_ME)");
  kv("Terrain horizon / blocking", `CALCULATED - LOLA ${r.provenance.terrainProductId}${r.horizon.truncatedRayCount ? ` (${r.horizon.truncatedRayCount} rays truncated -> UNKNOWN where undecidable)` : ""}`);
  kv("Sunlight / DTE durations", `CALCULATED - sampled every ${r.timeRange.sampleStepSeconds} s, boundaries refined to ${r.timeRange.refineToleranceSeconds} s`);
  kv("Unknown periods", r.sun.unknownSeconds + r.earth.unknownSeconds > 0 ? "UNCERTAIN - reported separately, never counted as visible" : "none");
  kv("Panel energy", r.power.energyWh == null ? "UNAVAILABLE - no panel assumptions" : "MODELLED - idealized, stated assumptions");
  kv("Validation", "SPICE geometry cross-checked against JPL Horizons observer tables (science test suite; live check available in app)");

  h2("Limitations and warnings");
  for (const w of [...r.warnings, "240 m DEM spacing smooths near-field terrain; local hazards are not assessed.", "Panel energy (if shown) is idealized: thermal, dust, storage and electrical losses beyond the derating factor are not modelled.", "No RF link budget is computed."]) text(`- ${w}`, { size: 8.5 });
  return doc.save();
}


/* ----------------------------- comparison reports ----------------------------- */
export type ComparisonReportContext = { comparisonId: string; generatedAtUtc: string; appVersion: string; criteria: Record<string, unknown> };
type CmpRow = {
  label: string; siteLabel: string; windowLabel: string; gateStatus: string; rank: number | null; tiedWith: string[]; pareto: boolean; score100: number | null;
  breakdown: { sun: number; dte: number; energy: number } | null; recommendation: { level: string; reason: string };
  metrics: { sunHours: number; sunFraction: number; dteHours: number; dteFraction: number; unknownFraction: number; quality: string };
  gates: { gate: string; result: string; value: number; threshold: number; units: string }[];
};
type CmpResult = { rows: CmpRow[]; tradeoffs: { text: string }[]; summary: string; rankingWithheld: string | null; compatibility: { compatible: boolean; issues: string[] }; method: Record<string, unknown> };

export function buildComparisonJson(res: CmpResult, c: ComparisonReportContext): string {
  return JSON.stringify({ schema: "moonnav.comparison-report.v1", report: { ...c, disclaimer: DISCLAIMER }, comparison: res }, null, 2);
}

export async function buildComparisonPdf(res: CmpResult, c: ComparisonReportContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`MoonNav comparison report - ${c.comparisonId}`);
  doc.setProducer(`MoonNav ${c.appVersion}`);
  doc.setCreationDate(new Date(c.generatedAtUtc));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;
  const ink = rgb(0.161, 0.153, 0.133);
  const mute = rgb(0.408, 0.388, 0.353);
  const clean = (s: string) => s.replace(/[^\x20-\x7E°]/g, "-");
  const text = (s: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const size = o.size ?? 9.5;
    const f = o.f ?? font;
    let line = "";
    const flush = () => {
      if (y < 60) {
        page = doc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line, { x: 48, y, size, font: f, color: o.color ?? ink });
      y -= size * 1.45;
      line = "";
    };
    for (const w of clean(s).split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > 499 && line) {
        flush();
        line = w;
      } else line = t;
    }
    if (line) flush();
  };
  const h2 = (s: string) => {
    y -= 6;
    text(s, { size: 12, f: bold });
    y -= 2;
  };
  text("MoonNav - Lunar Landing Site Navigator", { size: 9, color: mute });
  text("Site / date comparison report", { size: 18, f: bold });
  text(`Comparison ${c.comparisonId}   |   Generated ${c.generatedAtUtc}   |   MoonNav ${c.appVersion}`, { size: 8.5, color: mute });
  y -= 4;
  text(DISCLAIMER, { size: 8, color: mute });
  text("Simplified MoonNav mission suitability score - not an official NASA mission feasibility rating.", { size: 8, f: bold, color: mute });
  h2("Recommendation");
  text(res.summary);
  if (res.rankingWithheld) text(res.rankingWithheld, { color: mute });
  if (!res.compatibility.compatible) for (const i of res.compatibility.issues) text(`- ${i}`, { size: 8.5, color: mute });
  h2("Criteria");
  text(JSON.stringify(c.criteria), { size: 8.5 });
  h2("Scenarios");
  for (const r of res.rows) {
    text(`${r.label}  (${r.siteLabel}, window ${r.windowLabel} UTC)`, { f: bold, size: 10 });
    text(`Sunlight ${r.metrics.sunHours.toFixed(2)} h (${(r.metrics.sunFraction * 100).toFixed(1)}%)  |  Geometric DTE ${r.metrics.dteHours.toFixed(2)} h (${(r.metrics.dteFraction * 100).toFixed(1)}%)  |  unknown ${(r.metrics.unknownFraction * 100).toFixed(1)}%  |  quality ${r.metrics.quality}`, { size: 8.5 });
    text(`Hard constraints: ${r.gates.length ? r.gates.map((g) => `${g.gate} ${g.result}`).join("; ") : "none set"}  ->  ${r.gateStatus.toUpperCase()}`, { size: 8.5 });
    text(`Score ${r.score100 == null ? "n/a" : r.score100.toFixed(1)}/100${r.breakdown ? ` (sunlight ${r.breakdown.sun.toFixed(1)} + DTE ${r.breakdown.dte.toFixed(1)}${r.breakdown.energy ? ` + energy ${r.breakdown.energy.toFixed(1)}` : ""})` : ""}  |  rank ${r.rank ?? "-"}${r.tiedWith.length ? ` (tie with ${r.tiedWith.join(", ")})` : ""}  |  ${r.pareto ? "Pareto-optimal" : "not Pareto-optimal"}`, { size: 8.5 });
    text(`${r.recommendation.level.toUpperCase()}: ${r.recommendation.reason}`, { size: 8.5, color: mute });
    y -= 4;
  }
  h2("Trade-offs");
  if (!res.tradeoffs.length) text("No opposing strengths between the compared scenarios.", { color: mute });
  for (const t of res.tradeoffs) text(`- ${t.text}`, { size: 9 });
  h2("Method");
  for (const [k, v] of Object.entries(res.method)) text(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`, { size: 8.5 });
  return doc.save();
}
