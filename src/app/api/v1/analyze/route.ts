import { rateLimit } from "@/lib/dal";
import { clientIp, json, readJson, route } from "@/lib/http";
import { quickAnalysis, quickInput } from "@/lib/quick-analysis";

/**
 * Full mission analysis for one site + UTC start + interval (synchronous, not persisted).
 * Returns Sun/Earth geometry, terrain horizon, sunlight intervals, geometric DTE windows,
 * quality and provenance. Save a scenario for stored, reproducible results.
 */
export const POST = route(async (req, _ctx, requestId) => {
  await rateLimit(`analyze:${clientIp(req) ?? "anon"}`, 20, 60);
  const input = quickInput.parse(await readJson(req));
  const r = await quickAnalysis(input, requestId);
  return json({ persisted: false, result: r });
});
