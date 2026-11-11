import "server-only";
import { rateLimit } from "./dal";
import { clientIp, json, readJson, route } from "./http";
import { science } from "./science";

/**
 * Thin authenticated proxies to the science service's screening endpoints. The science service
 * validates every field (pydantic) and returns 422 with field errors; requests are rate-limited per
 * IP because the first call at a new site may fetch high-resolution LOLA tiles from NASA PDS.
 */
export function screeningRoute(path: string, key: string, perMinute: number) {
  return route(async (req, _ctx, requestId) => {
    await rateLimit(`${key}:${clientIp(req) ?? "anon"}`, perMinute, 60);
    const body = await readJson(req);
    return json(await science(path, { method: "POST", body, requestId, timeoutMs: 280_000 }));
  });
}
