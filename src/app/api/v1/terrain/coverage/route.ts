import { z } from "zod";
import { rateLimit } from "@/lib/dal";
import { clientIp, json, route } from "@/lib/http";
import { science } from "@/lib/science";

const q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-360).max(360), radiusM: z.coerce.number().min(50).max(60_000).default(2000) });

/** High-resolution LOLA tile availability around a point: cached vs to-download (no download happens). */
export const GET = route(async (req, _ctx, requestId) => {
  await rateLimit(`coverage:${clientIp(req) ?? "anon"}`, 120, 60);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await science(`/v1/terrain/coverage?lat=${p.lat}&lon=${p.lon}&radius_m=${p.radiusM}`, { requestId, timeoutMs: 10_000 }));
});
