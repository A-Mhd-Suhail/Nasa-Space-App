import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { getAnalysis, loadResult } from "@/lib/services";

const q = z.object({ maxPoints: z.coerce.number().int().min(50).max(20_000).default(2000), full: z.enum(["0", "1"]).default("0") });

/** Downsampled series for charts (full data stays available for export). */
export const GET = route<{ params: Promise<{ analysisId: string }> }>(async (req, { params }) => {
  const u = await requireApiUser();
  const { analysisId } = await params;
  const { maxPoints, full } = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { analysis } = await getAnalysis(u, analysisId);
  const result = await loadResult(analysis);
  const rows = result.timeseries;
  const stride = Math.max(1, Math.ceil(rows.length / maxPoints));
  const series = stride === 1 ? rows : rows.filter((_, i) => i % stride === 0 || i === rows.length - 1);
  if (full === "1") return json({ result: { ...result, timeseries: series }, downsampleStride: stride, totalPoints: rows.length });
  return json({ timeseries: series, downsampleStride: stride, totalPoints: rows.length });
});
