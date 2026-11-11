import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { science } from "@/lib/science";

const body = z.object({ latitudeDeg: z.number().min(-90).max(-75), longitudeEastDeg: z.number().min(-360).max(360), observerHeightM: z.number().min(0).max(100).default(2) });

/** Terrain horizon profile for a coordinate (signed-in users; expensive -> rate limited). */
export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`horizon:${u.id}`, 30, 60);
  const b = body.parse(await readJson(req));
  return json(await science("/v1/horizon", { method: "POST", body: b, requestId, timeoutMs: 20_000 }));
});
