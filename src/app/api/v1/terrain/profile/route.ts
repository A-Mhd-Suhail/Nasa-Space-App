import { z } from "zod";
import { clientIp, json, route } from "@/lib/http";
import { rateLimit } from "@/lib/dal";
import { science } from "@/lib/science";

const q = z.object({ lat: z.coerce.number().min(-90).max(-75), lon: z.coerce.number().min(-360).max(360), azimuth: z.coerce.number().min(0).lt(360), maxM: z.coerce.number().min(1000).max(300_000).default(50_000) });

/** Elevation profile along one azimuth (public, rate limited). */
export const GET = route(async (req, _ctx, requestId) => {
  await rateLimit(`profile:${clientIp(req) ?? "anon"}`, 60, 60);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await science(`/v1/terrain/profile?lat=${p.lat}&lon=${p.lon}&azimuth=${p.azimuth}&max_m=${p.maxM}`, { requestId, timeoutMs: 10_000 }));
});
