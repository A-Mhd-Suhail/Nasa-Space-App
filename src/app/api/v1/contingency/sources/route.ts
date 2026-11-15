import { rateLimit } from "@/lib/dal";
import { clientIp, json, route } from "@/lib/http";
import { collectSources, type SourceRecord } from "@/lib/contingency-sources";

let cache: { at: number; data: SourceRecord[] } | null = null;
const TTL_MS = 30 * 60_000;

/** Live provenance checks for QuickMap, NASA Moon Trek, JPL Horizons and the CSA page (public, cached 30 minutes; refreshes are rate limited). */
export const GET = route(async (req) => {
  const fresh = cache && Date.now() - cache.at < TTL_MS;
  // Serving the cached result is cheap; only a refresh (several outbound requests) is rate limited.
  if (!fresh) {
    await rateLimit(`contingency-sources:${clientIp(req) ?? "anon"}`, 6, 60);
    cache = { at: Date.now(), data: await collectSources() };
  }
  return json({ sources: cache!.data, cachedAtUtc: new Date(cache!.at).toISOString(), cached: !!fresh });
});
export const maxDuration = 60;
