import { z } from "zod";
import { rateLimit } from "@/lib/dal";
import { clientIp, json, route } from "@/lib/http";
import { science } from "@/lib/science";

const q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-360).max(360) });

/** Public coordinate inspection (rate limited). */
export const GET = route(async (req, _ctx, requestId) => {
  await rateLimit(`terrain-point:${clientIp(req) ?? "anon"}`, 120, 60);
  const { lat, lon } = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const data = await science(`/v1/terrain/point?lat=${lat}&lon=${lon}`, { requestId, timeoutMs: 8000 });
  return json(data);
});
