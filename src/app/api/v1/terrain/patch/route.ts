import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { science } from "@/lib/science";

const q = z.object({ lat: z.coerce.number().min(-90).max(-75), lon: z.coerce.number().min(-360).max(360) });

/** Local terrain patch for the 3D view (signed-in users). */
export const GET = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`patch:${u.id}`, 30, 60);
  const { lat, lon } = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await science(`/v1/terrain/patch?lat=${lat}&lon=${lon}&half_size_m=20000&grid=161`, { requestId, timeoutMs: 15_000 }));
});
