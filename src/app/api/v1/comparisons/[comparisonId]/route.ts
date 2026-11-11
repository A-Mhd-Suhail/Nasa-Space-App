import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { assertWorkspaceAccess, requireApiUser } from "@/lib/dal";
import { ApiError, json, route } from "@/lib/http";
import { buildComparisonJson, buildComparisonPdf } from "@/lib/report-builders";
import { APP_VERSION } from "@/lib/services";

/** GET a stored comparison; `?format=pdf|json` downloads it as a comparison report. */
export const GET = route<{ params: Promise<{ comparisonId: string }> }>(async (req, ctx) => {
  const u = await requireApiUser();
  const { comparisonId } = await ctx.params;
  const [c] = await db().select().from(schema.comparisons).where(eq(schema.comparisons.id, comparisonId)).limit(1);
  if (!c) throw new ApiError(404, "not_found", "Comparison not found");
  await assertWorkspaceAccess(u, c.workspaceId, "viewer");
  const format = new URL(req.url).searchParams.get("format");
  const rctx = { comparisonId: c.id, generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, "Z"), appVersion: APP_VERSION, criteria: c.criteria };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored JSON result produced by lib/compare
  const res = c.result as any;
  if (format === "json") {
    return new NextResponse(buildComparisonJson(res, rctx), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="moonnav-${c.id}.json"` } });
  }
  if (format === "pdf") {
    const bytes = await buildComparisonPdf(res, rctx);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="moonnav-${c.id}.pdf"` } });
  }
  return json({ comparisonId: c.id, criteria: c.criteria, analysisIds: c.analysisIds, createdAt: c.createdAt, ...res });
});
