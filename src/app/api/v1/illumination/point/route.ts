import { z } from "zod";
import { rateLimit } from "@/lib/dal";
import { clientIp, json, route } from "@/lib/http";
import { science } from "@/lib/science";

const q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-360).max(360) });

/** Permanent-shadow flag and 18.6-year average Sun/Earth visibility (LOLA team products, PGDA 69). Public. */
export const GET = route(async (req, _ctx, requestId) => {
  await rateLimit(`illum:${clientIp(req) ?? "anon"}`, 120, 60);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await science(`/v1/illumination/point?lat=${p.lat}&lon=${p.lon}`, { requestId, timeoutMs: 8000 }));
});
