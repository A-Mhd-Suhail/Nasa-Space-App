import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { science } from "@/lib/science";

const body = z.object({
  frequencyHz: z.number().min(1e8).max(1e11),
  eirpDbw: z.number().min(-30).max(90),
  receiverGOverTDbK: z.number().min(-50).max(80),
  dataRateBps: z.number().min(1).max(1e10),
  requiredEbN0Db: z.number().min(-5).max(40),
  otherLossesDb: z.number().min(0).max(60).default(0),
  distancesKm: z.array(z.number().min(300_000).max(500_000)).min(1).max(5000),
});

/** Optional illustrative link margin from user-supplied values (see science/moonnav_science/link_budget.py). Signed-in users only. */
export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`linkbudget:${u.id}`, 30, 60);
  const b = body.parse(await readJson(req));
  return json(await science("/v1/link-budget", { method: "POST", body: b, requestId, timeoutMs: 15_000 }));
});
